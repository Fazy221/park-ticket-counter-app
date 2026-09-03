/// <reference path="../pb_data/types.d.ts" />

// POST /api/ticket-override
// body: { ticket_id, action: "void" | "reopen", note }
// auth: staff-scoped token, role must be "superadmin"
//
// Web superadmin's Tickets screen (plan section 6, #2) - "override status
// with required reason", distinct from mobile's self-service /api/undo-scan:
// no 2-minute window, no same-staff-member restriction, but a reason is
// mandatory and it's not limited to undoing your own most recent scan.
//
// "void" - permanently invalidate a ticket (known-fraudulent code, refunded
// order, printed by mistake, etc). Works from 'valid' or 'redeemed'; if the
// ticket was already redeemed, its redemption metadata (who/when/which
// counter) is left in place rather than cleared - voiding is an annotation
// on top of history, not an erasure of it.
//
// "reopen" - the superadmin's equivalent of undo, for when the 2-minute
// mobile window has already passed or a different staff member needs to
// fix someone else's mis-scan. Clears the redemption metadata the same way
// /api/undo-scan does, so the ticket can be legitimately rescanned and get
// a fresh assigned_number. Works from 'redeemed' or 'void'.
routerAdd("POST", "/api/ticket-override", (e) => {
  const data = new DynamicModel({ ticket_id: "", action: "", note: "" });
  e.bindBody(data);

  if (!data.ticket_id || !data.action) {
    throw new BadRequestError("ticket_id and action are required");
  }
  if (data.action !== "void" && data.action !== "reopen") {
    throw new BadRequestError("action must be 'void' or 'reopen'");
  }
  if (!data.note || !data.note.trim()) {
    throw new BadRequestError("A reason is required for any override");
  }
  if (data.note.length > 500) {
    throw new BadRequestError("Reason is too long (max 500 characters)");
  }

  // requireAuth("staff") below only checks it's a valid staff token, not
  // which role - counter_staff must not be able to hit this route, so the
  // role check happens here explicitly, same pattern as the "active" check
  // in redeem.pb.js.
  if (e.auth.get("role") !== "superadmin") {
    throw new ForbiddenError("Only a superadmin can override a ticket");
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

    const eventsCollection = txApp.findCollectionByNameOrId("ticket_events");
    const event = new Record(eventsCollection);
    event.set("ticket_id", ticket.id);
    event.set("actor_staff_id", staffId);
    event.set("note", data.note);

    if (data.action === "void") {
      if (ticket.get("status") === "void") {
        throw new BadRequestError("Ticket is already void");
      }
      ticket.set("status", "void");
      txApp.save(ticket);

      event.set("event_type", "voided");
      txApp.save(event);
    } else {
      // reopen
      if (ticket.get("status") === "valid") {
        throw new BadRequestError("Ticket isn't redeemed or void - nothing to reopen");
      }
      ticket.set("status", "valid");
      ticket.set("assigned_number", null);
      ticket.set("counter_id", null);
      ticket.set("staff_id", null);
      ticket.set("scanned_at", null);
      txApp.save(ticket);

      event.set("event_type", "reopened");
      txApp.save(event);
    }

    result = { status: ticket.get("status"), ticket_id: ticket.id };
  });

  return e.json(200, result);
}, $apis.requireAuth("staff"));
