/// <reference path="../pb_data/types.d.ts" />

// Two small public, unauthenticated read routes. Both `staff` and
// `counters` stay fully locked down (listRule: null) - these are the one
// sanctioned way to browse a thin slice of each without a token, because
// two screens need that before a token exists at all:
//   - the mobile login screen needs staff names for its "tap your name"
//     picker, before the PIN pad
//   - the device setup screen needs counter names so whoever configures a
//     new device can pick "this tablet is the East Gate counter" without
//     needing a superadmin token on a bare install
// Neither returns anything sensitive: no PIN/password (PocketBase never
// exposes those over the API regardless of rules), no role, nothing an
// unattended device shouldn't be showing.

// GET /api/staff-names
routerAdd("GET", "/api/staff-names", (e) => {
  const staff = $app.findRecordsByFilter(
    "staff",
    "active = true",
    "name", // sort
    500,
    0
  );

  const result = staff.map((s) => ({
    id: s.id,
    name: s.get("name"),
    username: s.get("username"),
  }));

  return e.json(200, result);
});

// GET /api/counters
routerAdd("GET", "/api/counters", (e) => {
  const counters = $app.findRecordsByFilter(
    "counters",
    "active = true",
    "name",
    200,
    0
  );

  const result = counters.map((c) => ({
    id: c.id,
    name: c.get("name"),
  }));

  return e.json(200, result);
});

// GET /api/discover
// Deployment hardening item 1 (see README): the venue router can hand the
// server laptop a new DHCP lease at any point (reboot, firmware update),
// and nothing previously re-found it - every counter device just broke
// silently, hard-pinned to whatever IP it was configured with at setup.
// This route exists purely so a device that's lost its known-good address
// can sweep the local subnet and positively identify which host, if any,
// is actually this GateMark server - PocketBase's built-in /api/health
// only confirms "something PocketBase is listening here", which isn't
// enough to trust during a scan (any other PocketBase instance, or in
// principle any web server, would also 200). Deliberately tiny and
// unauthenticated, same reasoning as staff-names/counters above: nothing
// sensitive in the response, needed before any token exists.
routerAdd("GET", "/api/discover", (e) => {
  return e.json(200, { service: "gatemark" });
});
