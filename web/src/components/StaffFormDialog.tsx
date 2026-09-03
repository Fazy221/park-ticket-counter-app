import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { pb } from "@/lib/pb";
import { slugifyUsername } from "@/lib/slug";
import { ClientResponseError } from "pocketbase";
import type { Staff, StaffRole } from "@/lib/types";

export function StaffFormDialog({
  open,
  onClose,
  staff,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  staff: Staff | null; // null = creating
  onSaved: () => void;
}) {
  const isEdit = staff !== null;
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [role, setRole] = useState<StaffRole>("counter_staff");
  const [active, setActive] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(staff?.name ?? "");
    setUsername(staff?.username ?? "");
    setUsernameTouched(false);
    setRole(staff?.role ?? "counter_staff");
    setActive(staff?.active ?? true);
    setPin("");
    setError(null);
  }, [open, staff]);

  function handleNameChange(value: string) {
    setName(value);
    if (!usernameTouched) setUsername(slugifyUsername(value));
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !username.trim()) {
      setError("Name and username are required.");
      return;
    }
    if (!isEdit && pin.trim().length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        const payload: Record<string, unknown> = {
          name: name.trim(),
          username: username.trim(),
          role,
          active,
        };
        if (pin.trim()) {
          payload.password = pin.trim();
          payload.passwordConfirm = pin.trim();
        }
        await pb.collection("staff").update(staff!.id, payload);
      } else {
        await pb.collection("staff").create({
          name: name.trim(),
          username: username.trim(),
          role,
          active,
          password: pin.trim(),
          passwordConfirm: pin.trim(),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ClientResponseError) {
        const usernameErr = err.response?.data?.username?.message;
        setError(usernameErr || err.response?.message || "Failed to save");
      } else {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit staff" : "Add staff"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {isEdit ? "Save changes" : "Create staff"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div>
          <Label htmlFor="staff-name">Name</Label>
          <Input
            id="staff-name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="staff-username">Username (used to log in)</Label>
          <Input
            id="staff-username"
            value={username}
            onChange={(e) => {
              setUsernameTouched(true);
              setUsername(e.target.value);
            }}
          />
        </div>

        <div>
          <Label htmlFor="staff-role">Role</Label>
          <Select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            <option value="counter_staff">Counter staff</option>
            <option value="superadmin">Superadmin</option>
          </Select>
        </div>

        <div>
          <Label htmlFor="staff-pin">{isEdit ? "Reset PIN (leave blank to keep current)" : "PIN"}</Label>
          <Input
            id="staff-pin"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={isEdit ? "••••" : "At least 4 digits"}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-gatemark-primary focus:ring-gatemark-primary"
          />
          Active (can log in and scan)
        </label>
      </div>
    </Dialog>
  );
}
