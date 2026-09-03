import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Textarea, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

// Backs both "void/reopen a ticket" and "resolve a conflict" - both are
// server routes that hard-require a non-empty note (see the validation in
// ticket_override.pb.js / conflict_resolve.pb.js), so this is the one
// place that UI requirement lives instead of being duplicated per screen.
export function ReasonDialog({
  open,
  onClose,
  title,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    if (submitting) return;
    setNote("");
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!note.trim()) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(note.trim());
      setNote("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={handleConfirm}
            loading={submitting}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Required - this is written to the ticket's audit trail"
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  );
}
