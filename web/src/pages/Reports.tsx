import { useEffect, useState } from "react";
import { pb } from "@/lib/pb";
import { isAutoCancel } from "@/lib/pbErrors";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { eventLabel } from "@/lib/format";
import {
  type DateRangePreset,
  presetLabel,
  rangeForPreset,
  serverTimeRangeFilter,
  formatDateOnly,
} from "@/lib/date";
import { downloadCsv } from "@/lib/csv";
import type { Counter, Staff, TicketEvent, TicketEventType } from "@/lib/types";
import { FileDown, FileText, BarChart3 } from "lucide-react";

type ExpandedEvent = TicketEvent & {
  expand?: { ticket_id?: { qr_code: string; assigned_number: number | null }; actor_staff_id?: Staff; counter_id?: Counter };
};

const PRESETS: DateRangePreset[] = ["today", "yesterday", "last7", "last30", "thisMonth"];

// Every event type counts toward "overrides" on the by-staff breakdown
// except the two that represent an ordinary scan outcome - everything
// else (duplicate/conflict/void/reopen/resolve) is staff intervening on
// something, which is the operationally interesting number for a report.
const OVERRIDE_EVENT_TYPES = new Set<TicketEventType>([
  "voided",
  "reopened",
  "conflict_resolved",
]);

