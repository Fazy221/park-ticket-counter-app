import { useState } from "react";
import { useLiveList } from "@/hooks/useLiveList";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { StaffFormDialog } from "@/components/StaffFormDialog";
import { useAuth } from "@/context/AuthContext";
import type { Staff } from "@/lib/types";
import { Plus, Users, Pencil } from "lucide-react";

export function StaffPage() {
  const { items, loading, reload } = useLiveList<Staff>("staff", { sort: "name" });
  const { staff: currentStaff } = useAuth();
  const [editing, setEditing] = useState<Staff | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Staff</h1>
          <p className="mt-1 text-sm text-slate-500">Counter staff and superadmin accounts</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add staff
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState icon={Users} title="No staff yet" />
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Username</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {s.name}
                      {s.id === currentStaff?.id && (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{s.username}</td>
                    <td className="px-5 py-3">
                      <Badge tone={s.role === "superadmin" ? "primary" : "neutral"}>
                        {s.role === "superadmin" ? "Superadmin" : "Counter staff"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={s.active ? "success" : "danger"}>
                        {s.active ? "Active" : "Deactivated"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setEditing(s)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label={`Edit ${s.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <StaffFormDialog
        open={editing !== null}
        staff={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
      <StaffFormDialog
        open={creating}
        staff={null}
        onClose={() => setCreating(false)}
        onSaved={reload}
      />
    </div>
  );
}
