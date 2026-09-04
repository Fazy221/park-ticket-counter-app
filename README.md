# GateMark

Offline-first ticket scanning system for a single venue, running entirely
on the local network. Development happens as **one feature per fresh
Claude session**, not one long-running chat, so this file is the running
source of truth for where the project actually is. **Read this whole
section before starting new work** - don't jump straight to the
subsection that sounds like your task.

## Origin & architecture (read this first)

Built from a project plan (not in this repo - ask the user for it if
something below doesn't make sense) whose core decisions are still in
force:

- **Offline-first, LAN-only, no cloud dependency.** Wi-Fi and grid power
  can't be relied on. PocketBase (single Go binary + embedded SQLite)
  runs on-site - by default on the venue's own laptop, not dedicated
  hardware - and every device talks to it over the LAN. Nothing about
  normal operation requires internet.
- **One `staff` auth collection for everyone**, distinguished by `role`
  (`counter_staff` | `superadmin`) - not two separate account systems. A
  future web superadmin logs in exactly the way counter staff do, just
  gated by role.
- **The web superadmin is a static Vite + React + Tailwind build, served
  directly out of PocketBase's `pb_public/`, installed as a PWA on the
  laptop.** No separate web server, no internet-reachable host. Talks to
  PocketBase directly via the JS SDK (not a custom route per screen the
  way mobile does) for anything that's plain CRUD or a live view; custom
  `/api/*` routes still exist for anything needing a transaction or a
  guaranteed audit-trail write (see "The web superadmin (`web/`)" below).
- **A "conflict" is a specific, narrower thing than "any duplicate
  scan."** A `duplicate_attempt` is an ordinary live rejection - staff
  scan an already-used ticket, see "already redeemed" instantly, nothing
  ambiguous happened. A `conflict` is what happens when a device that
  was showing "Pending sync" (queued while offline) reconnects and
  discovers it *lost* a race against another device's earlier sync -
  staff may have already let that customer through on a false-positive
  local read. These need separate handling, and now get it (see below) -
  the mobile queue flags a row `was_offline_pending` the first time a
  sync attempt for it hits a genuine `NetworkError`, and passes that
  through to `/api/redeem` as `was_queued_offline` so a losing sync logs
  `conflict_flagged` instead of a plain `duplicate_attempt`.

## File & folder structure

```
gatemark/
├── README.md               # this file - architecture, status, open items
├── ignore.bat               # builds the AI-upload zip (WinRAR) - see exclusions below
│
├── backend/                 # PocketBase (Go binary + embedded SQLite), runs on-site
│   ├── pb_hooks/             # server-side JS hooks - ALL custom business logic lives here
│   │   ├── auth.pb.js
│   │   ├── redeem.pb.js          # core redemption + idempotency logic
│   │   ├── undo_scan.pb.js
│   │   ├── conflict_resolve.pb.js
│   │   ├── ticket_override.pb.js
│   │   ├── session_log.pb.js
│   │   ├── cleanup.pb.js
│   │   └── public_lists.pb.js
│   ├── pb_migrations/        # schema history, applied in order on server start
│   │   └── (4 migration files, chronological - schema lives here, not in one file)
│   └── pb_public/            # web/dist gets copied here to be served as the superadmin PWA
│                              # (empty in the repo until a web build is deployed)
│
├── mobile/                   # Expo/React Native app for counter staff (Expo Router)
│   ├── app/                   # file-based routes
│   │   ├── index.tsx, login.tsx, setup.tsx, settings.tsx
│   │   ├── _layout.tsx
│   │   └── (app)/              # authenticated routes
│   │       ├── scan.tsx, session-log.tsx, _layout.tsx
│   ├── src/
│   │   ├── components/         # PinPad, ScanResultCard, ManualEntryModal, ConnectivityBadge, StaffPicker
│   │   ├── context/AuthContext.tsx
│   │   ├── hooks/               # useConnectivity, useDeviceConfig, usePendingCount, useServerUrl
│   │   ├── lib/                  # queue.ts (offline queue), db.ts, serverDiscovery.ts, serverConnection.ts,
│   │   │                         # connectivity.ts, api.ts, authTokenCache.ts, bootstrap.ts, deviceConfig.ts, uuid.ts
│   │   └── theme/                # colors.ts, typography.ts
│   ├── assets/                   # icon.png, splash.png, adaptive-icon.png, gen_mark.py (icon-generation script)
│   └── app.json, eas.json, babel.config.js, metro.config.js, tsconfig.json
│
└── web/                       # Vite + React + Tailwind superadmin - built static, served by PocketBase
    ├── public/                 # sw.js, manifest.webmanifest, favicon.svg
    ├── src/
    │   ├── components/          # dialogs (Counter/Staff/Reason/TicketDetail forms), TicketHistory, Layout,
    │   │   └── ui/                # shared primitives: Alert, Badge, Button, Card, Dialog, EmptyState, Input
    │   ├── context/AuthContext.tsx
    │   ├── hooks/                # useLiveList, useOpenConflicts, useTicketStatusCounts
    │   ├── lib/                   # api.ts, pb.ts (PocketBase SDK), pbErrors.ts, pdfReport.ts, csv.ts,
    │   │                          # date.ts, format.ts, slug.ts, types.ts
    │   ├── pages/                 # Dashboard, Tickets, Conflicts, Counters, Staff, Reports, Login
    │   └── App.tsx, main.tsx, index.css
    └── vite.config.ts, tailwind.config.js, tsconfig.json, postcss.config.js
```

**Not in the AI-upload zip** (see `ignore.bat`): `node_modules/`, `.git/`, `.expo/`,
`web/dist/` (build output), `backend/pb_data/` (runtime DB + auto-generated
`types.d.ts`), `backend/pb_data.zip` (backup), `*.db*`, `package-lock.json`
(both apps), `*.tsbuildinfo`, `backend/pb_public/*`, `backend/LICENSE.md` +
`CHANGELOG.md` (PocketBase's own bundled files, not project docs), and
`mobile/assets/*.png` (binary icons). All of it is either generated,
third-party, or a lockfile - none of it is needed to understand or edit the
codebase, and cutting it keeps the zip to roughly a tenth of its raw size.

## Running it locally (VS Code / PowerShell)

Three pieces, three terminals, all running at once - open three PowerShell
panes in VS Code's integrated terminal (terminal panel -> split, or the `+`
dropdown -> "PowerShell") and leave them open for the session. **Start the
backend first** - the web and mobile apps both need a reachable PocketBase
to do anything beyond render an empty screen.

**Prerequisites:** Node.js LTS + npm on PATH, and `pocketbase.exe` already
sitting in `backend/` (it's excluded from git/the AI zip - see above - so
confirm it's actually there; if not, grab the matching version from
PocketBase's releases page).

**Terminal 1 - backend:**

```powershell
cd backend
.\pocketbase.exe serve --http=0.0.0.0:8090
```

- Must be run with `backend/` as the working directory - PocketBase only
  auto-applies `pb_migrations/`/`pb_hooks/` that sit next to the binary's
  own cwd, so running it from anywhere else silently skips every custom
  migration (you'd just see a bare `users` collection and nothing else).
- `--http=0.0.0.0:8090`, not the `127.0.0.1` default - otherwise no phone
  on the LAN can reach it.
- First run creates `pb_data/` and PocketBase's own Admin UI needs a
  **superuser** account (separate from this app's `staff` auth collection)
  to browse collections at `http://127.0.0.1:8090/_/`:
  ```powershell
  .\pocketbase.exe superuser upsert admin@example.com yourpassword
  ```
- One-time firewall rule so phones on the network can actually connect
  (run as Administrator):
  ```powershell
  New-NetFirewallRule -DisplayName "PocketBase 8090" -Direction Inbound -Protocol TCP -LocalPort 8090 -Profile Private -Action Allow
  ```
- Find the laptop's LAN IPv4 for the mobile app's setup screen: `ipconfig`
  -> the Wi-Fi adapter's "IPv4 Address."
- `Ctrl+C` to stop. Don't kill it by matching the process name/pattern in
  a script if another PocketBase instance might be running elsewhere on
  the machine (see the `pkill -f` gotcha under the web section below) -
  Ctrl+C in its own terminal, or `Stop-Process`, is safe.

**Terminal 2 - web superadmin (`web/`):**

```powershell
cd web
npm install
npm run build
Copy-Item .\dist\* ..\backend\pb_public\ -Recurse -Force
```

Then browse to `http://127.0.0.1:8090/` (backend must already be running).
`web/src/lib/pb.ts` talks to PocketBase via `window.location.origin`, so
the app only works correctly when it's loaded *from PocketBase itself* -
`npm run dev` (Vite's own dev server on port 5173) is fine for pure
UI/styling passes, but every PocketBase call from it will fail, since port
5173 isn't port 8090. There's no watch/hot-reload for the real path
currently - re-run the build + `Copy-Item` step and refresh the browser
tab each time you want a change tested against live data.

**Terminal 3 - mobile app (`mobile/`):**

```powershell
cd mobile
npm install
npx expo start
```

- Always `npx expo install <package>` for new dependencies, never plain
  `npm install <package>` - see "The mobile app" section below for why
  plain npm install breaks Metro's module resolution here.
- Scan the QR code with Expo Go on a physical Android phone on the same
  Wi-Fi network as the laptop. Expo Go's camera-scanning reliability
  varies - a dev build (`npx expo run:android` or
  `eas build --profile development`) is more reliable for real testing.
- First launch's setup screen asks for the server address - enter
  `http://<laptop-LAN-IP>:8090` from Terminal 1, or use "Find server
  automatically" (`serverDiscovery.ts`).

## What's actually built vs. the plan

- ✅ **Schema** (`pb_migrations/`) matches the plan's data model exactly,
  including values nothing used at first: `tickets.status` has `void`;
  `ticket_events.event_type` has all six values (`scanned`,
  `duplicate_attempt`, `voided`, `reopened`, `conflict_flagged`,
  `conflict_resolved`); `staff.role` includes `superadmin`; a `note`
  field (500 char) for required override/conflict reasons. A later
  migration (`1740000300_superadmin_web_access.js`) opens
  `listRule`/`viewRule` on `tickets`/`ticket_events` and CRUD (no delete)
  on `staff`/`counters` to `@request.auth.role = "superadmin"` - the only
  schema-adjacent change the web superadmin needed; every write to
  tickets/ticket_events is still custom-hook-only.
- ✅ **Mobile counter app**: PIN login, camera scan + manual entry,
  offline queue (SQLite, per-staff token cache), inline undo (2-min,
  self-service), session log. See "One interpretation call worth
  flagging" below for why undo is inline rather than a separate screen.
- ✅ **Backend**: staff auth, `/api/redeem` (atomic, idempotent,
  conflict-vs-duplicate classification), `/api/undo-scan`,
  `/api/session-log`, public staff-names/counters lookups, hourly cleanup
  cron, `/api/ticket-override` (superadmin void/reopen with required
  reason), `/api/conflict-resolve` (superadmin marks a conflict
  reviewed).
- ✅ **Conflict-detection logic** - closed the gap described above.
  Verified against a real running PocketBase instance, not just read
  through: seeded a genuine two-device race (one live duplicate, one
  flagged `was_queued_offline`) and confirmed `duplicate_attempt` vs.
  `conflict_flagged` land correctly in `ticket_events`.
- ✅ **Web superadmin** (`web/`) - plan section 6, all of it: live
  dashboard (realtime per-counter counts + activity feed), Tickets
  (search, override status with required reason), Conflicts queue
  (derived from the event log, not a stored flag - see the web section
  below), Staff & Counters CRUD (deactivate via `active`, no hard delete
  exposed), Reports (date-range presets + custom range, CSV + PDF
  export). See "The web superadmin (`web/`)" below for the real gotchas
  hit building it.
- ❌ **Design system pass across both apps** - not a *pass* exactly, but
  the web app reused the mobile app's exact color tokens
  (`gatemark.primary` etc. in `web/tailwind.config.js` mirror
  `mobile/src/theme/colors.ts`) rather than picking its own, so the two
  don't visually diverge in the meantime. A real unified pass
  (typography, spacing scale, icon usage) across both is still open -
  this is plan item 6 below.

## What's next (plan's build order, annotated with real status)

1. ~~Schema + atomic redeem + audit log~~ - done.
2. ~~Mobile scan flow + offline queue + manual entry~~ - done, verified
   with a physical device-disconnect test.
3. ~~Conflict-flagging path end-to-end~~ - done, verified against a real
   running instance (see above).
4. ~~Web superadmin~~ - done: auth, staff/counter CRUD, live dashboard,
   ticket override, Conflicts queue. Verified end-to-end in a headless
   browser against a real PocketBase instance, including the actual
   void/reopen and conflict-resolve flows through the UI, not just the
   API. See "The web superadmin (`web/`)" below for real bugs hit and
   fixed during that verification - worth reading before extending this
   app, since a couple are non-obvious PocketBase/SDK gotchas that'll
   bite again on any new screen that queries the same collection twice.
5. ~~Reports + CSV/PDF export~~ - done: date-range presets (Today,
   Yesterday, Last 7/30 days, This month) plus a custom range, a summary
   view (totals by event type, by counter, by staff), a full-detail CSV
   export of the underlying `ticket_events` rows for the range, and a
   roll-up-only PDF (no per-ticket detail - see "The web superadmin"
   below for why). Verified the same way as the rest of the web app: real
   browser, real file downloads captured and checked (CSV content
   diffed against the seeded data, PDF header/size sanity-checked and
   rendered to an image to confirm it isn't garbled).
6. **Design system pass across both apps - not started** as a real pass
   (colors are already shared - see above).
7. **On-site real-conditions test (router on battery, power cut
   mid-shift, concurrent scans across counters) - not done.**

## Deployment hardening - action plan (items 1-2 done, 3-7 not started)

Surfaced while working through how this actually gets installed on a
real venue laptop by someone other than whoever built it, with no
technical person staying on-site afterward - a different question from
"does the app work," and one the plan never covered. Ordered by how
likely each gap is to actually cause an outage, not by how interesting
it is to build. **The underlying architecture call - offline-first,
LAN-only, one laptop as the local server - is not itself the problem**
and shouldn't change; the venue's Wi-Fi/grid power genuinely can't be
relied on, which is exactly why that call was made in the first place
(see "Origin & architecture" above). What's missing is the operational
layer that lets an unattended on-prem system like this survive weeks of
real use instead of one clean demo day - the same layer older
LAN-based POS systems (Aloha, Micros, and plenty of grocery/restaurant
POS still today) eventually grew for the same reason.

1. ~~**The server's LAN IP isn't stable, and every device is hard-pinned
   to it.**~~ **Done** - see "Self-healing server address" under the
   mobile app section below for the actual mechanism. Short version:
   `mobile/src/lib/deviceConfig.ts` stored the server's IP once, at
   setup, and never re-discovered it; the venue's router could hand the
   laptop a different DHCP lease the moment it rebooted, and when it
   did, every counter device broke silently and simultaneously. Devices
   now detect that and re-find the server on their own by scanning the
   local subnet, no manual re-setup needed. **This is a mitigation, not
   a substitute for the network-side fix**: a static DHCP reservation
   for the laptop's MAC address in the venue's router is still the
   right thing to do on-site if possible - the app-side scan is what
   keeps things working in the meantime, or at venues where that's not
   an option.
2. ~~**No backup exists.**~~ **Done** - see "Automatic backups" under
   the backend section below for the actual mechanism. Short version:
   PocketBase's built-in backup cron (`app.settings().backups.cron`) was
   present but unused - nothing in `pb_hooks/` or `pb_migrations/`
   touched it, and every ticket, every audit event, every dollar of
   redemption history lived in one SQLite file on one laptop with no
   copy anywhere. A migration now turns the cron on (daily, local zips
   in `pb_data/backups/`), and a new `backup-offsite.ps1` script copies
   those zips somewhere off the laptop on a schedule. **The local cron
   half is fully automatic; the offsite half still needs a one-time
   on-site decision** - someone has to pick and configure an actual
   `-Destination` (USB drive, network share, synced cloud folder) for
   this specific venue and wire it into a Scheduled Task, the same shape
   as item 3's still-open restart-on-boot task below.
3. **Nothing restarts PocketBase if it stops.** The launch mechanism
   discussed so far is a `.bat` file someone double-clicks. If the
   laptop reboots for any reason (Windows Update, power cut, someone
   bumping the plug), the whole system is down until a human notices
   and manually restarts it. Needs a Windows Scheduled Task set to
   "run at startup," or a small service wrapper (e.g. NSSM), with a
   restart-on-crash policy - not a file that depends on someone
   remembering to click it.
4. **Counter devices are unrestricted, general-purpose Android
   phones.** No kiosk mode, no MDM, nothing stopping a staff member
   from swiping out of the app, changing the Wi-Fi network, or
   uninstalling it. "Device configuration survives a shift" currently
   depends entirely on nobody touching settings. Worth locking each
   device into single-app kiosk mode (Android's built-in Screen
   Pinning at minimum; a proper MDM/Knox-style lock if this scales
   past a couple of devices).
5. **Remote-access software needs to survive a reboot, not just the
   initial install.** Whatever remote-desktop tool (AnyDesk/TeamViewer/
   Chrome Remote Desktop) gets installed for the on-site setup needs to
   be configured for unattended access *and* to auto-launch on boot -
   otherwise the day the laptop reboots on-site is also the day remote
   access to it is lost, which is precisely the moment something's
   likely gone wrong.
6. **Know the real limits of the app's OTA update path.** `expo-updates`
   and a `production` channel are already configured
   (`mobile/app.json` / `mobile/eas.json`), so future JS-only fixes to
   the counter app can in principle ship over-the-air without
   re-sideloading every physical device. But an OTA check needs the
   device to have general internet access at some point, which cuts
   against the whole reason this system is LAN-only in the first
   place - treat it as a partial safety net that works only if the
   venue's Wi-Fi happens to also have internet, not a real update
   strategy. Backend fixes (`pb_hooks/`) have no remote-update path at
   all either way - those always need physical access to the laptop.
7. **Minor, accepted trade-off for now:** PocketBase is served over
   plain HTTP on the LAN, not HTTPS. Fine for a genuinely local-only
   network, but `usesCleartextTraffic: true` already had to be forced
   on once (see mobile section below) to make that work at all - a
   sign this swims against the platform's default direction and is
   worth revisiting if a future Android update tightens cleartext
   restrictions further.

If you're picking this up in a fresh session for one specific feature:
the section above is enough to orient you. Only read further into the
backend/mobile/web sections below if they're directly relevant to what
you're building - you don't need this file's full history for one
focused change.

## Backend additions (`backend/`)

Drop `pb_migrations/1740000100_staff_auth.js` and the four files in
`pb_hooks/` alongside what you already deployed. Run `./pocketbase serve`
and the migration applies automatically.

- **`1740000100_staff_auth.js`** - converts `staff` from a plain collection
  into a real PocketBase auth collection, so it can issue tokens. This
  **deletes and recreates** the collection rather than mutating it in
  place - PocketBase doesn't document a supported way to flip an existing
  collection's type, and deleting+recreating is what's actually
  documented. Cost: any `staff` rows created against the old schema are
  gone after this runs. Fine right now since the schema only just landed;
  **not** fine if you've already seeded real staff - export first.
  Repointing the `tickets.staff_id` and `ticket_events.actor_staff_id`
  relations at the new `staff` collection needs two separate `app.save()`
  calls per field - remove the old field and save, *then* add the new one
  and save. PocketBase diffs a save payload by field name against the DB,
  so removing and re-adding a same-named relation field within a single
  `app.save()` still reads as an in-place change to an immutable
  `collectionId` and gets rejected. Applied in both `up()` and `down()`.
- **`auth.pb.js`** - `POST /api/staff-login` (username + PIN -> token).
- **`redeem.pb.js`** - now requires a `staff`-scoped token and takes the
  actor from it, instead of trusting a `staff_id` in the request body like
  the first version did.
  **Scope change since the previous step:** GateMark is not integrated
  with Funland's own ticketing system and never will receive its ticket
  data, so an unknown QR code no longer errors out. The first scan of any
  code now creates that ticket's record on the fly (status `valid`, event
  logged as `scanned`) and falls straight into the normal redemption
  branch, so every later scan of the same code correctly comes back as
  "already redeemed" - the first scan *is* the ticket's creation event as
  far as this system is concerned. The two-devices-scan-a-brand-new-code
  race is not a real risk: PocketBase serializes writes app-wide, so as
  long as the lookup-and-create-if-missing logic stays inside the same
  `$app.runInTransaction` block (it does), the second request can't even
  start its own lookup until the first has committed the new ticket -
  it'll land in the "already redeemed" branch, not create a duplicate. No
  additional locking was needed. No `event_type` schema change was needed
  either - a first-time auto-created ticket just logs as `scanned` like
  any other first scan.
- **`undo_scan.pb.js`** - `POST /api/undo-scan`, the mobile app's
  self-service undo. 2-minute window, same staff member only, checked
  against `server_time`.
- **`session_log.pb.js`** - `GET /api/session-log`, scoped by counter and
  an explicit `from`/`to` range (the device computes its own local-midnight
  boundary, rather than the server guessing a timezone).
- **`public_lists.pb.js`** - two unauthenticated routes
  (`/api/staff-names`, `/api/counters`) so the login picker and the
  device-setup screen have something to show before any token exists.
  Both filter on `active = true` - a record with `active` left unset
  simply won't show up even though it exists, which looks like a broken
  connection but isn't. Also now has a third route, `/api/discover`
  (`{ service: "gatemark" }`) - added for deployment hardening item 1
  below, so a device doing a LAN subnet scan can tell an actual GateMark
  server apart from any other host that happens to answer on the same
  port (PocketBase's own `/api/health` isn't enough for that - it'd say
  yes for *any* PocketBase instance).

**Read before deploying:** a 4-6 digit PIN as a PocketBase password is
convenient, not strong. There's no extra rate-limiting beyond PocketBase's
defaults. That's a reasonable trade for a LAN-only counter app - an
attacker would need to already be on the local network - but worth
revisiting if that assumption ever changes. Password min length is
relaxed to 4 to allow this. One consequence of `staff` now being an auth
collection: adding a staff row by hand in the PocketBase dashboard needs
`username` and `password` (the PIN) filled in, not just `name`/`role` -
skipping them leaves a record that exists but can't log in and won't
explain why.

**Running it on the LAN:** the binary has to be started as
`./pocketbase serve --http=0.0.0.0:8090` (not the `127.0.0.1` default,
which no phone on the network can reach) and it has to be run from
*inside* `backend/`, not wherever the downloaded binary happens to sit -
PocketBase only auto-applies `pb_migrations`/`pb_hooks` that are next to
the binary's own working directory, so running it from elsewhere silently
skips this whole step's migration (you'd just see the default `users`
collection and nothing else). Phones need the laptop's actual LAN IPv4
(`ipconfig` -> Wi-Fi adapter), and Windows Firewall needs to allow that
port on the Private network profile.

### Automatic backups (deployment hardening item 2)

Fixes "no backup exists" from the action plan above. Two independent
pieces - the first is fully automatic once deployed, the second still
needs a one-time on-site decision:

- **`1740000400_enable_auto_backups.js`** turns on PocketBase's built-in
  backup cron (`app.settings().backups`) - daily at 4am, keeping the
  newest 14 zips in `pb_data/backups/`. This alone already covers
  corruption/accidental-delete recovery, and needs nothing further -
  it's live the moment this migration applies, same as any other
  migration in this folder.
- **`backup-offsite.ps1`** covers what the cron backup on its own
  can't: those 14 zips still live on the same disk as the live database,
  so laptop theft/damage/spilled-coffee takes the backups with it. This
  script copies new zips from `pb_data/backups/` out to a
  `-Destination` folder - a USB drive letter, a mapped network share, or
  a folder already synced by whatever cloud tool (OneDrive/Dropbox/etc.)
  is on the laptop. Deliberately not wired to a specific cloud provider's
  API, to avoid adding a real internet dependency to a system whose whole
  design point is not needing one; if a synced folder is what's
  available on-site, point `-Destination` at it and let that tool do the
  "off this laptop" part on its own schedule.

  **The one-time on-site step this doesn't automate:** deciding what
  `-Destination` actually is at this venue (which drive letter, which
  share, which synced folder), then wiring it into a Windows Scheduled
  Task so it runs unattended - the same "needs a human to set it up once,
  then never again" shape as item 3's restart-on-boot task below:

  ```powershell
  schtasks /Create /TN "GateMark Offsite Backup" /SC DAILY /ST 04:15 `
    /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"C:\gatemark\backend\backup-offsite.ps1`" -Destination `"D:\GateMarkBackups`"" `
    /RL LIMITED
  ```

  Scheduled 15 minutes after the 4am backup cron so that night's zip
  already exists by the time the copy runs. Logs its own run history to
  `backend/backup-offsite.log` (separate from PocketBase's own logs) so
  "did last night's copy actually work" is checkable without needing to
  be watching the console at 4am - worth a glance the first few times a
  Scheduled Task runs it, since a wrong `-Destination` (typo'd drive
  letter, unmounted share) fails loudly in that log rather than silently.

  Restoring from either location is the same either way: PocketBase's
  own dashboard (Settings -> Backups, or `$app.restoreBackup()`) can
  restore from any zip in `pb_data/backups/` directly; a zip that only
  exists at the offsite `-Destination` needs to be copied back into
  `pb_data/backups/` first before the dashboard will see it.

## The mobile app (`mobile/`)

Standard Expo project - `cd mobile && npm install && npx expo start`. Use
`npx expo install <package>` for any Expo package from here on, never
plain `npm install` - npm's installer nests packages like `expo-asset`
inside `node_modules/expo/node_modules/...` instead of hoisting them,
which Metro's resolver never finds (`expo-asset cannot be found` on
start); `expo install` adds it as a direct, SDK-matched dependency and
fixes the hoisting.

Point a physical device at it (Expo Go won't have camera barcode scanning
in all cases; a dev build is more reliable - `npx expo run:android` or
`eas build --profile development`). One more Expo Go gotcha: the Play
Store version auto-updates to the newest SDK, so it will report "Project
is incompatible with this version" against a project pinned to an older
SDK (this project is on SDK 52) - either sideload the matching Expo Go
build from `expo.dev/go?sdkVersion=52&platform=android&device=true`, or
treat this as another point in favor of moving to an EAS development
build sooner rather than later, since custom native permissions/config
(camera) don't fit inside Expo Go anyway and this mismatch will recur on
every SDK bump.

### One interpretation call worth flagging

The plan listed **"Undo last scan"** as its own screen. I built it as an
inline action on the Scan screen's result card instead (button + 2-minute
countdown, right where you just made the scan) rather than a separate
screen you'd have to navigate to. It's the same functionality end to end,
just reachable without a tab switch - felt like the right call for
something you'd only ever want *immediately* after a scan, but say the
word if you pictured a dedicated screen and I'll split it out.

### How the offline queue actually works

Every scan is written to a local SQLite table first, always - camera hit
or manual entry, online or not. A background loop (plus an immediate
trigger right after each scan) tries to drain it against `/api/redeem`.
That's the same "queue everything, sync in the background" shape the plan
called for, with two things added that the plan's mobile section didn't
spell out but that fell out of actually building it:

- **Per-staff token cache, not one shared session.** This is a shared
  kiosk - staff PIN in and out across a shift, and the queue can easily
  hold scans from more than one person by the time the device reconnects.
  If the sync loop authenticated every queued scan as "whoever's logged in
  right now," a scan queued by Staff A but synced after Staff B logged in
  would get attributed to Staff B - exactly what the PIN system exists to
  prevent. So the app keeps a small per-staff token cache (`SecureStore`)
  and syncs each queued scan under the identity that actually made it,
  independent of who's active on screen at sync time. Logging out clears
  only the "who's active" pointer, not the cached token - it's still
  needed to drain that person's scans after they've clocked out.
- **The connectivity indicator checks the local server, not the internet.**
  `NetInfo`'s default reachability check pings the public internet, which
  is exactly what this app is designed to keep working without. So
  "Connected" here means an actual `GET /api/health` against the
  configured local server succeeded, not that the device has 4G.
- **Session log refetches on tab focus, not just on a queue change.**
  First cut only fetched `/api/session-log` once, on mount - since Expo
  Router's tabs stay mounted in the background after the first visit,
  nothing else ever re-triggered it, so the screen kept showing whatever
  was true the moment you first opened that tab. First fix made it
  refetch whenever the local queue's status changed (a scan finishing
  sync). That's correct, but it puts all the weight on one pub/sub path
  through a module-level listener `Set` in `queue.ts` - fine once it's
  actually running, but it's exactly the kind of singleton state that can
  silently survive a stale bundle or a half-applied Fast Refresh, and a
  broken version of it looks identical to "never fixed at all." Session
  log now also refetches on `useFocusEffect` (`@react-navigation/native`,
  already pulled in transitively via `expo-router`) - switching to that
  tab always re-fetches, independent of queue timing entirely. Kept both:
  focus covers the normal "scan, then switch tabs to check" path; the
  queue listener still catches a background sync finishing while you're
  already sitting on the Session log tab.
- **Session log returning zero events despite real data existing - found
  post-deploy, fixed in `session_log.pb.js`.** The refetch-timing work
  above was all correct; the screen still came back empty because
  `/api/session-log`'s own filter was silently unmatchable. The device
  sends `from`/`to` via `Date.toISOString()` - standard ISO 8601,
  `"...T...Z"`. PocketBase's `autodate`/`date` fields (e.g. `server_time`
  on `ticket_events`) are stored as `"... ...Z"` - a space where
  `toISOString()` puts a `T`. `findRecordsByFilter`'s `>=`/`<=` on a date
  field compares these as plain text, not as parsed timestamps, and a
  space (`0x20`) sorts before `T` (`0x54`) - so on any same-day query,
  every real row looks "earlier than" the lower bound no matter its
  actual time, and the range matches nothing. Confirmed by reproducing
  the exact filter with literal values in the PocketBase admin UI (same
  0-row result), which ruled out anything specific to how the hook binds
  params and pointed straight at the comparison itself. Fixed by
  normalizing `from`/`to` (`.replace("T", " ")`) before they go into the
  filter, so they match PocketBase's own storage format. **The same
  mismatch was also lurking in `cleanup.pb.js`**'s hourly prune job - its
  `cutoff` is built the same `toISOString()` way and compared against
  `created` in a raw SQL string - meaning same-day `redeem_attempts` rows
  could read as older than the 48h cutoff and get pruned early. Fixed
  there too, same way. Worth remembering for *any* future date-field
  filter or raw SQL comparison added against PocketBase data: normalize
  to the space-separated form first, or use PocketBase's own date literal
  handling rather than a bare `toISOString()` string.

### Closing the idempotency gap

The heuristic described above is gone. /api/redeem now requires an idempotency_key in the body - one generated per scan attempt in queue.ts, stored alongside that row, and resent verbatim on every retry of that same row. Inside the request's transaction, the key is checked against a new redeem_attempts collection (1740000200_redeem_idempotency.js) before touching ticket state at all: a match means this is a lost-response retry, and the cached response is replayed byte-for-byte with nothing re-derived; no match means this is the first time the key's been seen, so it runs the normal valid/already-redeemed branch and then records the result under that key before returning. cleanup.pb.js prunes redeem_attempts rows older than 48h on an hourly cron - this collection is transport bookkeeping, not part of the permanent audit trail ticket_events is.

This isn't just a stricter version of the old heuristic - it fixes a real misclassification the heuristic had. A genuine second scan of an already-redeemed ticket by the same staff at the same counter (an honest double-tap, not a dropped connection) used to get treated as "that was actually my earlier success," because the heuristic had no way to tell the two apart. Keying on a fresh UUID per attempt instead of on staff+counter means a real duplicate (new row, new key) now correctly comes back as a conflict, and only an actual retry of the same row replays as valid.

One edge worth knowing about, not a bug: if a scan's response gets cached, the ticket is then undone via /api/undo-scan, and only after that the original request finally retries (possible if a phone stayed offline long enough for staff to undo from a different device first), the retry replays the original "valid" result from before the undo - not the ticket's current state. That's correct idempotency behavior, not a glitch: the cached response is a record of what that request produced when it first ran, not a live lookup. It just means the replayed screen and the ticket's actual current status can briefly disagree if you check both at once.

### Self-healing server address (deployment hardening item 1)

Fixes the "every device is hard-pinned to the server's IP" gap from the
action plan above. `mDNS`/`.local` hostnames, the fix suggested there as
an alternative to a DHCP reservation, turned out not to actually work for
this: Android's standard networking stack (what plain `fetch` runs on top
of) doesn't resolve `.local` mDNS hostnames the way iOS does out of the
box, and the counter devices are plain Android phones - pointing the app
at `http://gatemark.local:8090` would just fail silently on-device even
though it looks correct. So instead of a hostname, devices now actively
re-find the server's current IP themselves when the one they have stops
working:

