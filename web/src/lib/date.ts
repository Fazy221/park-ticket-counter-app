// PocketBase stores date/autodate fields as "YYYY-MM-DD HH:mm:ss.sssZ" (a
// space, not "T"), and its filter engine compares date fields as plain
// text - see the detailed note in backend/pb_hooks/session_log.pb.js.
// A "T"-formatted boundary (plain Date#toISOString()) silently matches
// nothing in a >=/<= filter against a same-day value. Every filter this
// app builds against scanned_at or server_time has to go through this.
export function toPbFilterDate(d: Date): string {
  return d.toISOString().replace("T", " ");
}

// Local midnight for "today" - this app only ever runs on the same
// on-site laptop as the PocketBase server it's viewing (see README), so
// there's no cross-timezone ambiguity to worry about the way the mobile
// devices' own local-midnight computation has to guard against.
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function todayRangeFilter(field: string): string {
  return `${field} >= "${toPbFilterDate(startOfToday())}"`;
}
