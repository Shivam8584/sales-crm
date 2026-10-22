import { cn } from "@/lib/utils";
import Skeleton from "@/components/_ui/skeleton";
import NpsTile from "@/features/surveys/nps-tile";
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
import { Delta, MetricTile } from "./section";

const GRID =
  "bg-well grid grid-cols-2 gap-1 rounded-3xl p-1 sm:grid-cols-3 xl:grid-cols-6";
const GRID_WITH_NPS =
  "bg-well grid grid-cols-2 gap-1 rounded-3xl p-1 sm:grid-cols-4 xl:grid-cols-7";

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
  const last = steps.length - 1;
  const activated = steps[last].count;
  const speed = report.speed;
  const prevSpeed = report.previousSpeed;
  const speedChange =
    speed.medianMs !== null && prevSpeed.medianMs !== null
      ? speed.medianMs - prevSpeed.medianMs
      : null;

  return (
    <div className={GRID_WITH_NPS}>
      <MetricTile
        label="New leads"
        value={count(leads)}
        delta={
          <Delta
            value={signed(leads - prev[0])}
            trend={trend(leads, prev[0])}
          />
        }
      />
      <MetricTile
        label="Converted"
        value={count(converted)}
        detail={`${percent(rate(converted, leads))} of leads`}
        delta={
          <Delta
            value={pts(rate(converted, leads), rate(prev[3], prev[0]))}
            trend={trend(rate(converted, leads), rate(prev[3], prev[0]))}
          />
        }
      />
      <MetricTile
        label="Activated"
        value={count(activated)}
        detail={`${percent(rate(activated, leads))} of leads`}
        delta={
          <Delta
            value={pts(rate(activated, leads), rate(prev[last], prev[0]))}
            trend={trend(rate(activated, leads), rate(prev[last], prev[0]))}
          />
        }
      />
      <MetricTile
        label="Speed to lead"
        value={duration(speed.medianMs)}
        detail={`Median · p90 ${duration(speed.p90Ms)}`}
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
      <MetricTile
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
      <MetricTile
        label="Deals won"
        value={count(report.pipeline.won.count)}
        detail={
          <span
            className={cn(
              report.pipeline.won.count > 0 && "text-rose font-medium",
            )}
          >
            {totals(report.pipeline.won.totals, "No value yet")}
          </span>
        }
        delta={
          <Delta
            value={signed(report.pipeline.won.count - report.previousWon.count)}
            trend={trend(report.pipeline.won.count, report.previousWon.count)}
          />
        }
      />
      <div className="max-sm:col-span-2">
        <NpsTile />
      </div>
    </div>
  );
}

export function KpisSkeleton({ tiles = 6 }: { tiles?: number }) {
  return (
    <div className={tiles > 6 ? GRID_WITH_NPS : GRID}>
      {Array.from({ length: tiles }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 px-4 py-3.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
