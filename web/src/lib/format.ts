import type { TicketEventType, TicketStatus } from "@/lib/types";

export const statusLabel: Record<TicketStatus, string> = {
  valid: "Not scanned",
  redeemed: "Redeemed",
  void: "Void",
};

export const statusTone: Record<TicketStatus, "neutral" | "success" | "danger"> = {
  valid: "neutral",
  redeemed: "success",
  void: "danger",
};

export const eventLabel: Record<TicketEventType, string> = {
  scanned: "Scanned",
  duplicate_attempt: "Duplicate attempt",
  conflict_flagged: "Conflict flagged",
  conflict_resolved: "Conflict resolved",
  voided: "Voided",
  reopened: "Reopened",
};

export const eventTone: Record<
  TicketEventType,
  "neutral" | "success" | "danger" | "pending" | "primary"
> = {
  scanned: "success",
  duplicate_attempt: "neutral",
  conflict_flagged: "pending",
  conflict_resolved: "success",
  voided: "danger",
  reopened: "primary",
};

// PocketBase date strings are "YYYY-MM-DD HH:mm:ss.sssZ" (space, not "T") -
// still parseable by `new Date()` in every modern browser, but normalized
// here in one place in case that ever needs a manual replace() fallback.
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// assigned_number is only ever set once a ticket is actually redeemed
// (starts counting from 1 - see redeem.pb.js), so 0 always means "not
// assigned yet". PocketBase serializes an unset number field as 0, not
// null, so a plain `?? "—"` doesn't catch it - this does.
export function assignedNumberLabel(n: number | null | undefined): string {
  return n ? String(n) : "—";
}
