import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { useLiveList } from "@/hooks/useLiveList";
import { useTicketStatusCounts } from "@/hooks/useTicketStatusCounts";
import { todayRangeFilter } from "@/lib/date";
import { eventLabel, eventTone, formatTime, assignedNumberLabel } from "@/lib/format";
import type { Counter, Staff, Ticket, TicketEvent } from "@/lib/types";
import { Activity, CheckCircle2, MonitorCheck, Ticket as TicketIcon, XCircle } from "lucide-react";
import { useMemo } from "react";

type ExpandedEvent = TicketEvent & {
  expand?: { ticket_id?: Ticket; actor_staff_id?: Staff; counter_id?: Counter };
};

export function Dashboard() {
  const { counts, loading: countsLoading } = useTicketStatusCounts();

  const counters = useLiveList<Counter>("counters", {
    filter: "active = true",
    sort: "name",
  });

  // Today's scans, live - drives both the per-counter tally and the
  // activity feed. duplicate_attempt/conflict_flagged included so the
  // feed reads as a real timeline of everything that happened at the
  // gate, not just successful redemptions.
  const todaysEvents = useLiveList<ExpandedEvent>("ticket_events", {
    filter: `${todayRangeFilter("server_time")} && (event_type = "scanned" || event_type = "duplicate_attempt" || event_type = "conflict_flagged" || event_type = "voided" || event_type = "reopened")`,
    sort: "-server_time",
    perPage: 100,
    expand: "ticket_id,actor_staff_id,counter_id",
  });

  const perCounterToday = useMemo(() => {
    const tally = new Map<string, number>();
    for (const ev of todaysEvents.items) {
      if (ev.event_type !== "scanned") continue;
      if (!ev.counter_id) continue;
      tally.set(ev.counter_id, (tally.get(ev.counter_id) || 0) + 1);
    }
    return tally;
  }, [todaysEvents.items]);

  const scannedToday = useMemo(
    () => todaysEvents.items.filter((e) => e.event_type === "scanned").length,
    [todaysEvents.items]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Live status across all counters</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          icon={CheckCircle2}
          label="Scanned today"
          value={scannedToday}
          tone="success"
          loading={todaysEvents.loading}
        />
        <SummaryCard
          icon={TicketIcon}
          label="Not scanned yet"
          value={counts.valid}
          tone="neutral"
          loading={countsLoading}
        />
        <SummaryCard
          icon={Activity}
          label="Redeemed total"
          value={counts.redeemed}
          tone="primary"
          loading={countsLoading}
        />
        <SummaryCard
          icon={XCircle}
          label="Void"
          value={counts.void}
          tone="danger"
          loading={countsLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Counters today"
            subtitle="Scans recorded at each active counter"
          />
          <CardBody className="p-0">
            {counters.loading ? (
              <Spinner />
            ) : counters.items.length === 0 ? (
              <EmptyState
                icon={MonitorCheck}
                title="No active counters"
                description="Add a counter to start tracking scans."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {counters.items.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm font-medium text-slate-700">{c.name}</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {perCounterToday.get(c.id) || 0}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Recent activity" subtitle="Live feed, most recent first" />
          <CardBody className="p-0">
            {todaysEvents.loading ? (
              <Spinner />
            ) : todaysEvents.items.length === 0 ? (
              <EmptyState icon={Activity} title="No activity yet today" />
            ) : (
              <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
                {todaysEvents.items.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-14 shrink-0 text-xs text-slate-400">
                      {formatTime(ev.server_time)}
                    </span>
                    <Badge tone={eventTone[ev.event_type]}>{eventLabel[ev.event_type]}</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                      {ev.expand?.ticket_id
                        ? `#${assignedNumberLabel(ev.expand.ticket_id.assigned_number)} · ${ev.expand.ticket_id.qr_code}`
                        : ev.ticket_id}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {ev.expand?.counter_id?.name || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "success" | "neutral" | "primary" | "danger";
  loading?: boolean;
}) {
  const toneClasses = {
    success: "bg-gatemark-successBg text-gatemark-success",
    neutral: "bg-slate-100 text-slate-500",
    primary: "bg-emerald-50 text-gatemark-primary",
    danger: "bg-gatemark-dangerBg text-gatemark-danger",
  }[tone];

  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClasses}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-lg font-semibold leading-none text-slate-900">
            {loading ? "—" : value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}