- **`mobile/src/lib/serverDiscovery.ts`** - the actual LAN scan. Given
  the last address that worked, tries it again first (covers "briefly
  unreachable," the common case, without a scan), then sweeps the
  device's own `/24` subnet - derived from `NetInfo`'s wifi
  `ipAddress`/`subnet` details - in batches of 20 concurrent requests,
  probing each host's `/api/discover`. Stops at the first host that
  answers `{ service: "gatemark" }`. Scoped to a `/24` (254 hosts)
  deliberately, not a general CIDR scan - this app is explicitly
  single-venue, and a `/24` is what the overwhelming majority of small
  routers hand out. Throttled to one scan per 20s so a genuinely
  offline server (not just moved) doesn't get hammered with a repeated
  subnet sweep. Also exports a cold-start variant with no last-known
  address, used by the setup screen's new "Find server automatically"
  button.
- **`mobile/src/lib/serverConnection.ts`** - the new single live source
  of truth for "what's the server's address right now." Before this,
  every caller that needed the address got it once - from
  `useDeviceConfig()` or a value captured at app bootstrap - and kept
  using that same string for the rest of the app's life even if the
  server moved. `connectivity.ts`'s poll loop and `queue.ts`'s sync loop
  now read the address from here on every tick instead of holding their
  own copy, and call `recoverServerUrl()` (which wraps
  `serverDiscovery.ts`, throttled the same way) the moment a request
  against the current address fails to connect at all. A found address
  gets persisted back to `deviceConfig` and broadcast to a small
  listener set, so screens making their own live calls
  (`useServerUrl()`, a new hook) pick it up immediately without needing
  a remount.
- **What changed in existing files:** `startConnectivityMonitor`,
  `startAutoSync`, `syncPendingItems`, and `retryFailedItem` no longer
  take a `serverUrl` parameter - they pull it from `serverConnection.ts`
  internally, which is also what makes the "re-check the same address
  that failed on every request" bug structurally impossible now rather
  than just patched over. `login.tsx`, `scan.tsx`, and
  `session-log.tsx`'s direct API calls (staff/counter lookups, PIN
  login, undo) switched from `config.serverUrl` (a one-time
  `useDeviceConfig()` read) to the new `useServerUrl()` hook for the
  same reason. `settings.tsx` displays the live address too now, not
  just the persisted one.
