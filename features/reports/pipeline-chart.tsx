import SegmentBar from "@/components/_common/segment-bar";
import type { Report } from "@/convex/lib/reports";
import { DealStageTag } from "@/features/deals/stage";
import type { DealStage } from "@/lib/domain/enums";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import XIcon from "@/public/assets/icons/x.svg";
import { count, signed, totals, trend } from "./format";
import { Delta, MetricTile } from "./section";

const STAGE_TONE: Partial<Record<DealStage, "danger" | "warning" | "success">> =
  {
    discovery: "danger",
    demo: "warning",
    proposal: "warning",
    onboarding: "success",
  };

/** Open deals per stage as segmented meters with one total per currency, then deals closed in the period. */
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
    <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
      <p className="lead-style text-fg-secondary leading-snug">
        {count(openCount)} open {openCount === 1 ? "deal" : "deals"}
        {openCount > 0 && (
          <>
            {" · "}
            <span className="text-foreground font-medium tabular-nums">
              {totals(pipeline.openTotals, "no value set")}
            </span>
          </>
        )}
      </p>
      <ul className="flex flex-col gap-4" aria-label="Open deals by stage">
        {pipeline.open.map((stage) => (
          <li key={stage.stage} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <DealStageTag stage={stage.stage} />
              <span className="lead-style flex min-w-0 items-baseline gap-2 tabular-nums">
                <span className="text-fg-secondary truncate">
                  {totals(stage.totals, "")}
                </span>
                <span className="shrink-0 font-medium">
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
              tone={STAGE_TONE[stage.stage] ?? "auto"}
              className="border-overlay-1 h-3 w-full border px-px"
              segmentClassName="h-2"
              trackClassName="bg-overlay-3"
            />
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <MetricTile
          icon={CheckCircleIcon}
          label="Won in period"
          value={count(pipeline.won.count)}
          detail={totals(pipeline.won.totals, "No value")}
          delta={
            <Delta
              value={signed(pipeline.won.count - previousWon.count)}
              trend={trend(pipeline.won.count, previousWon.count)}
            />
          }
        />
        <MetricTile
          icon={XIcon}
          label="Lost in period"
          value={count(pipeline.lost.count)}
          detail={totals(pipeline.lost.totals, "No value")}
        />
      </div>
    </div>
  );
}
