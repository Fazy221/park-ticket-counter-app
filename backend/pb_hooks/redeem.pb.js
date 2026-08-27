/// <reference path="../pb_data/types.d.ts" />

// POST /api/redeem
// body: { qr_code, counter_id, device_scan_time? }
// auth: staff-scoped token (see /api/staff-login in auth.pb.js)
//
// This is the one endpoint the counter app actually calls on every scan.
// It has to be atomic: two devices hitting this at once for the same QR
// must never both "win".
//
// PocketBase only ever runs one write transaction at a time per app (it's
// documented as a single-writer model - see "Inside the transaction always
// use txApp, not $app, because we allow only a single writer/transaction at
// a time"). That means a plain read-check-write *inside* $app.runInTransaction
// is already race-safe here - there's no way for a second call to interleave
// between the read and the write, because the second call's transaction
// can't start until this one commits or rolls back. That's what replaces
// the raw `UPDATE ... WHERE status = 'valid'` trick from the original SQL
// draft: same guarantee, ordinary Record API.
//
// CHANGE FROM THE FIRST VERSION: staff_id used to come from the request
// body, which meant any caller with *a* valid token (only the superuser,
// at the time) could redeem "as" any staff id they typed in. Now that
// staff login exists (see 1740000100_staff_auth.js), the route requires a
// token from the `staff` auth collection specifically and takes the actor
// from that token - the client can no longer claim to be a different
// staff member than the one it authenticated as.
routerAdd("POST", "/api/redeem", (e) => {
  const data = new DynamicModel({
    qr_code: "",
    counter_id: "",
    device_scan_time: "",
  });
  e.bindBody(data);

  if (!data.qr_code || !data.counter_id) {
    throw new BadRequestError("qr_code and counter_id are required");
  }

  const staffId = e.auth.id;
  if (!e.auth.getBool("active")) {
    throw new ForbiddenError("This staff account has been deactivated");
  }

  let result;

  $app.runInTransaction((txApp) => {
      let ticket;
  try {
    ticket = txApp.findFirstRecordByFilter(
      "tickets",
      "qr_code = {:qr_code}",
      { qr_code: data.qr_code }
    );
  } catch (err) {
    // No local record for this QR code - GateMark never receives Funland's
    // own ticket data, so as far as this system is concerned, the first
    // scan of any code *is* that ticket's creation. Create it as "valid"
    // and fall straight into the normal redemption branch below, so every
    // later scan of the same code correctly reports as a duplicate instead
    // of creating a second ticket.
    const ticketsCollection = txApp.findCollectionByNameOrId("tickets");
    ticket = new Record(ticketsCollection);
    ticket.set("qr_code", data.qr_code);
    ticket.set("status", "valid");
    txApp.save(ticket);
  }
    let counter;
    try {
      counter = txApp.findRecordById("counters", data.counter_id);
    } catch (err) {
      throw new BadRequestError("Unknown counter_id");
    }
    if (!counter.getBool("active")) {
      throw new BadRequestError("This counter is not active");
    }

    const eventsCollection = txApp.findCollectionByNameOrId("ticket_events");
    const now = new Date().toISOString();

    if (ticket.get("status") === "valid") {
      // Sequential number, staff-facing only. Safe under the single-writer
      // guarantee described above - no separate counter/sequence table needed.
      const nextNumberRow = arrayOf(new DynamicModel({ next_number: 0 }));
      txApp
        .db()
        .newQuery(
          "SELECT COALESCE(MAX(assigned_number), 0) + 1 AS next_number FROM tickets"
        )
        .all(nextNumberRow);
      const nextNumber = nextNumberRow[0].next_number;

      ticket.set("status", "redeemed");
      ticket.set("assigned_number", nextNumber);
      ticket.set("counter_id", data.counter_id);
      ticket.set("staff_id", staffId);
      ticket.set("scanned_at", now);
      txApp.save(ticket);

      const event = new Record(eventsCollection);
      event.set("ticket_id", ticket.id);
      event.set("event_type", "scanned");
      event.set("actor_staff_id", staffId);
      event.set("counter_id", data.counter_id);
      if (data.device_scan_time) event.set("device_scan_time", data.device_scan_time);
      txApp.save(event);

      result = {
        status: "valid",
        ticket_id: ticket.id,
        assigned_number: nextNumber,
        scanned_at: now,
      };
    } else {
      // Already redeemed (or void) - log the attempt, never touch the ticket.
      const event = new Record(eventsCollection);
      event.set("ticket_id", ticket.id);
      event.set("event_type", "duplicate_attempt");
      event.set("actor_staff_id", staffId);
      event.set("counter_id", data.counter_id);
      if (data.device_scan_time) event.set("device_scan_time", data.device_scan_time);
      txApp.save(event);

      // "who/when/where it was already redeemed" for the app to show.
      result = {
        status: ticket.get("status"), // 'redeemed' or 'void'
        ticket_id: ticket.id,
        assigned_number: ticket.get("assigned_number"),
        original_staff_id: ticket.get("staff_id"),
        original_counter_id: ticket.get("counter_id"),
        original_scanned_at: ticket.get("scanned_at"),
      };
    }
  });

  return e.json(200, result);
}, $apis.requireAuth("staff"));
