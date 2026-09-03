import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { ReasonDialog } from "@/components/ReasonDialog";
import { TicketDetailDialog } from "@/components/TicketDetailDialog";
import { useOpenConflicts, type ExpandedConflictEvent } from "@/hooks/useOpenConflicts";
import { formatDateTime, assignedNumberLabel } from "@/lib/format";
import { resolveConflict } from "@/lib/api";
import type { Ticket } from "@/lib/types";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function Conflicts() {
  const { open, loading, reload } = useOpenConflicts();
  const [resolving, setResolving] = useState<ExpandedConflictEvent | null>(null);
  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Conflicts</h1>
        <p className="mt-1 text-sm text-slate-500">
          A device queued a scan offline and lost the race against an earlier redemption
          elsewhere — staff may have already let that customer through on a false-positive
          local read. Each one here needs a human look.
        </p>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <Spinner />
          ) : open.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No open conflicts"
              description="Nothing currently needs review. Conflicts show up here automatically if a device's offline queue ever loses a race against another counter."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {open.map((ev) => (
                <li key={ev.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gatemark-pendingBg">
                    <AlertTriangle className="h-4 w-4 text-gatemark-pending" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      Ticket #{assignedNumberLabel(ev.expand?.ticket_id?.assigned_number)}{" "}
                      <span className="font-mono text-xs font-normal text-slate-400">
                        {ev.expand?.ticket_id?.qr_code}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{ev.note}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Flagged {formatDateTime(ev.server_time)}
                      {ev.expand?.actor_staff_id && ` · ${ev.expand.actor_staff_id.name}`}
                      {ev.expand?.counter_id && ` · ${ev.expand.counter_id.name}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => ev.expand?.ticket_id && setViewingTicket(ev.expand.ticket_id)}
                    >
                      View ticket
                    </Button>
                    <Button size="sm" onClick={() => setResolving(ev)}>
                      Resolve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ReasonDialog
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title="Resolve conflict"
        confirmLabel="Mark resolved"
        onConfirm={async (note) => {
          if (!resolving) return;
          await resolveConflict({ ticket_id: resolving.ticket_id, note });
          reload();
        }}
      />

      <TicketDetailDialog
        ticket={viewingTicket}
        open={viewingTicket !== null}
        onClose={() => setViewingTicket(null)}
        onChanged={(updated) => setViewingTicket(updated)}
      />
    </div>
  );
}
