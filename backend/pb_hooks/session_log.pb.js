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
//
// Results are paged at PAGE_SIZE rather than returned as one unbounded
// array - a single counter logging more than PAGE_SIZE scans in a day was
// previously silently truncated to the most recent PAGE_SIZE with no way
// for the caller to know rows were missing. `offset` (default 0) selects
// the page; the response's `has_more` tells the caller whether to ask for
// another one. mobile/src/lib/api.ts's fetchSessionLog() loops on this to
// hand callers the full day as before - see that file, not this one, if a
// screen ever needs to know a fetch spans more than one page.
//
// PAGE_SIZE is declared inside the handler, not up here at file scope -
// see the README's "automated backend test suite" section for why a
// top-level const silently breaks the moment PocketBase actually invokes
// this handler (each hook runs as its own isolated program with no access
// to outer-scope variables).
routerAdd("GET", "/api/session-log", (e) => {
  const PAGE_SIZE = 200;
  const counterId = e.request.url.query().get("counter_id");
  const from = e.request.url.query().get("from");
  const to = e.request.url.query().get("to");
  const offsetParam = e.request.url.query().get("offset");
  const offset = offsetParam ? Number(offsetParam) : 0;

  if (!counterId || !from || !to) {
    throw new BadRequestError("counter_id, from, and to are required");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new BadRequestError("offset must be a non-negative integer");
  }

  // The device sends standard ISO 8601 ("...T...Z") via Date.toISOString().
  // PocketBase's own autodate/date fields are stored as "...  ...Z" (a
  // space instead of "T") - see server_time on ticket_events. The filter
  // engine compares date fields as plain text here, not as parsed
  // timestamps, so "2026-08-29T23:12:15Z" and "2026-08-29 23:12:15Z" don't
  // sort the way you'd expect against each other even though they're the
  // same instant: the space (0x20) sorts before "T" (0x54), so every
  // same-day stored value looks "earlier than" a "T"-formatted lower bound
  // and the range silently matches nothing. Normalizing to match storage
  // format fixes the comparison.
  const normalizedFrom = from.replace("T", " ");
  const normalizedTo = to.replace("T", " ");

  const events = $app.findRecordsByFilter(
    "ticket_events",
    "counter_id = {:counter_id} && server_time >= {:from} && server_time <= {:to} " +
      "&& (event_type = {:type1} || event_type = {:type2})",
    "-server_time",
    PAGE_SIZE,
    offset,
    {
      counter_id: counterId,
      type1: "scanned",
      type2: "duplicate_attempt",
      from: normalizedFrom,
      to: normalizedTo,
    }
  );

  const result = events.map((ev) => ({
    id: ev.id,
    ticket_id: ev.get("ticket_id"),
    event_type: ev.get("event_type"),
    actor_staff_id: ev.get("actor_staff_id"),
    server_time: ev.get("server_time"),
  }));

  // A full page doesn't guarantee there's a next one (the day could end
  // exactly on a page boundary), but it's the only cheap signal available
  // without a second count query - same trade-off "load more" pagination
  // usually makes. Worst case a caller does one extra empty-page fetch.
  return e.json(200, { results: result, has_more: events.length === PAGE_SIZE });
}, $apis.requireAuth("staff"));