- **Backend:** `public_lists.pb.js` gained `GET /api/discover` (see
  above) purely as an identity check for the scan - PocketBase's
  built-in `/api/health` confirms "something PocketBase is here," not
  "this specific GateMark instance," which isn't a strong enough
  signal to trust mid-scan.
- **Verified against a real running PocketBase v0.40.1 instance** (not
  just read through): `/api/discover` returns `{"service":"gatemark"}`
  with a 200, doesn't collide with the built-in `/api/health` route, and
  the core probe/parsing logic was exercised directly against both the
  real server and a decoy plain-HTTP server on another port to confirm
  it actually rejects a non-GateMark host rather than treating "port's
  open" as success. Not yet verified inside the actual Expo/React
  Native runtime (no device or emulator available in that session) -
  `npx tsc --noEmit` passes clean across the whole mobile project, but
  an on-device smoke test (kill the server, change its IP, confirm a
  counter device picks the new one up within ~20-30s without any
  manual re-setup) is still worth doing before this is trusted at a
  real venue.

### App icons & splash

`assets/icon.png`, `assets/adaptive-icon.png`, and `assets/splash.png` now
exist - `app.json` already pointed at these paths, so no config changes
needed.

The mark: a rounded-top "gate" arch with a checkmark knocked out of its
center (negative space, not drawn on top) - the arch nods to "Gate," the
checkmark nods to "Mark" and echoes the `CheckCircle2` icon already used
in-app for a valid scan (`lucide-react-native`), so the launcher icon
reads as "this validates things" without literally duplicating the
in-app success badge. Two flat colors only - `colors.primary` (`#1F4D3A`)
and `slate50` (`#F8FAFC`) - since a two-tone knockout survives being
scaled down to a 48px launcher icon; gradients or thin strokes wouldn't.

