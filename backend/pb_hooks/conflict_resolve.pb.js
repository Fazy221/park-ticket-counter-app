/// <reference path="../pb_data/types.d.ts" />

// POST /api/conflict-resolve
// body: { ticket_id, note }
// auth: staff-scoped token, role must be "superadmin"
//
// Backs the "resolve" action in the web superadmin's Conflicts queue (plan
// section 6, #3). A conflict_flagged event (see redeem.pb.js) means a
// device's queued scan lost a race against an earlier sync and staff may
// have already let that customer through on a false-positive local read -
// this route is how a superadmin records "I looked into this one and here's
// what happened / what we did about it."
//
// Deliberately doesn't touch ticket.status - resolving a conflict is a
// determination, not necessarily a status change (e.g. "confirmed the
// customer was turned away correctly, no action needed" is a valid
// resolution). If the investigation concludes the ticket genuinely needs
// to be voided or reopened, that's a separate call to
// /api/ticket-override - keeping the two actions apart means the audit
// trail shows the resolution note and any resulting status change as their
// own distinct events rather than conflating them.
//
// Which conflicts are still "open" isn't tracked with a boolean flag -
// it's derived by the web app from the ticket_events log itself: a
// conflict_flagged event is open unless a later conflict_resolved event
// exists for the same ticket_id.
routerAdd("POST", "/api/conflict-resolve", (e) => {
  const data = new DynamicModel({ ticket_id: "", note: "" });
  e.bindBody(data);

  if (!data.ticket_id) {
    throw new BadRequestError("ticket_id is required");
  }
  if (!data.note || !data.note.trim()) {
    throw new BadRequestError("A resolution note is required");
  }
  if (data.note.length > 500) {
    throw new BadRequestError("Note is too long (max 500 characters)");
  }
  if (e.auth.get("role") !== "superadmin") {
    throw new ForbiddenError("Only a superadmin can resolve a conflict");
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

    // "Open" means the most recent conflict_flagged event is newer than the
    // most recent conflict_resolved event (or there's no resolution yet) -
    // guards against resolving a conflict twice, while still allowing a
    // ticket to be flagged, resolved, and (rare, but possible) flagged
    // again later as its own new open conflict.
    const lastFlagged = txApp.findRecordsByFilter(
      "ticket_events",
      "ticket_id = {:ticket_id} && event_type = 'conflict_flagged'",
      "-server_time",
      1,
      0,
      { ticket_id: ticket.id }
    );
    if (lastFlagged.length === 0) {
      throw new BadRequestError("This ticket has no flagged conflict to resolve");
    }
    const lastResolved = txApp.findRecordsByFilter(
      "ticket_events",
      "ticket_id = {:ticket_id} && event_type = 'conflict_resolved'",
      "-server_time",
      1,
      0,
      { ticket_id: ticket.id }
    );
    if (
      lastResolved.length > 0 &&
      lastResolved[0].get("server_time") >= lastFlagged[0].get("server_time")
    ) {
      throw new BadRequestError("This ticket's conflict has already been resolved");
    }

    const eventsCollection = txApp.findCollectionByNameOrId("ticket_events");
    const event = new Record(eventsCollection);
    event.set("ticket_id", ticket.id);
    event.set("event_type", "conflict_resolved");
    event.set("actor_staff_id", staffId);
    event.set("note", data.note);
    txApp.save(event);

    result = { ticket_id: ticket.id, resolved: true };
  });

  return e.json(200, result);
}, $apis.requireAuth("staff"));
