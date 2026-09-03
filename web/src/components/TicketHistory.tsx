import { useEffect, useState } from "react";
import { pb } from "@/lib/pb";
import { isAutoCancel } from "@/lib/pbErrors";
import { eventLabel, eventTone, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/EmptyState";
import type { Counter, Staff, TicketEvent } from "@/lib/types";

type ExpandedEvent = TicketEvent & {
  expand?: { actor_staff_id?: Staff; counter_id?: Counter };
};

export function TicketHistory({ ticketId, refreshKey }: { ticketId: string; refreshKey?: unknown }) {
  const [events, setEvents] = useState<ExpandedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    pb.collection("ticket_events")
      .getList<ExpandedEvent>(1, 100, {
        filter: `ticket_id = "${ticketId}"`,
        sort: "-server_time",
        expand: "actor_staff_id,counter_id",
        // Keyed by ticket id (not shared with useOpenConflicts' queries
        // against the same collection) - see lib/pbErrors.ts. Switching
        // tickets quickly cancels the previous ticket's still-in-flight
        // history fetch, which is the behavior we want here.
        requestKey: `ticket-history:${ticketId}`,
      })
      .then((res) => {
        if (!cancelled) setEvents(res.items);
      })
      .catch((err) => {
        if (!isAutoCancel(err) && !cancelled) {
          console.error("Failed to load ticket history:", err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, refreshKey]);

  if (loading) return <Spinner />;
  if (events.length === 0) {
    return <p className="px-1 py-4 text-sm text-slate-400">No history for this ticket yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {events.map((ev) => (
        <li key={ev.id} className="flex gap-3 text-sm">
          <span className="mt-0.5 w-32 shrink-0 text-xs text-slate-400">
            {formatDateTime(ev.server_time)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={eventTone[ev.event_type]}>{eventLabel[ev.event_type]}</Badge>
              {ev.expand?.actor_staff_id && (
                <span className="text-xs text-slate-500">by {ev.expand.actor_staff_id.name}</span>
              )}
              {ev.expand?.counter_id && (
                <span className="text-xs text-slate-400">· {ev.expand.counter_id.name}</span>
              )}
            </div>
            {ev.note && <p className="mt-1 text-sm text-slate-600">{ev.note}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
