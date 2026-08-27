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

### The one gap I didn't close: true idempotency

If a device's connection drops in the exact instant after `/api/redeem`
commits server-side but before the response reaches the phone, the client
will retry and get back "already redeemed." The app has a heuristic for
this (`queue.ts`, `resolveSynced`): if the "already redeemed" response's
staff and counter match the exact item being retried, it treats that as
"that was actually my own successful attempt" rather than a real
conflict. That covers the common case cleanly, but it's still a guess -
it can't distinguish "I actually did this" from "someone with my staff ID
happened to redeem the same ticket at the same counter in the same
instant," which is astronomically unlikely but not impossible. A properly
closed version of this needs an idempotency key on `/api/redeem` (client
generates a UUID per scan attempt, server remembers it briefly, replays
the cached result instead of re-processing) - didn't want to reopen the
already-reviewed redeem transaction for this step without flagging it
first.

### What's stubbed or deliberately left out

- **App icons/splash** - `app.json` references `./assets/icon.png` etc.
  that don't exist yet; drop real ones in before building.
- **EAS Build/signing config** - no `eas.json`, no keystore. Plan section 9
  calls for `eas build --platform android --profile production`; that
  needs a `eas.json` with a `production` profile and Android credentials,
  which are per-account setup I can't generate for you.
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