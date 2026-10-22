import SegmentBar from "@/components/_common/segment-bar";
import type { Report } from "@/convex/lib/reports";
import { DealStageTag } from "@/features/deals/stage";
import { cn } from "@/lib/utils";
import { count, signed, totals, trend } from "./format";
import { Delta, MetricTile } from "./section";

/** Open deals per stage as meters with one total per currency, then deals closed in the period. */
export default function PipelineChart({
  pipeline,
  previousWon,
}: {
  pipeline: Report["pipeline"];
  previousWon: Report["previousWon"];
}) {
  const most = Math.max(1, ...pipeline.open.map((stage) => stage.count));
  const openCount = pipeline.open.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <p className="lead-style text-fg-secondary leading-snug">
        {count(openCount)} open {openCount === 1 ? "deal" : "deals"}
        {openCount > 0 && (
          <>
            {" · "}
            <span className="text-foreground tabular-nums">
              {totals(pipeline.openTotals, "no value set")}
            </span>
            {pipeline.weightedTotals.some((value) => value.amount > 0) && (
              <>
                {" · "}
                <span className="tabular-nums">
                  {totals(pipeline.weightedTotals)}
                </span>{" "}
                weighted
              </>
            )}
          </>
        )}
      </p>
      <ul className="flex flex-col gap-4" aria-label="Open deals by stage">
        {pipeline.open.map((stage) => (
          <li key={stage.stage} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <DealStageTag stage={stage.stage} />
              <span className="flex min-w-0 items-baseline gap-2 text-sm font-medium tabular-nums">
                <span className="text-fg-secondary truncate">
                  {totals(stage.totals, "")}
                </span>
                <span className="shrink-0">
                  {count(stage.count)}
                  <span className="sr-only">
                    {stage.count === 1 ? " deal" : " deals"}
                  </span>
                </span>
              </span>
            </div>
            <SegmentBar
              percent={(stage.count / most) * 100}
              segments={48}
              className="h-3 w-full"
              trackClassName="bg-well h-2"
            />
          </li>
        ))}
      </ul>
      <div className="bg-well grid grid-cols-2 gap-1 rounded-3xl p-1">
        <MetricTile
          label="Won in period"
          value={count(pipeline.won.count)}
          detail={
            <span
              className={cn(pipeline.won.count > 0 && "text-rose font-medium")}
            >
              {totals(pipeline.won.totals, "No value")}
            </span>
          }
          delta={
            <Delta
              value={signed(pipeline.won.count - previousWon.count)}
              trend={trend(pipeline.won.count, previousWon.count)}
            />
          }
        />
        <MetricTile
          label="Lost in period"
          value={count(pipeline.lost.count)}
          detail={totals(pipeline.lost.totals, "No value")}
        />
      </div>
    </div>
  );
}