export function Reports() {
  const [preset, setPreset] = useState<DateRangePreset>("today");
  const [customStart, setCustomStart] = useState(formatDateOnly(new Date()));
  const [customEnd, setCustomEnd] = useState(formatDateOnly(new Date()));
  const [events, setEvents] = useState<ExpandedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const range =
    preset === "custom"
      ? { start: new Date(`${customStart}T00:00:00`), end: new Date(`${customEnd}T23:59:59.999`) }
      : rangeForPreset(preset);

  const rangeLabel =
    formatDateOnly(range.start) === formatDateOnly(range.end)
      ? formatDateOnly(range.start)
      : `${formatDateOnly(range.start)} to ${formatDateOnly(range.end)}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    pb.collection("ticket_events")
      .getFullList<ExpandedEvent>({
        filter: serverTimeRangeFilter(range.start, range.end),
        sort: "-server_time",
        expand: "ticket_id,actor_staff_id,counter_id",
        requestKey: "reports-events",
        batch: 500,
      })
      .then((items) => {
        if (!cancelled) setEvents(items);
      })
      .catch((err) => {
        if (!isAutoCancel(err) && !cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // range.start/end are derived fresh each render from preset/custom
    // inputs - depending on their formatted values keeps this from
    // re-firing on every render while still refetching when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd]);

  // ---- Summary computation ----
  const totalsByType = new Map<TicketEventType, number>();
  for (const ev of events) {
    totalsByType.set(ev.event_type, (totalsByType.get(ev.event_type) || 0) + 1);
  }

  const byCounter = new Map<string, { name: string; scanned: number }>();
  const byStaff = new Map<string, { name: string; scanned: number; overrides: number }>();
  for (const ev of events) {
    if (ev.counter_id && ev.event_type === "scanned") {
      const name = ev.expand?.counter_id?.name || "Unknown counter";
      const entry = byCounter.get(ev.counter_id) || { name, scanned: 0 };
      entry.scanned += 1;
      byCounter.set(ev.counter_id, entry);
    }
    if (ev.actor_staff_id) {
      const name = ev.expand?.actor_staff_id?.name || "Unknown staff";
      const entry = byStaff.get(ev.actor_staff_id) || { name, scanned: 0, overrides: 0 };
      if (ev.event_type === "scanned") entry.scanned += 1;
      if (OVERRIDE_EVENT_TYPES.has(ev.event_type)) entry.overrides += 1;
      byStaff.set(ev.actor_staff_id, entry);
    }
  }

  const totals = [
    { label: "Scanned", value: totalsByType.get("scanned") || 0 },
    { label: "Duplicate attempts", value: totalsByType.get("duplicate_attempt") || 0 },
    { label: "Conflicts flagged", value: totalsByType.get("conflict_flagged") || 0 },
    { label: "Conflicts resolved", value: totalsByType.get("conflict_resolved") || 0 },
    { label: "Voided", value: totalsByType.get("voided") || 0 },
    { label: "Reopened", value: totalsByType.get("reopened") || 0 },
  ];

  function handleExportCsv() {
    downloadCsv(
      `gatemark-events-${rangeLabel}.csv`,
      ["Timestamp", "Event", "Ticket #", "QR code", "Staff", "Counter", "Note"],
      events.map((ev) => [
        ev.server_time,
        eventLabel[ev.event_type],
        ev.expand?.ticket_id?.assigned_number || "",
        ev.expand?.ticket_id?.qr_code || "",
        ev.expand?.actor_staff_id?.name || "",
        ev.expand?.counter_id?.name || "",
        ev.note || "",
      ])
    );
  }

  async function handleExportPdf() {
    // jsPDF + autoTable pull in html2canvas/dompurify as transitive deps
    // (~250KB combined) that no other page needs - dynamic import keeps
    // that weight out of the main bundle everyone downloads on login,
    // loading it only for the superadmin who actually clicks this.
    setPdfGenerating(true);
    try {
      const { generateReportPdf } = await import("@/lib/pdfReport");
      generateReportPdf({
        rangeLabel,
        totals,
        byCounter: Array.from(byCounter.values()).sort((a, b) => b.scanned - a.scanned),
        byStaff: Array.from(byStaff.values()).sort((a, b) => b.scanned - a.scanned),
      });
    } finally {
      setPdfGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">Activity summary for a date range, exportable</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={loading || events.length === 0}>
            <FileDown className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={handleExportPdf} disabled={loading || pdfGenerating || events.length === 0} loading={pdfGenerating}>
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              preset === p
                ? "bg-gatemark-primary text-white"
                : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
            }`}
          >
            {presetLabel(p)}
          </button>
        ))}
        <button
          onClick={() => setPreset("custom")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            preset === "custom"
              ? "bg-gatemark-primary text-white"
              : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
          }`}
        >
          Custom range
        </button>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-40"
            />
            <span className="text-sm text-slate-400">to</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-40"
            />
          </div>
        )}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {totals.map((t) => (
          <Card key={t.label}>
            <CardBody>
              <p className="text-lg font-semibold leading-none text-slate-900">
                {loading ? "—" : t.value}
              </p>
              <p className="mt-1 text-xs text-slate-500">{t.label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By counter" subtitle="Scans in the selected range" />
          <CardBody className="p-0">
            {loading ? (
              <Spinner />
            ) : byCounter.size === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No scans in this range</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {Array.from(byCounter.values())
                  .sort((a, b) => b.scanned - a.scanned)
                  .map((c) => (
                    <li key={c.name} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm font-medium text-slate-700">{c.name}</span>
                      <span className="text-sm font-semibold text-slate-900">{c.scanned}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="By staff" subtitle="Scans and overrides in the selected range" />
          <CardBody className="p-0">
            {loading ? (
              <Spinner />
            ) : byStaff.size === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No activity in this range</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {Array.from(byStaff.values())
                  .sort((a, b) => b.scanned - a.scanned)
                  .map((s) => (
                    <li key={s.name} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm font-medium text-slate-700">{s.name}</span>
                      <span className="text-sm text-slate-500">
                        <span className="font-semibold text-slate-900">{s.scanned}</span> scanned
                        {s.overrides > 0 && `, ${s.overrides} override${s.overrides === 1 ? "" : "s"}`}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {!loading && events.length === 0 && !error && (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-slate-400">
          <BarChart3 className="h-5 w-5" />
          <p className="text-sm">No activity recorded for {rangeLabel}.</p>
        </div>
      )}
    </div>
  );
}