Three variants, deliberately sized differently rather than one export
reused three ways:

- `icon.png` - opaque, full-bleed, generous mark (nothing clips this
  one).
- `adaptive-icon.png` - transparent, sized and checked against Android's
  actual 66/108 safe-zone circle plus circle/squircle/rounded-square
  launcher masks, since the raw 1024x1024 viewport isn't what OEM
  launchers actually show.
- `splash.png` - transparent, smaller and padded (sits under
  `resizeMode: "contain"` in `app.json`), nudged up a few percent from
  mathematical center - the arch's flat feet read as visually heavier
  than its round top, so a bounding-box-centered mark looks like it's
  hanging low on a tall phone screen.

No SVG renderer was available in the environment this was produced in,
so the mark was built directly in Pillow (supersampled 4x, downsampled
with Lanczos) rather than from an actual vector source. `assets-source/
gen_mark.py` regenerates all three if the proportions, colors, or concept
ever need to change - it isn't imported anywhere and doesn't need to
ship, just kept alongside the assets it produced.

### EAS Build & signing (`mobile/eas.json`)

Three profiles - `development`, `preview`, `production` - matching what
`package.json`'s `build:android` script already references:

- **`development`** - `developmentClient: true` + internal distribution,
  APK. This is what `eas build --profile development` needs for a real
  dev client - camera scanning requires one; Expo Go can't hold this
  project's custom native config.
