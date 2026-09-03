import { useState } from "react";
import { useLiveList } from "@/hooks/useLiveList";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { CounterFormDialog } from "@/components/CounterFormDialog";
import type { Counter } from "@/lib/types";
import { Plus, MonitorCheck, Pencil } from "lucide-react";

export function Counters() {
  const { items, loading, reload } = useLiveList<Counter>("counters", { sort: "name" });
  const [editing, setEditing] = useState<Counter | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Counters</h1>
          <p className="mt-1 text-sm text-slate-500">Scan stations that devices point at</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add counter
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState icon={MonitorCheck} title="No counters yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm font-medium text-slate-800">{c.name}</span>
                  <div className="flex items-center gap-3">
                    <Badge tone={c.active ? "success" : "danger"}>
                      {c.active ? "Active" : "Deactivated"}
                    </Badge>
                    <button
                      onClick={() => setEditing(c)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <CounterFormDialog
        open={editing !== null}
        counter={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
      <CounterFormDialog
        open={creating}
        counter={null}
        onClose={() => setCreating(false)}
        onSaved={reload}
      />
    </div>
  );
}
