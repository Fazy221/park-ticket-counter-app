/// <reference path="../pb_data/types.d.ts" />

// POST /api/redeem
// body: { qr_code, counter_id, idempotency_key, device_scan_time?, was_queued_offline? }
// auth: staff-scoped token (see /api/staff-login in auth.pb.js)
//
// was_queued_offline: set by the mobile queue (see queue.ts) when this scan
// attempt was, at some point before this request, genuinely stuck in a
// "Pending sync" state because the device couldn't reach the server - not
// just idempotency-retry churn. Used below to tell a conflict apart from an
// ordinary live duplicate; see the note on the duplicate branch.
//
// idempotency_key: client-generated, one per scan attempt, resent verbatim
// on every retry of that same attempt. Backed by the redeem_attempts
// collection (1740000200_redeem_idempotency.js) - see the note inside the
// transaction below for what this closes.
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
    idempotency_key: "",
    was_queued_offline: false,
  });
  e.bindBody(data);

  if (!data.qr_code || !data.counter_id || !data.idempotency_key) {
    throw new BadRequestError("qr_code, counter_id and idempotency_key are required");
  }
  if (data.idempotency_key.length > 100) {
    throw new BadRequestError("idempotency_key is too long");
  }

  const staffId = e.auth.id;
  if (!e.auth.getBool("active")) {
    throw new ForbiddenError("This staff account has been deactivated");
  }

  let result;

  $app.runInTransaction((txApp) => {
    // True idempotency (closes the gap flagged in the README): the client
    // generates this key once per scan attempt and resends the *same* key
    // on every retry of that attempt (see queue.ts). If a request tagged
    // with this key already committed, this is a retry whose response
    // never reached the phone - replay the cached result byte-for-byte and
    // touch nothing else, rather than re-deriving an answer from current
    // ticket state (which may have moved on since - e.g. an undo in
    // between). Checked inside the same transaction as everything else
    // below so it benefits from the same single-writer serialization
    // already relied on elsewhere in this file: no other request touching
    // this key can be mid-flight concurrently.
    let cached = null;
    try {
      const attempt = txApp.findFirstRecordByFilter(
        "redeem_attempts",
        "idempotency_key = {:key}",
        { key: data.idempotency_key }
      );
      cached = JSON.parse(attempt.get("result_json"));
    } catch (err) {
      // No attempt recorded under this key yet - first time we're seeing it.
    }

    if (cached) {
      result = cached;
      return;
    }

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
      //
      // Conflict vs. ordinary duplicate: an ordinary duplicate_attempt is a
      // live rejection - staff scan an already-used ticket and see "already
      // redeemed" right there, nothing ambiguous happened. A conflict is
      // narrower: this specific attempt was, at some point before now,
      // genuinely stuck offline showing "Pending sync" (was_queued_offline),
      // meaning staff may have already waved the customer through on a
      // false-positive local read before the device ever found out this
      // ticket had already been redeemed elsewhere. That's a real
      // discrepancy worth a human looking at, not just a rejected scan - so
      // it gets its own event_type instead of being lumped in with the
      // ordinary case.
      const isConflict = !!data.was_queued_offline;
      const event = new Record(eventsCollection);
      event.set("ticket_id", ticket.id);
      event.set("event_type", isConflict ? "conflict_flagged" : "duplicate_attempt");
      event.set("actor_staff_id", staffId);
      event.set("counter_id", data.counter_id);
      if (data.device_scan_time) event.set("device_scan_time", data.device_scan_time);
      if (isConflict) {
        event.set(
          "note",
          "Device queued this scan while offline and lost the race against an earlier " +
            `redemption (ticket already ${ticket.get("status")} as of this check).`
        );
      }
      txApp.save(event);

      // "who/when/where it was already redeemed" for the app to show.
      result = {
        status: ticket.get("status"), // 'redeemed' or 'void'
        ticket_id: ticket.id,
        assigned_number: ticket.get("assigned_number"),
        original_staff_id: ticket.get("staff_id"),
        original_counter_id: ticket.get("counter_id"),
        original_scanned_at: ticket.get("scanned_at"),
        conflict: isConflict,
      };
    }

    // Record what we're handing back, keyed to this attempt, so a
    // lost-response retry (same key) replays this exact result above
    // instead of falling into the branch logic again.
    const attemptsCollection = txApp.findCollectionByNameOrId("redeem_attempts");
    const attemptRecord = new Record(attemptsCollection);
    attemptRecord.set("idempotency_key", data.idempotency_key);
    attemptRecord.set("result_json", JSON.stringify(result));
    txApp.save(attemptRecord);
  });

  return e.json(200, result);
}, $apis.requireAuth("staff"));