- **`preview`** - internal APK, no dev client. Not referenced by name
  anywhere else, but it's the standard middle rung: a production-shaped
  build you can sideload onto a test tablet before committing to
  `production`.
- **`production`** - internal distribution, APK, not `app-bundle`.
  **Interpretation call:** built as a sideloadable APK, not a Play Store
  submission - confirmed this is an internal kiosk app for counter
  tablets, not a public listing, so "production" means "the stable build
  that goes on real counter devices," not "the build submitted to
  Google." No `submit` block, no Google service-account key.

`"appVersionSource": "remote"` is set under `cli` so EAS auto-increments
the Android version code per build instead of it being hand-bumped in
`app.json`. Signing uses `credentialsSource: "remote"` (the default) -
EAS holds the keystore in the linked Expo account; the `.jks` file is
never touched directly, and every later build reuses the same key
automatically once it's generated.

**Account-specific setup this file can't do on its own** (tied to the
Expo account, not the repo): `eas login`, `eas init` (writes
`extra.eas.projectId` into `app.json` - commit that change alongside
`eas.json`), and the first build's "Generate a new Android Keystore?"
prompt (answer yes, once - every later build reuses it).

**SDK 52 + dev-client gotcha hit while first building this:** `eas build
--profile development` auto-installs `expo-dev-client` if it isn't
present, and that package pulls in Jetpack Compose for its dev-menu UI.
SDK 52's default Kotlin version (1.9.24) is one patch behind what that
Compose Compiler version requires (1.9.25), so the Gradle step fails with
a Kotlin/Compose version-mismatch error before it ever reaches
project-specific code. Fixed by adding `expo-build-properties` and
pinning `android.kotlinVersion` to `"1.9.25"` in `app.json`'s `plugins`
array. This is a known SDK 52 + dev-client combination, not anything
project-specific, and is worth rechecking (Compose Compiler's required
Kotlin version vs. the SDK default) any time `expo-dev-client` gets
reinstalled after a future SDK bump.

