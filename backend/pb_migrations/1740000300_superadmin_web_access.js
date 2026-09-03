/// <reference path="../pb_data/types.d.ts" />

// Opens up just enough of the Records API for the web superadmin (plan
// section 6) to talk to PocketBase directly with the `pocketbase` JS SDK -
// list/search/realtime-subscribe on tickets & ticket_events, and full CRUD
// on staff & counters - instead of needing a custom /api/* route for every
// screen the way the mobile app does.
//
// Why the split (some collections get real API rules, others stay null):
// - staff / counters: superadmin manages these directly (create, edit,
//   deactivate) - ordinary CRUD with no atomicity or audit-trail concerns,
//   so plain Records API rules are the right tool. No deleteRule granted
//   anywhere here - deactivating (active = false, via updateRule) is the
//   supported way to remove a staff member or counter from rotation
//   without breaking the tickets/ticket_events rows that still reference
//   them. Hard delete stays superuser-only via the PocketBase dashboard.
// - tickets / ticket_events: createRule/updateRule/deleteRule are left
//   `null` on purpose - every write to these still has to go through a
//   custom hook (/api/redeem, /api/undo-scan, and /api/ticket-override
//   below) so the audit trail (a ticket_events row for every state change)
//   can't be bypassed by a direct Records API write. Only listRule/viewRule
//   open up here, for the live dashboard, ticket search, and Conflicts
//   queue to read - including PocketBase's realtime subscribe, which is
//   governed by the same viewRule.
//
// Rule shape: `@request.auth.role = "superadmin"` works because `role` is
// a plain field on the `staff` auth collection itself - @request.auth
// resolves to whichever auth collection's token made the request, and
// counter_staff tokens simply won't satisfy this rule.
migrate((app) => {
  const superadminOnly = '@request.auth.role = "superadmin"';

  const staff = app.findCollectionByNameOrId("staff");
  staff.listRule = superadminOnly;
  staff.viewRule = superadminOnly;
  staff.createRule = superadminOnly;
  staff.updateRule = superadminOnly;
  app.save(staff);

  const counters = app.findCollectionByNameOrId("counters");
  counters.listRule = superadminOnly;
  counters.viewRule = superadminOnly;
  counters.createRule = superadminOnly;
  counters.updateRule = superadminOnly;
  app.save(counters);

  const tickets = app.findCollectionByNameOrId("tickets");
  tickets.listRule = superadminOnly;
  tickets.viewRule = superadminOnly;
  app.save(tickets);

  const ticketEvents = app.findCollectionByNameOrId("ticket_events");
  ticketEvents.listRule = superadminOnly;
  ticketEvents.viewRule = superadminOnly;
  app.save(ticketEvents);
}, (app) => {
  for (const name of ["staff", "counters", "tickets", "ticket_events"]) {
    const c = app.findCollectionByNameOrId(name);
    c.listRule = null;
    c.viewRule = null;
    c.createRule = null;
    c.updateRule = null;
    app.save(c);
  }
});
