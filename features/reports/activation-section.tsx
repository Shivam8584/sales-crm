import Tag from "@/components/_ui/tag";
import type { Report } from "@/convex/lib/reports";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { count, days } from "./format";

/** Median days between activation stages, with the slowest step called out. */
export default function ActivationChart({
  activation,
}: {
  activation: Report["activation"];
}) {
  const longest = Math.max(
    1,
    ...activation.steps.map((step) => step.medianMs ?? 0),
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <p className="lead-style text-fg-secondary leading-snug">
        Signup to activated:{" "}
        <span className="text-foreground font-medium tabular-nums">
          {activation.overall.medianMs === null
            ? "no brand activated in this period"
            : `median ${days(activation.overall.medianMs)} across ${count(activation.overall.completed)} ${activation.overall.completed === 1 ? "brand" : "brands"}`}
        </span>
      </p>
      <ol className="flex flex-col gap-3" aria-label="Activation steps">
        {activation.steps.map((step) => {
          const slowest = step.from === activation.slowest;
          return (
            <li
              key={step.from}
              className={cn(
                "flex flex-col gap-2 rounded-lg",
                slowest &&
                  "-mx-2 bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-2 py-2",
              )}
            >
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
                <span className="lead-style shrink-0 font-medium tabular-nums">
                  <span className="sr-only">Median </span>
                  {days(step.medianMs)}
                </span>
              </div>
              <span
                aria-hidden
                className="bg-overlay-1 relative h-2 rounded-full"
              >
                <span
                  className={cn(
                    "duration-slow absolute inset-y-0 left-0 rounded-full transition-[width]",
                    slowest ? "bg-warning" : "bg-trend",
                    step.medianMs !== null && "min-w-1",
                  )}
                  style={{
                    width: `${((step.medianMs ?? 0) / longest) * 100}%`,
                  }}
                />
              </span>
              <span className="caption-style text-fg-tertiary tabular-nums">
                {count(step.completed)} completed in period ·{" "}
                {count(step.waiting)} waiting now
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
