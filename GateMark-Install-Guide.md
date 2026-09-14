# GateMark — Pre-Launch Review & On-Site Installation Guide

This is the one document your Peshawar contact needs on install day: what
to bring, what order to do things in, and exactly what to type. Part 1 is
my review of the codebase before you ship it. Parts 2–5 are the actual
runbook.

---

## Part 1 — Code review ("the fat pass")

I read through the backend hooks, migrations, deployment scripts, and the
mobile app's core logic (auth, redemption, offline queue, kiosk mode,
server discovery). Short version: **the engineering is solid.** The
redemption endpoint is properly transactional and idempotent, the
conflict-vs-duplicate detection is correctly wired end-to-end, backups/
auto-restart/kiosk-mode/remote-access are all implemented and were
previously verified on real hardware per the README's own notes. I didn't
find any logic bugs in the redemption, undo, override, or conflict-resolve
flows.

Two things below are worth fixing or deciding before this goes in front of
a paying client, and a couple more are just worth knowing about.

### 1. Done: production Android builds now sign with a real release keystore

`mobile/android/app/build.gradle`'s `release` build type used to point at
`signingConfigs.debug` — the same well-known, publicly-documented debug
key every Android project ships with. **This is fixed now:**

- A real keystore exists at `mobile/android/app/gatemark-release.keystore`
  (RSA 2048, alias `gatemark`, valid ~27 years).
- `build.gradle`'s `release` config now reads its credentials from
  `mobile/android/keystore.properties` at build time instead of
  hardcoding anything — that file (and the keystore itself) are
  git-ignored and were sent to you separately from this document. **Store
  both somewhere durable outside the repo before you do anything else** —
  lose them and every future update needs a from-scratch resideload of
  every phone, since `expo-updates` requires the installed app's signature
  to match the new build's.
- See README.md's new **"Real release keystore"** section (under "EAS
  Build & signing") for the full story, including one important catch:
  **if your production builds go through `eas build` (cloud) rather than
  a local Gradle build, you also need to register this exact keystore
  with EAS once** via `eas credentials` (choose "Set up a new keystore" →
  upload the existing file, don't let it generate a fresh one) — otherwise
  the cloud build either can't find the credentials at all or mints a
  *different* key than the one now sitting in the repo.
- **Update: verified.** A local Gradle release build
  (`gradlew assembleRelease`) now completes and produces a real,
  correctly-signed APK — confirmed by comparing the keystore's own
  fingerprint (`keytool -list -v -keystore gatemark-release.keystore
  -alias gatemark`) against the built APK's, which matched exactly.
  One correction to how to check that: **use `apksigner verify
  --print-certs`, not `keytool -printcert -jarfile`** — `keytool` only
  understands old-style JAR signing and reports a correctly-signed APK
  as "Not a signed jar file," since modern Android release builds sign
  with Signature Scheme v2/v3, which `keytool` doesn't know how to read.
  `apksigner` ships in the Android SDK's `build-tools/<version>/`
  folder. What's still unverified: an actual `eas build` (cloud) run —
  the local Gradle path above is confirmed working, but the EAS-specific
  credentials-registration step hasn't been exercised for real.

### 2. Bootstrapping gap: there's no default login for anyone

No migration seeds a first staff account, so the moment PocketBase starts
fresh, the `staff` collection is empty — nobody can log into the web app
or the phones yet, and the web app itself is the only place to create
staff, which needs... a superadmin already logged in. This isn't a bug,
just an undocumented first step. You break the chicken-and-egg problem
through PocketBase's own admin dashboard (separate superuser account,
`http://127.0.0.1:8090/_/`), where you manually add one `staff` row with
`role = superadmin` — see step 7 in Part 3 below. After that, everything
else (more staff, counters) gets created through the actual GateMark web
app like normal.

### 3. Worth confirming with the client out loud: how ticket validity actually works

The system doesn't check scanned codes against a pre-issued list of real
tickets — the **first** scan of any QR code it's never seen creates that
ticket as "valid" and redeems it on the spot; only a *second* scan of the
same code gets rejected as a duplicate. That means the system's job is
"catch reuse," not "verify this ticket was legitimately issued" — a
photocopied or guessed code still gets in once. That's a deliberate,
documented design choice (GateMark never receives the venue's own ticket
data), and it's almost certainly fine if tickets are physical stubs the
venue controls printing of — but it's the kind of assumption worth saying
out loud to the client once before day one, not something they should
discover from a support call.

### 4. Minor / already-accepted, no action needed

