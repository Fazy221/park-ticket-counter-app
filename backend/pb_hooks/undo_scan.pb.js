/// <reference path="../pb_data/types.d.ts" />

// POST /api/undo-scan
// body: { ticket_id }
// auth: staff-scoped token
//
// Mobile-only "undo my last scan" (plan section 5, screen 3): a self-
// service fix for an obvious mis-scan, without walking over to the
// superadmin app. Deliberately narrow:
//   - only the *scanned* event can be undone, not a duplicate_attempt
//     (there's nothing to undo on a rejected scan)
//   - only within UNDO_WINDOW_SECONDS of the original scan, checked
//     against server_time (never device_scan_time, which can drift)
//   - only by the same staff token that made the scan
// Anything outside that window, or reopening an older ticket, is not
// available here on purpose - it goes through the superadmin Tickets
// screen (plan section 6, #2), which requires a reason and is logged the
// same way.
const UNDO_WINDOW_SECONDS = 120;

routerAdd("POST", "/api/undo-scan", (e) => {
  const data = new DynamicModel({ ticket_id: "" });
  e.bindBody(data);

  if (!data.ticket_id) {
    throw new BadRequestError("ticket_id is required");
  }

  const staffId = e.auth.id;
  let result;

  $app.runInTransaction((txApp) => {
    let ticket;
    try {
      ticket = txApp.findRecordById("tickets", data.ticket_id);
    } catch (err) {
      throw new NotFoundError("Unknown ticket_id");
    }

    if (ticket.get("status") !== "redeemed") {
      throw new BadRequestError("Only a redeemed ticket can be undone");
    }

    // Most recent 'scanned' event for this ticket. findFirstRecordByFilter
    // doesn't take a sort argument, so this uses findRecordsByFilter with
    // limit 1 and an explicit sort instead.
    const recentScans = txApp.findRecordsByFilter(
      "ticket_events",
      "ticket_id = {:ticket_id} && event_type = 'scanned'",
      "-server_time",
      1,
      0,
      { ticket_id: ticket.id }
    );
    if (recentScans.length === 0) {
      throw new BadRequestError("No scan event found for this ticket");
    }
    const lastScan = recentScans[0];

    if (lastScan.get("actor_staff_id") !== staffId) {
      throw new ForbiddenError("Only the staff member who scanned this ticket can undo it");
    }

    const scannedAt = new Date(lastScan.get("server_time"));
    const ageSeconds = (Date.now() - scannedAt.getTime()) / 1000;
    if (ageSeconds > UNDO_WINDOW_SECONDS) {
      throw new ForbiddenError(
        `Undo window has passed (${Math.floor(ageSeconds)}s ago, limit ${UNDO_WINDOW_SECONDS}s). ` +
          "Use the superadmin app to reopen this ticket instead."
      );
    }

    ticket.set("status", "valid");
    ticket.set("assigned_number", null);
    ticket.set("counter_id", null);
    ticket.set("staff_id", null);
    ticket.set("scanned_at", null);
    txApp.save(ticket);

    const eventsCollection = txApp.findCollectionByNameOrId("ticket_events");
    const event = new Record(eventsCollection);
    event.set("ticket_id", ticket.id);
    event.set("event_type", "reopened");
    event.set("actor_staff_id", staffId);
    event.set("counter_id", lastScan.get("counter_id"));
    event.set("note", `Self-service undo, ${Math.floor(ageSeconds)}s after scan`);
    txApp.save(event);

    result = { status: "valid", ticket_id: ticket.id };
  });

  return e.json(200, result);
}, $apis.requireAuth("staff"));
