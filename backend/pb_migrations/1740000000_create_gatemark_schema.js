/// <reference path="../pb_data/types.d.ts" />

// GateMark base schema: staff, counters, tickets, ticket_events.
//
// All API rules are left as `null` (superuser-only) for now. Nothing in this
// migration exposes staff PINs or ticket data to the public API yet — the
// only way in is either the PocketBase superuser account or the custom
// /api/redeem route in pb_hooks, which runs with full $app privileges and
// isn't restricted by these rules. Real staff-facing access control (PIN
// login -> scoped token) is designed in the mobile-scan-flow step, at which
// point these rules get tightened to match.
migrate((app) => {
  // ---- staff ----------------------------------------------------------
  const staff = new Collection({
    type: "base",
    name: "staff",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 100 },
      {
        name: "role",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["counter_staff", "superadmin"],
      },
      // Hashed PIN, never returned by the locked-down rules above.
      // Replaced with a proper auth-collection password once staff login
      // is built — kept as a plain hashed field for now to match the
      // original data model.
      { name: "pin_hash", type: "text", required: true },
      { name: "active", type: "bool" },
    ],
  });
  app.save(staff);

  // ---- counters ---------------------------------------------------------
  const counters = new Collection({
    type: "base",
    name: "counters",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 100 },
      { name: "active", type: "bool" },
    ],
  });
  app.save(counters);

  // ---- tickets ------------------------------------------------------
  const tickets = new Collection({
    type: "base",
    name: "tickets",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "qr_code", type: "text", required: true, max: 255 },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["valid", "redeemed", "void"],
      },
      { name: "assigned_number", type: "number", onlyInt: true },
      {
        name: "counter_id",
        type: "relation",
        collectionId: counters.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        name: "staff_id",
        type: "relation",
        collectionId: staff.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      { name: "scanned_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_tickets_qr_code ON tickets (qr_code)",
      "CREATE INDEX idx_tickets_status ON tickets (status)",
    ],
  });
  app.save(tickets);

  // ---- ticket_events (full audit trail) --------------------------------
  const ticketEvents = new Collection({
    type: "base",
    name: "ticket_events",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        name: "ticket_id",
        type: "relation",
        required: true,
        collectionId: tickets.id,
        maxSelect: 1,
        cascadeDelete: false, // keep the audit trail even if a ticket is ever removed
      },
      {
        name: "event_type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "scanned",
          "duplicate_attempt",
          "voided",
          "reopened",
          "conflict_flagged",
          "conflict_resolved",
        ],
      },
      {
        name: "actor_staff_id",
        type: "relation",
        collectionId: staff.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        name: "counter_id",
        type: "relation",
        collectionId: counters.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      // Required for overrides / conflict resolutions; the redeem route
      // itself doesn't set this, only the future superadmin override route.
      { name: "note", type: "text", max: 500 },
      // What the device thought — may drift, never used for ordering.
      { name: "device_scan_time", type: "date" },
      // Authoritative for ordering. Auto-set server-side on create so it
      // can't be spoofed or drift like device_scan_time can.
      { name: "server_time", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: [
      "CREATE INDEX idx_ticket_events_ticket ON ticket_events (ticket_id)",
      "CREATE INDEX idx_ticket_events_type ON ticket_events (event_type)",
    ],
  });
  app.save(ticketEvents);
}, (app) => {
  // Down: drop in reverse dependency order.
  for (const name of ["ticket_events", "tickets", "counters", "staff"]) {
    const c = app.findCollectionByNameOrId(name);
    if (c) app.delete(c);
  }
});
