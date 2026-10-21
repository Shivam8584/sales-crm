import Tag from "@/components/_ui/tag";
import SegmentBar from "@/components/_common/segment-bar";
import type { timeToActivate } from "@/convex/lib/reports";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { count, days } from "./format";

type Activation = ReturnType<typeof timeToActivate>;

/** Median days between activation stages as segmented meters, with the slowest step called out. */
export default function ActivationChart({
  activation,
  previous,
}: {
  activation: Activation;
  /** The period before, to show each median against. */
  previous?: Activation;
}) {
  const longest = Math.max(
    1,
    ...activation.steps.map((step) => step.medianMs ?? 0),
  );

  return (
    <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
      <p className="lead-style text-fg-secondary leading-snug">
        Signup to activated:{" "}
        <span className="text-foreground font-medium tabular-nums">
          {activation.overall.medianMs === null
            ? "no brand activated in this period"
            : `median ${days(activation.overall.medianMs)} across ${count(activation.overall.completed)} ${activation.overall.completed === 1 ? "brand" : "brands"}`}
        </span>
      </p>
      <ol className="flex flex-col gap-4" aria-label="Activation steps">
        {activation.steps.map((step, index) => {
          const slowest = step.from === activation.slowest;
          const before = previous?.steps[index];
          return (
            <li key={step.from} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="lead-style flex min-w-0 items-center gap-2">
                  <span className="truncate">
                    {STAGE_LABEL[step.from]} → {STAGE_LABEL[step.to]}
                  </span>
                  {slowest && (
                    <Tag tone="amber" size="xs">
                      Slowest
                    </Tag>
                  )}
                </span>
                <span className="lead-style flex shrink-0 items-baseline gap-2 tabular-nums">
                  {step.p90Ms !== null && (
                    <span className="caption-style text-fg-tertiary">
                      p90 {days(step.p90Ms)}
                    </span>
                  )}
                  <span className="font-medium">
                    <span className="sr-only">Median </span>
                    {days(step.medianMs)}
                  </span>
                </span>
              </div>
              <SegmentBar
                percent={((step.medianMs ?? 0) / longest) * 100}
                segments={48}
                tone={slowest ? "warning" : "success"}
                className="border-overlay-1 h-3 w-full border px-px"
                segmentClassName="h-2"
                trackClassName="bg-overlay-3"
              />
              <span className="caption-style text-fg-tertiary tabular-nums">
                {count(step.completed)} completed in period ·{" "}
                {count(step.waiting)} waiting now
                {before?.medianMs != null &&
                  ` · previous period ${days(before.medianMs)}`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
