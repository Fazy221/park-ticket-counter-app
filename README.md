# GateMark - mobile scan flow

This step adds two things on top of the schema + redeem transaction from
the previous step:

1. **Staff PIN login on the backend** - the thing `redeem.pb.js` explicitly
   left as a TODO last time.
2. **The Expo counter app** - PIN login, camera scanning, offline queue,
   undo, session log.

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
  connection but isn't.

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

## Suggested next step

Plan section 10, step 4: the web superadmin - auth, staff/counter CRUD,
live dashboard, ticket override, and the Conflicts queue this whole
staff-token design has been building toward.