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

// ---- Reports date-range presets ----
// All boundaries are local-time (this app only ever runs on the same
// on-site laptop as PocketBase - see the note on startOfToday above), and
// "end" is always exclusive-of-tomorrow (i.e. end of the last included
// day, 23:59:59.999) so a same-day range still matches everything from
// that day rather than nothing.
export type DateRangePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "custom";

export function presetLabel(preset: DateRangePreset): string {
  return {
    today: "Today",
    yesterday: "Yesterday",
    last7: "Last 7 days",
    last30: "Last 30 days",
    thisMonth: "This month",
    custom: "Custom range",
  }[preset];
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

// Returns { start, end } as Date objects for every preset except "custom",
// which the caller supplies explicitly (there's no computed range for it).
export function rangeForPreset(preset: Exclude<DateRangePreset, "custom">): {
  start: Date;
  end: Date;
} {
  switch (preset) {
    case "today":
      return { start: startOfToday(), end: endOfDay(new Date()) };
    case "yesterday": {
      const y = daysAgo(1);
      return { start: y, end: endOfDay(y) };
    }
    case "last7":
      return { start: daysAgo(6), end: endOfDay(new Date()) };
    case "last30":
      return { start: daysAgo(29), end: endOfDay(new Date()) };
    case "thisMonth": {
      const start = startOfToday();
      start.setDate(1);
      return { start, end: endOfDay(new Date()) };
    }
  }
}

export function serverTimeRangeFilter(start: Date, end: Date): string {
  return `server_time >= "${toPbFilterDate(start)}" && server_time <= "${toPbFilterDate(end)}"`;
}

// For filenames and on-screen display - plain YYYY-MM-DD, no time.
export function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
