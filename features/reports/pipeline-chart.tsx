import type { Report } from "@/convex/lib/reports";
import { DealStageTag } from "@/features/deals/stage";
import { count, signed, totals, trend } from "./format";
import { Delta } from "./section";

/** Open deals per stage with one total per currency, and deals closed in the period. */
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
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
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
        <ul className="flex flex-col gap-3" aria-label="Open deals by stage">
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
              <span
                aria-hidden
                className="bg-overlay-1 relative h-2 rounded-full"
              >
                <span
                  className="bg-selected duration-slow absolute inset-y-0 left-0 min-w-0 rounded-full transition-[width]"
                  style={{ width: `${(stage.count / most) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <dl className="border-border grid grid-cols-2 border-t">
        <div className="flex min-w-0 flex-col gap-2 px-4 py-3.5 sm:px-5">
          <dt className="caption-style text-fg-tertiary">Won in period</dt>
          <dd className="flex flex-col gap-1.5">
            <span className="lead-style font-medium tabular-nums">
              {count(pipeline.won.count)}
              <span className="text-fg-secondary font-normal">
                {" · "}
                {totals(pipeline.won.totals)}
              </span>
            </span>
            <Delta
              value={signed(pipeline.won.count - previousWon.count)}
              trend={trend(pipeline.won.count, previousWon.count)}
            />
          </dd>
        </div>
        <div className="border-border flex min-w-0 flex-col gap-2 border-l px-4 py-3.5 sm:px-5">
          <dt className="caption-style text-fg-tertiary">Lost in period</dt>
          <dd className="lead-style font-medium tabular-nums">
            {count(pipeline.lost.count)}
            <span className="text-fg-secondary font-normal">
              {" · "}
              {totals(pipeline.lost.totals)}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
