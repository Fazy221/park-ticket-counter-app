import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TicketHistory } from "@/components/TicketHistory";
import { ReasonDialog } from "@/components/ReasonDialog";
import { statusLabel, statusTone, assignedNumberLabel } from "@/lib/format";
import { overrideTicket } from "@/lib/api";
import { pb } from "@/lib/pb";
import type { Ticket } from "@/lib/types";
import { Ban, RotateCcw } from "lucide-react";

export function TicketDetailDialog({
  ticket,
  open,
  onClose,
  onChanged,
}: {
  ticket: Ticket | null;
  open: boolean;
  onClose: () => void;
  onChanged?: (updated: Ticket) => void;
}) {
  const [action, setAction] = useState<"void" | "reopen" | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  if (!ticket) return null;

  async function handleOverride(note: string) {
    if (!ticket || !action) return;
    await overrideTicket({ ticket_id: ticket.id, action, note });
    const updated = await pb.collection("tickets").getOne<Ticket>(ticket.id);
    setHistoryKey((k) => k + 1);
    onChanged?.(updated);
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={`Ticket #${assignedNumberLabel(ticket.assigned_number)}`}
        footer={
          <>
            {ticket.status !== "void" && (
              <Button variant="danger" size="sm" onClick={() => setAction("void")}>
                <Ban className="h-3.5 w-3.5" /> Void
              </Button>
            )}
            {ticket.status !== "valid" && (
              <Button variant="secondary" size="sm" onClick={() => setAction("reopen")}>
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <div>
              <p className="font-mono text-xs text-slate-500">{ticket.qr_code}</p>
            </div>
            <Badge tone={statusTone[ticket.status]}>{statusLabel[ticket.status]}</Badge>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              History
            </p>
            <TicketHistory ticketId={ticket.id} refreshKey={historyKey} />
          </div>
        </div>
      </Dialog>

      <ReasonDialog
        open={action !== null}
        onClose={() => setAction(null)}
        title={action === "void" ? "Void this ticket" : "Reopen this ticket"}
        confirmLabel={action === "void" ? "Void ticket" : "Reopen ticket"}
        danger={action === "void"}
        onConfirm={handleOverride}
      />
    </>
  );
}