### What's stubbed or deliberately left out

- **Session log pagination** - caps at 200 events server-side; fine for a
  day's volume at one counter, would need paging for anything heavier.
- **No offline login.** Logging in requires reaching the server (PIN
  verification happens there, on purpose - storing anything
  PIN-verifiable on-device would reopen the exact weak-local-secret
  problem the auth-collection redesign was moving away from). Once
  logged in, scanning keeps working offline via the token cache above -
  it's specifically the *first* login on a device that needs
  connectivity, and an app restart while offline reuses the cached
  session without hitting the network at all.
- **No automated tests.** Given the size of this drop, I'd suggest the
  build-order item from the plan next: physically pull a device off Wi-Fi
  mid-session and confirm the queue/undo/session-log behavior end to end,
  same as step 10.3 in the plan.

## The web superadmin (`web/`)

Vite + React + TypeScript + Tailwind, built as a static site and served
by PocketBase's `pb_public/` (copy `web/dist/*` there after `npm run
build` - there's no separate deploy step or web server). Talks to
PocketBase two ways: the `pocketbase` JS SDK directly for anything that's
plain CRUD or a live view (tickets/events list+search, staff/counters
CRUD, realtime dashboard), and the same custom `/api/*` route pattern
mobile uses for anything needing a transaction or a guaranteed
audit-trail write (`/api/ticket-override`, `/api/conflict-resolve`,
reuses `/api/staff-login`). **Not shadcn/ui** despite the plan's original
wording - the shadcn CLI's registry wasn't reachable from the build
environment this was produced in, so `src/components/ui/` is a small
hand-rolled set of primitives (Button, Card, Dialog, Input, Badge, etc.)
in the same visual style rather than Radix-backed shadcn components. They
cover everything this app needed; swap in real shadcn/ui later if a
future screen needs something these don't do (a real focus trap in
`Dialog`, for instance - it's Escape/backdrop/click-outside only right
now).

Verified end-to-end against a real, running PocketBase instance and a
real headless Chromium session (Playwright), not just read through -
login, dashboard, ticket search, void, reopen, resolve a conflict, and
create a staff member and a counter, all through the actual UI, checked
for zero browser console errors on the final pass. That process caught
several bugs worth knowing about before extending this app:

- **`tickets`, `counters`, and `staff` have no `created`/`updated`
  fields.** They were defined via migration with an explicit `fields:
  [...]` list that never included them - unlike collections made through
  the PocketBase dashboard, which get them by default. Confirmed by
  inspecting the live schema, not assumed. Sorting by `-created` on any
  of these returns a 400. `ticket_events.server_time` is the one
  timestamp field that exists across these collections; `tickets` has no
  creation-order field at all (Tickets.tsx sorts by `-scanned_at`
  instead, which is a reasonable proxy but not a true creation order).
- **PocketBase's default request auto-cancellation key is `method +
  path` only - it ignores query params/filters.** Confirmed by reading
  the SDK source (`t.requestKey || (t.method||"GET") + e`). Two
  *concurrent* calls to the same collection's `/records` endpoint cancel
  each other even with completely different filters. This silently broke
  two things here: the Conflicts queue's paired `conflict_flagged` /
  `conflict_resolved` queries (`useOpenConflicts`), and the dashboard's
  three-way ticket status count (`useTicketStatusCounts`) - both fire
  same-collection requests in the same tick. Fixed with an explicit,
  distinct `requestKey` per logical query (see `lib/pbErrors.ts` and
  `useLiveList`'s `requestKey` construction). **Any new screen that fires
  more than one concurrent query against the same collection needs to do
  the same**, or it'll intermittently lose one of the two at random.
- **PocketBase serializes an unset number field as `0`, not `null`.**
  `assigned_number ?? "—"` doesn't catch it, so unscanned/reopened
  tickets showed "#0" instead of "—". Fixed with `assignedNumberLabel()`
  in `lib/format.ts` (a plain truthy check, since assigned numbers start
  at 1 and 0 always means "not assigned yet") - use that helper anywhere
  a ticket number is displayed, not `??`.
- **`pkill -f "pocketbase serve"` will kill its own invoking shell** if
  run as part of a larger script, because `-f` matches the full command
  line and the pattern text is itself part of that command line. Hit
  this repeatedly while resetting the test database during verification
  - the symptom is the whole multi-line command silently dying partway
  through with empty output. Kill by PID (`ps`/`grep` for the actual
  process, or track the PID from when you started it) instead of by
  pattern when a real PocketBase server might be running.
- **jsPDF pulls in ~250KB of transitive deps (html2canvas, dompurify)
  that no other screen needs.** A static top-level import put that
  weight in the main bundle every superadmin downloads on login, not
  just the one exporting a PDF. Fixed with a dynamic `import("@/lib/
  pdfReport")` inside the click handler (see `Reports.tsx`) - Vite
  code-splits it into its own chunk that only loads when "Export PDF" is
  actually clicked, which took the main JS chunk from ~680KB back down
  to ~256KB. Worth the same treatment for any future heavy,
  rarely-used library (a chart package, another export format) rather
  than a static import by default.

Structure: `src/lib/` (PocketBase client, shared types, date/format
helpers, the custom-route wrapper, CSV/PDF generation), `src/hooks/`
(`useLiveList` - realtime-backed list fetch, `useOpenConflicts`,
`useTicketStatusCounts`), `src/components/` (layout, shared dialogs,
`ui/` primitives), `src/pages/` (one per nav item). Design tokens
(`gatemark.primary`/`accent`/etc. in `tailwind.config.js`) are copied
from `mobile/src/theme/colors.ts` verbatim rather than picked separately,
so the two apps don't visually diverge - see "Design system pass" above
for why that's not the same thing as a real unified pass.

**Interpretation calls worth flagging**, same spirit as the mobile
section above:

- **Staff/counter "delete" is deactivate-only** (`active` toggle via the
  Records API), no hard-delete route exposed to the web app. Hard-deleting
  a `staff` or `counters` row that's already referenced by
  `tickets`/`ticket_events` would leave those relations dangling and
  quietly break the audit trail's "who/where" columns; deactivating keeps
  history intact. A true delete is still possible for the rare "created
  by mistake, has no history" case, just from the PocketBase dashboard
  directly rather than the superadmin UI.
- **"Reopen" always fully resets a ticket's redemption metadata**
  (`assigned_number`/`counter_id`/`staff_id`/`scanned_at` all cleared),
  same as mobile's self-serve undo, so a reopened ticket gets a genuinely
  fresh redemption if scanned again rather than reusing stale data.
  **"Void" deliberately does not** - it only flips `status`, leaving any
  existing redemption metadata in place, since voiding is meant to
  annotate history (fraud, refund) rather than erase it.
- **Conflicts queue "open" state isn't a stored flag** - it's derived by
  comparing the latest `conflict_flagged` event per ticket against the
  latest `conflict_resolved` event for that same ticket
  (`useOpenConflicts`). This was a deliberate choice to keep the schema
  as-is (no new boolean field, no migration) at the cost of the app
  doing that comparison client-side instead of a single server-side
  filter - fine at this app's scale, worth revisiting if the venue ever
  has enough concurrent conflicts for that to matter.
- **PDF export is summary-only; CSV export is where the per-ticket detail
  lives.** A PDF with every individual scan row for a busy venue's "last
  30 days" range isn't something anyone actually wants to print or hand
  to a manager - it'd run to dozens of pages of a table. The PDF
  (`lib/pdfReport.ts`) only ever contains the roll-ups (totals by event
  type, by counter, by staff); the CSV (`lib/csv.ts`) has the full
  `ticket_events` detail for the selected range, timestamp down to the
  millisecond, meant for opening in a spreadsheet rather than printing.
  If a future request wants a detailed *printable* report too, that's a
  different, longer document - don't just add the detail rows to the
  existing summary PDF.
- **The "overrides" count on Reports' by-staff breakdown deliberately
  excludes `conflict_flagged`** (it counts `voided`, `reopened`, and
  `conflict_resolved` only). A flagged conflict is a system-detected
  outcome of a scan attempt, not a deliberate corrective action the way
  voiding/reopening/resolving are - counting it as an "override" would
  overstate how much a staff member who just got unlucky with a race
  condition actually *did*. It still shows up in the "Conflicts flagged"
  total and in the full CSV detail, just not folded into that specific
  per-staff number.

## Suggested next step

See "What's next" near the top of this file for the full annotated build
order. Items 1-5 (schema, mobile, conflict-detection, web superadmin,
reports) are all done and verified; item 6 (a real design-system pass
across mobile + web) and item 7 (the on-site real-conditions test) are
the two unstarted pieces of the original plan. Item 7 in particular
can't be verified from a dev environment the way everything else here
was - it needs an actual device, actual Wi-Fi, and someone physically
pulling the plug mid-shift.

Separately, see "Deployment hardening - action plan" above before the
first real on-site install: items 1-2 (stable server IP, automatic
backups) are now done; item 3 (auto-restart on boot) is the remaining
one most likely to cause a real outage and is worth doing before
anyone's guy shows up with a laptop, not after. Item 2's offsite half
also still needs someone to actually pick a `-Destination` and wire up
the Scheduled Task for this specific venue - see "Automatic backups"
under the backend section for the one-liner.