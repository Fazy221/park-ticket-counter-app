import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { pb } from "@/lib/pb";
import { ClientResponseError } from "pocketbase";
import type { Counter } from "@/lib/types";

export function CounterFormDialog({
  open,
  onClose,
  counter,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  counter: Counter | null; // null = creating
  onSaved: () => void;
}) {
  const isEdit = counter !== null;
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(counter?.name ?? "");
    setActive(counter?.active ?? true);
    setError(null);
  }, [open, counter]);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await pb.collection("counters").update(counter!.id, { name: name.trim(), active });
      } else {
        await pb.collection("counters").create({ name: name.trim(), active });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ClientResponseError ? err.response?.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit counter" : "Add counter"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {isEdit ? "Save changes" : "Create counter"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Label htmlFor="counter-name">Name</Label>
          <Input id="counter-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-gatemark-primary focus:ring-gatemark-primary"
          />
          Active (shows up in scan totals and can be assigned to devices)
        </label>
      </div>
    </Dialog>
  );
}
