import type { ReactNode } from "react";
import Skeleton from "@/components/_ui/skeleton";
import type { Report } from "@/convex/lib/reports";
import {
  count,
  duration,
  percent,
  rate,
  signed,
  totals,
  trend,
} from "./format";
import { Delta } from "./section";

function Kpi({
  label,
  value,
  detail,
  delta,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  delta?: ReactNode;
}) {
  return (
    <div className="bg-card shadow-card flex min-w-0 flex-col gap-2.5 rounded-xl px-3.5 py-3">
      <span className="caption-style text-fg-secondary truncate">{label}</span>
      <span className="truncate text-xl leading-none font-semibold tabular-nums">
        {value}
      </span>
      <span className="flex min-h-4 flex-col gap-1">
        {detail && (
          <span className="caption-style text-fg-tertiary truncate tabular-nums">
            {detail}
          </span>
        )}
        {delta}
      </span>
    </div>
  );
}

const pts = (current: number | null, previous: number | null) =>
  current === null || previous === null
    ? "—"
    : signed(Math.round((current - previous) * 100), " pts");

/** Headline numbers for the period, each compared with the previous period. */
export default function Kpis({ report }: { report: Report }) {
  const steps = report.funnel.steps;
  const prev = report.previousFunnel;
  const leads = steps[0].count;
  const converted = steps[3].count;
  const activated = steps[9].count;
  const speed = report.speed;
  const prevSpeed = report.previousSpeed;
  const speedChange =
    speed.medianMs !== null && prevSpeed.medianMs !== null
      ? speed.medianMs - prevSpeed.medianMs
      : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Kpi
        label="New leads"
        value={count(leads)}
        delta={
          <Delta
            value={signed(leads - prev[0])}
            trend={trend(leads, prev[0])}
          />
        }
      />
      <Kpi
        label="Converted to account"
        value={count(converted)}
        detail={`${percent(rate(converted, leads))} of leads`}
        delta={
          <Delta
            value={pts(rate(converted, leads), rate(prev[3], prev[0]))}
            trend={trend(rate(converted, leads), rate(prev[3], prev[0]))}
          />
        }
      />
      <Kpi
        label="Activated"
        value={count(activated)}
        detail={`${percent(rate(activated, leads))} of leads`}
        delta={
          <Delta
            value={pts(rate(activated, leads), rate(prev[9], prev[0]))}
            trend={trend(rate(activated, leads), rate(prev[9], prev[0]))}
          />
        }
      />
      <Kpi
        label="Median speed to lead"
        value={duration(speed.medianMs)}
        detail={`p90 ${duration(speed.p90Ms)}`}
        delta={
          <Delta
            value={
              speedChange === null
                ? "—"
                : `${speedChange > 0 ? "+" : speedChange < 0 ? "−" : ""}${duration(Math.abs(speedChange))}`
            }
            trend={trend(speed.medianMs, prevSpeed.medianMs, false)}
          />
        }
      />
      <Kpi
        label="Touched within SLA"
        value={percent(speed.withinRate)}
        detail={`${count(speed.breached)} breached`}
        delta={
          <Delta
            value={pts(speed.withinRate, prevSpeed.withinRate)}
            trend={trend(speed.withinRate, prevSpeed.withinRate)}
          />
        }
      />
      <Kpi
        label="Deals won"
        value={count(report.pipeline.won.count)}
        detail={totals(report.pipeline.won.totals, "No value yet")}
        delta={
          <Delta
            value={signed(report.pipeline.won.count - report.previousWon.count)}
            trend={trend(report.pipeline.won.count, report.previousWon.count)}
          />
        }
      />
    </div>
  );
}

export function KpisSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="bg-card shadow-card flex flex-col gap-3 rounded-xl px-3.5 py-3"
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
