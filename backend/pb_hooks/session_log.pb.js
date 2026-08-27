/// <reference path="../pb_data/types.d.ts" />

// GET /api/session-log?counter_id=...&from=...&to=...
// auth: staff-scoped token
//
// Backs the mobile "Session log" screen (plan section 5, screen 4): that
// counter's scans for the day, read-only. Deliberately scoped by
// counter_id, not staff_id - the plan ties the log to "that counter",
// and a device stays at one counter even as staff rotate through it.
//
// `from`/`to` are required ISO timestamps rather than a single "date". A
// server-side "give me today" would have to guess a timezone; the device
// already knows its own local midnight, so it computes the day boundary
// and sends it explicitly. Avoids a whole class of off-by-one-day bugs
// around loadshedding-era clock drift.
routerAdd("GET", "/api/session-log", (e) => {
  const counterId = e.request.url.query().get("counter_id");
  const from = e.request.url.query().get("from");
  const to = e.request.url.query().get("to");

  if (!counterId || !from || !to) {
    throw new BadRequestError("counter_id, from, and to are required");
  }

  const events = $app.findRecordsByFilter(
    "ticket_events",
    "counter_id = {:counter_id} && server_time >= {:from} && server_time <= {:to} " +
      "&& (event_type = {:type1} || event_type = {:type2})",
    "-server_time",
    200,
    0,
    {
      counter_id: counterId,
      type1: "scanned",
      type2: "duplicate_attempt",
      from: from,
      to: to,
    }
  );

  const result = events.map((ev) => ({
    id: ev.id,
    ticket_id: ev.get("ticket_id"),
    event_type: ev.get("event_type"),
    actor_staff_id: ev.get("actor_staff_id"),
    server_time: ev.get("server_time"),
  }));

  return e.json(200, result);
}, $apis.requireAuth("staff"));
