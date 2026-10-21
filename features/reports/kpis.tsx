import Skeleton from "@/components/_ui/skeleton";
import type { Report } from "@/convex/lib/reports";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";
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

const GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6";

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
    <div className={GRID}>
      <MetricTile
        icon={UserPlusIcon}
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
        icon={TargetIcon}
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
        icon={ActivityIcon}
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
      <MetricTile
        icon={ClockIcon}
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
      <MetricTile
        icon={CheckCircleIcon}
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
        icon={WalletIcon}
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
    <div className={GRID}>
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="border-line-strong flex flex-col gap-3 rounded-lg border p-2.75"
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
