import { useMemo } from "react";
import { useLiveList } from "./useLiveList";
import type { TicketEvent, Ticket, Staff, Counter } from "@/lib/types";

export type ExpandedConflictEvent = TicketEvent & {
  expand?: {
    ticket_id?: Ticket;
    actor_staff_id?: Staff;
    counter_id?: Counter;
  };
};

// "Open" conflicts aren't a stored boolean - they're derived from the
// ticket_events log itself (see the note in conflict_resolve.pb.js): a
// conflict_flagged event is open unless a later conflict_resolved event
// exists for the same ticket_id. Two separate live queries (one per
// event_type) rather than one broader query + client-side type split,
// since PocketBase's filter syntax handles "event_type = X" cleanly but
// there's no server-side way to express "the latest event per ticket_id"
// - that grouping has to happen here regardless.
export function useOpenConflicts() {
  const flagged = useLiveList<ExpandedConflictEvent>("ticket_events", {
    filter: `event_type = "conflict_flagged"`,
    sort: "-server_time",
    perPage: 200,
    expand: "ticket_id,actor_staff_id,counter_id",
  });
  const resolved = useLiveList<ExpandedConflictEvent>("ticket_events", {
    filter: `event_type = "conflict_resolved"`,
    sort: "-server_time",
    perPage: 200,
  });

  const open = useMemo(() => {
    const latestResolvedByTicket = new Map<string, string>(); // ticket_id -> server_time
    for (const ev of resolved.items) {
      const existing = latestResolvedByTicket.get(ev.ticket_id);
      if (!existing || ev.server_time > existing) {
        latestResolvedByTicket.set(ev.ticket_id, ev.server_time);
      }
    }
    // Keep only the most recent flagged event per ticket - if a ticket was
    // somehow flagged twice before being resolved, that's one open
    // conflict to review, not two rows.
    const latestFlaggedByTicket = new Map<string, ExpandedConflictEvent>();
    for (const ev of flagged.items) {
      const existing = latestFlaggedByTicket.get(ev.ticket_id);
      if (!existing || ev.server_time > existing.server_time) {
        latestFlaggedByTicket.set(ev.ticket_id, ev);
      }
    }
    return Array.from(latestFlaggedByTicket.values())
      .filter((ev) => {
        const resolvedAt = latestResolvedByTicket.get(ev.ticket_id);
        return !resolvedAt || resolvedAt < ev.server_time;
      })
      .sort((a, b) => (a.server_time < b.server_time ? 1 : -1));
  }, [flagged.items, resolved.items]);

  return {
    open,
    loading: flagged.loading || resolved.loading,
    error: flagged.error || resolved.error,
    reload: () => {
      flagged.reload();
      resolved.reload();
    },
  };
}