- **No PIN rate-limiting** beyond PocketBase's own defaults. Already
  flagged in the code as an accepted trade-off for a LAN-only system where
  an attacker would need to already be on-site's Wi-Fi.
- **Plain HTTP, not HTTPS**, on the LAN. Same deal — already documented as
  an accepted trade-off in the README.
- **Duplicate camera/audio permission entries** in `mobile/app.json`'s
  `android.permissions` array (each one listed twice). Harmless — Android
  dedupes them — just untidy. Not worth a special build cycle on its own,
  fold it in next time you touch that file.
- **Two on-site tests the README itself flags as still open**: an actual
  reboot test for the PocketBase Windows service, and an actual reboot
  test for RustDesk. Both are now trivial to check with the scripts
  already in the repo — do them on install day rather than leaving them
  open (see Part 3, steps 12–13).

---

## Part 2 — Before your guy travels to Peshawar

The venue almost certainly doesn't have reliable internet, so prepare
everything ahead of time and hand it over on a USB drive rather than
planning to download things on-site.

**Build these on your own machine first:**

- [ ] Web superadmin build: `cd web && npm install && npm run build` →
      you'll copy the `dist/` contents into `backend/pb_public/` on-site
      (or copy it pre-merged, whichever's easier to hand off).
- [ ] **If building via `eas build` (cloud):** register the real release
      keystore with EAS first — `eas credentials` → Android → "Set up a
      new keystore" → upload `mobile/android/app/gatemark-release.keystore`
      (don't let it generate a new one). Skip this if you're building
      locally instead, since a local Gradle build already picks up the
      committed `keystore.properties` on its own.
- [ ] Production Android APK: `cd mobile && eas build --platform android
      --profile production` — needs you logged into the `fazy221` Expo/EAS
      account (or your own, if you've since repointed `app.json`/`eas.json`
      to a different owner and project ID). Download the resulting `.apk`
      once the cloud build finishes.
- [ ] `pocketbase.exe` — grab the matching Windows build from PocketBase's
      releases page; it's excluded from the project zip on purpose.
- [ ] `nssm.exe` — from <https://nssm.cc/download>.
- [ ] RustDesk installer for Windows, from <https://rustdesk.com>.
- [ ] Two small USB drives for the offsite backup rotation (Part 2 below),
      labeled "GateMark Backup A" / "B".
- [ ] The whole `gatemark/` project folder (backend hooks/migrations,
      the built web `dist/`, the APK) copied onto a USB drive.
- [ ] **`gatemark-release.keystore` and `keystore.properties` backed up
      somewhere durable that isn't this USB drive** — a password manager
      or a second, separate location. This is the one file in this whole
      list that can't be regenerated if lost.

**Decided:**

- **Offsite backup destination — a dedicated rotating USB drive, not a
  cloud folder.** A family park is very unlikely to have internet reliable
  enough on that laptop to trust a synced cloud folder as the *actual*
  offsite copy (see README: this whole system is built LAN-only specifically
  because Wi-Fi/grid power can't be relied on there — the same logic
  applies to internet access for backups). Buy two small USB drives
  (16–32GB is far more than the SQLite backup zips will ever need),
  label them "GateMark Backup A" / "B":
  - Leave drive A plugged into the laptop permanently. Point
    `backup-offsite.ps1 -Destination` at its drive letter (see step 11
    below) so every night's backup lands on it automatically.
  - Have your Peshawar contact swap it for drive B roughly weekly, taking
    drive A off-site (his own bag/office, not the park) each time. This is
    what actually protects against the laptop itself being stolen,
    damaged, or destroyed — a drive that never leaves the laptop only
    protects against database corruption, not the whole machine going
    missing.
  - This is a recurring small chore for your contact, not a one-time
    setup step — worth being explicit with him that it's ongoing, not
    "do it once and forget it."
- **Who holds credentials — you and your Peshawar contact, no one else.**
  Set both the RustDesk permanent password and the PocketBase superuser
  email/password on-site (steps 5 and 12 below), and make sure he keeps
  his own copy rather than only you having it — if he's the one who'll
  field a "the scanner's not working" call from venue staff, he needs to
  be able to get in without waiting on you. Don't share either with venue
  staff themselves; the PocketBase superuser account and RustDesk are
  maintenance access, not something a counter staff member or even the
  venue manager needs day-to-day — they only ever need their own PIN and
  the superadmin web login you set up in step 10.

---

## Part 3 — Windows 10 laptop (the venue's on-site server)

Do these in order — later steps assume earlier ones are done.

1. **Prep the laptop.** Set the power plan to never sleep and never turn
   off the display while plugged in (`Settings → System → Power & battery`)
   — this machine has to stay awake and on Wi-Fi through every shift.
   Confirm it auto-connects to the venue's Wi-Fi network.

2. **Copy the project.** Copy the `gatemark/` folder from the USB drive to
   `C:\gatemark\` on the laptop.

3. **Drop in the binaries.** Place `pocketbase.exe` and `nssm.exe` into
   `C:\gatemark\backend\`, alongside the existing scripts.

4. **Deploy the web build.** Copy the contents of the pre-built `web/dist/`
   folder into `C:\gatemark\backend\pb_public\`.

5. **First manual run — confirm it starts.** Open PowerShell:
   ```powershell
   cd C:\gatemark\backend
   .\pocketbase.exe serve --http=0.0.0.0:8090
   ```
   Leave this running for now. In a second PowerShell window, create the
   PocketBase superuser (this is separate from the app's own staff
   accounts — it's PocketBase's own admin login):
   ```powershell
   cd C:\gatemark\backend
   .\pocketbase.exe superuser upsert admin@example.com <a-real-password>
   ```
   Browse to `http://127.0.0.1:8090/_/` and confirm you can log in and see
   collections (`staff`, `tickets`, `counters`, etc.).

6. **Note the laptop's LAN IP.** Run `ipconfig`, find the Wi-Fi adapter's
   IPv4 address (e.g. `192.168.1.50`). Write it down — you'll need it for
   every phone's setup screen in Part 4.

7. **Bootstrap the first superadmin.** This is the one step nothing
   automates. In the PocketBase admin dashboard (`http://127.0.0.1:8090/_/`,
   logged in as the superuser from step 5) go to **Collections → staff →
   New record** and create:
   - `name`: whatever you want displayed (e.g. "Admin")
   - `username`: the login name typed on the PIN pad (e.g. `admin`)
   - `password`: a PIN, minimum 4 characters
   - `role`: `superadmin`
   - `active`: checked

   This is the only staff account you ever create through the PocketBase
   dashboard directly — every account after this gets created through
   GateMark's own Staff screen once you're logged in as this superadmin.

8. **Stop the manual instance.** `Ctrl+C` in the terminal from step 5.

9. **Install PocketBase as a Windows service** (PowerShell as
   Administrator):
   ```powershell
   cd C:\gatemark\backend
   .\install-service.ps1
   ```
   This now also opens the LAN firewall for you — previous versions of
   this guide had a separate manual `New-NetFirewallRule` step here,
   scoped only to the Private network profile. That turned out to be a
   real gap: a venue's Wi-Fi can get classified "Public" by Windows, and
   Public's firewall carries a master override that silently blocks
   inbound traffic even with a matching allow rule in place. The script
   now handles both the rule and that override automatically. If this
   laptop is ever domain-joined/IT-managed and Group Policy locks
   firewall settings, the script prints a warning instead of failing —
   in that case, ask IT to allow inbound TCP 8090, or re-run with
   `-SkipFirewall` to skip the attempt entirely.

   Verify: `Get-Service GateMarkServer` should show `Running`, and
   `http://127.0.0.1:8090/api/health` should load in a browser on the
   laptop **and** `http://<laptop-IP>:8090/api/health` should load from
   your phone on the same Wi-Fi — the second check is the one that
   actually confirms the firewall step worked, not just that the service
   is running.

10. **Log into the web app and finish setup.** Browse to
    `http://127.0.0.1:8090/` (or `http://<laptop-IP>:8090/` from another
    device on the same network), log in with the superadmin account from
    step 7, and use the **Staff** and **Counters** screens to create:
    - one `counter_staff` PIN account per staff member who'll be scanning
    - one `counters` row per physical counter/gate (e.g. "East Gate",
      "Main Entrance") — these are what each phone gets assigned to next.

11. **Set up offsite backups.** The daily local backup (4am, keeps 14
    days) is already automatic — nothing to do there. Plug in USB drive
    "A" from Part 2's two-drive rotation, note its drive letter (e.g.
    `E:\`), and wire the nightly copy to it:
    ```powershell
    schtasks /Create /TN "GateMark Offsite Backup" /SC DAILY /ST 04:15 `
      /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"C:\gatemark\backend\backup-offsite.ps1`" -Destination `"E:\GateMarkBackups`"" `
      /RL LIMITED
    ```
    Leave drive A plugged in. Remind your contact this only works if the
    drive letter stays the same after a reboot — worth checking once after
    the reboot test in step 13, and worth him glancing at
    `backend/backup-offsite.log` the first few times the weekly drive-swap
    happens, in case the drive letter shifted.

12. **Install RustDesk for remote support.** Install it, open
    **Settings → Security → Unattended Access** and set a permanent
    password, then click **Install to System** (or run
    `rustdesk.exe --install` from an elevated prompt). Confirm it actually
    took:
    ```powershell
    cd C:\gatemark\backend
    .\verify-remote-access.ps1
    ```
    It should report PASS for registered/auto-start/running. Write the
    permanent password down somewhere secure — this is how you'll reach
    the laptop later without another trip.

13. **Reboot the laptop once, fully, before you leave.** After it comes
    back up, confirm without touching anything: `http://127.0.0.1:8090/api/health`
    loads, `.\verify-remote-access.ps1` still passes, and you can reach it
    over RustDesk from your own machine. This closes out the two "still
    needs an on-site test" items from the README.

---

## Part 4 — Staff Android phones

Repeat steps 3–8 for every counter device.

1. **Get the APK onto the phones.** Copy the production `.apk` (built in
   Part 2) onto each phone via USB, a shared drive, or a messaging app —
   whatever's easiest given the venue's actual connectivity.

2. **Allow the install source.** On each phone: `Settings → Apps → Special
   app access → Install unknown apps`, and allow it for whichever app you
   used to open the file (Files, WhatsApp, etc.).

3. **Install the APK.** Tap it, confirm the install prompt.

4. **Open GateMark and grant camera access** when prompted — needed for
   QR scanning.

5. **Enter the server address.** On the first-launch setup screen, either
   type `http://<laptop-LAN-IP>:8090` (the IP from Part 3, step 6) or tap
   **Find server automatically** while the phone's on the same Wi-Fi as
   the laptop.

6. **Assign this device to a counter.** Pick from the counters you created
   in Part 3, step 10 — this is per-device, so double check you're not
   assigning two phones to the same counter by mistake.

7. **Log in** with one of the staff PIN accounts from Part 3, step 10.

8. **Confirm kiosk mode engaged.** The app should pin itself to the
   screen automatically (no Home button, no notification shade). Try the
   Back+Recents gesture — it'll briefly unpin, but reopening the app
   should re-pin it. This is expected: it's screen pinning, not a full
   device lock, so it stops a casual swipe-away, not a determined attempt
   to leave the app.

9. **Do one offline test per device**, right here, before moving to the
   next phone: turn on Airplane Mode, scan a code, confirm you see a
   "pending sync" state, turn Wi-Fi back on, confirm it clears and shows
   the correct result.

10. **Tell the client, privately, how to get out of kiosk mode for
    maintenance** — the "Exit kiosk mode" toggle lives in the app's
    Settings screen. Don't put this in front of counter staff; it should
    stay something only whoever's responsible for the devices knows.

---

## Part 5 — Go-live checklist, ideally done together with the client

- [ ] Scan the same code twice on one device — second scan should show
      "already redeemed," not go through again.
- [ ] Scan on two different devices in quick succession with one offline —
      confirm a real race shows up as a flagged **conflict** in the web
      app's Conflicts queue, not just a silent duplicate.
- [ ] Reboot the Windows laptop once more with everyone watching — confirm
      the whole system (service, web dashboard, phones reconnecting) comes
      back on its own within a minute or two.
- [ ] Walk the client through the **Reports** screen's CSV and PDF export
      once, so they know it exists for reconciliation.
- [ ] Confirm the client (or whoever's responsible) knows where the
      superadmin login lives and isn't only in your head.
- [ ] Confirm you (not just your on-site contact) have the RustDesk
      permanent password stored somewhere durable — this is your only way
      back in without a return trip.

---

## Part 6 — Where things stand

- ✅ Release keystore — generated, wired into the build, documented in
  README.md's new "Real release keystore" section (Part 1, item 1). Just
  make sure it's backed up before your contact travels, and register it
  with EAS via `eas credentials` first if you're building through the
  cloud rather than a local Gradle build.
- ✅ Offsite backup destination — the two-USB-drive rotation above (Part 2).
- ✅ Who holds credentials — you and your Peshawar contact only (Part 2).
- **Still open, and still yours to confirm, not his:** the "any
  never-before-seen QR is valid on first scan" model (Part 1, item 3) —
  say this out loud to the client before day one so it's not a surprise
  later.