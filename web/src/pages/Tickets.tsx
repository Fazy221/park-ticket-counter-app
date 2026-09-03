import { useEffect, useState } from "react";
import { pb } from "@/lib/pb";
import { isAutoCancel } from "@/lib/pbErrors";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { statusLabel, statusTone, formatDateTime, assignedNumberLabel } from "@/lib/format";
import { TicketDetailDialog } from "@/components/TicketDetailDialog";
import type { Counter, Staff, Ticket, TicketStatus } from "@/lib/types";
import { Search, Ticket as TicketIcon } from "lucide-react";

type ExpandedTicket = Ticket & { expand?: { staff_id?: Staff; counter_id?: Counter } };

const PAGE_SIZE = 50;

export function Tickets() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [tickets, setTickets] = useState<ExpandedTicket[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const filters: string[] = [];
    const trimmed = search.trim();
    if (trimmed) {
      // qr_code substring match plus an exact assigned_number match when
      // the search term is purely numeric - covers both "type in the
      // printed code" and "type in the number staff quoted on the radio".
      const escaped = trimmed.replace(/"/g, '\\"');
      if (/^\d+$/.test(trimmed)) {
        filters.push(`(qr_code ~ "${escaped}" || assigned_number = ${Number(trimmed)})`);
      } else {
        filters.push(`qr_code ~ "${escaped}"`);
      }
    }
    if (status) filters.push(`status = "${status}"`);

    pb.collection("tickets")
      .getList<ExpandedTicket>(1, PAGE_SIZE, {
        filter: filters.join(" && "),
        // No creation-order field exists on tickets (see the note in
        // lib/types.ts) - sorting by most-recently-scanned is the closest
        // available proxy for "recent activity", and everything still
        // unscanned (scanned_at empty) just clumps together, which is fine
        // since this page's main job is search, not a chronological feed.
        sort: "-scanned_at",
        expand: "staff_id,counter_id",
        // Shared key across every search/filter change on purpose - a new
        // keystroke's request should cancel a still-in-flight older one
        // rather than risk it winning the race and overwriting fresher
        // results (see lib/pbErrors.ts for why this needs to be explicit).
        requestKey: "tickets-search",
      })
      .then((res) => {
        if (cancelled) return;
        setTickets(res.items);
        setTotalItems(res.totalItems);
      })
      .catch((err) => {
        // A cancelled search is expected here, not a failure - swallow it
        // silently rather than flashing an error state for what's really
        // just an older keystroke's request losing a race it was always
        // going to lose.
        if (!isAutoCancel(err) && !cancelled) {
          console.error("Failed to search tickets:", err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, status, refreshTick]);

  // Debounce free-text search so every keystroke doesn't fire a request.
  const [rawSearch, setRawSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearch(rawSearch), 300);
    return () => clearTimeout(id);
  }, [rawSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Tickets</h1>
        <p className="mt-1 text-sm text-slate-500">Search by code or number, and override status</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by QR code or ticket number…"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | "")}
          className="sm:w-48"
        >
          <option value="">All statuses</option>
          <option value="valid">Not scanned</option>
          <option value="redeemed">Redeemed</option>
          <option value="void">Void</option>
        </Select>
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <Spinner />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={TicketIcon}
              title="No tickets match"
              description="Try a different search term or status filter."
            />
          ) : (
            <>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-medium">#</th>
                    <th className="px-5 py-3 font-medium">QR code</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Counter</th>
                    <th className="px-5 py-3 font-medium">Staff</th>
                    <th className="px-5 py-3 font-medium">Scanned at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className="cursor-pointer hover:bg-slate-50"
                    >
                      <td className="px-5 py-3 font-medium text-slate-700">
                        {assignedNumberLabel(t.assigned_number)}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{t.qr_code}</td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {t.expand?.counter_id?.name || "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{t.expand?.staff_id?.name || "—"}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDateTime(t.scanned_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalItems > PAGE_SIZE && (
                <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
                  Showing the first {PAGE_SIZE} of {totalItems} matches — refine your search to
                  narrow this down.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <TicketDetailDialog
        ticket={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onChanged={(updated) => {
          setSelected(updated);
          setRefreshTick((k) => k + 1);
        }}
      />
    </div>
  );
}
