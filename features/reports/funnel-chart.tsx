import Tag from "@/components/_ui/tag";
import { FIRST_PLATFORM_STEP, type Report } from "@/convex/lib/reports";
import { cn } from "@/lib/utils";
import { count, percent } from "./format";

const GROUPS: Record<number, string> = {
  0: "Sales",
  [FIRST_PLATFORM_STEP]: "On the platform",
};

/** Horizontal funnel with step and overall conversion; the previous period shows as a tick on each track. */
export default function FunnelChart({
  funnel,
  previous,
}: {
  funnel: Report["funnel"];
  previous: number[];
}) {
  const hasPrevious = previous.some((value) => value > 0);
  const scale = Math.max(1, funnel.steps[0].count, previous[0] ?? 0);
  const dropIndex = funnel.steps.findIndex(
    (step) => step.key === funnel.biggestDrop,
  );
  const drop = dropIndex > 0 ? funnel.steps[dropIndex] : null;
  const before = dropIndex > 0 ? funnel.steps[dropIndex - 1] : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      {drop && before && (
        <p className="lead-style text-fg-secondary leading-snug">
          Biggest drop:{" "}
          <span className="text-foreground font-medium">
            {before.label} → {drop.label}
          </span>
          . {percent(drop.stepRate)} moved on ({count(drop.count)} of{" "}
          {count(before.count)}).
        </p>
      )}
      <div className="caption-style text-fg-tertiary hidden grid-cols-[12.5rem_1fr_4rem_5.5rem_4.5rem] items-center gap-x-4 sm:grid">
        <span>Step</span>
        <span className="flex items-center gap-1.5">
          {hasPrevious && (
            <>
              <span
                aria-hidden
                className="bg-fg-tertiary h-3 w-0.5 rounded-full"
              />
              Previous period
            </>
          )}
        </span>
        <span className="text-right">Count</span>
        <span className="text-right">From previous</span>
        <span className="text-right">Of leads</span>
      </div>
      <ol className="flex flex-col" aria-label="Funnel steps">
        {funnel.steps.map((step, index) => {
          const isDrop = index === dropIndex;
          const platform = index >= FIRST_PLATFORM_STEP;
          const width = (step.count / scale) * 100;
          const prior = previous[index] ?? 0;
          return (
            <li key={step.key} className="flex flex-col">
              {GROUPS[index] && (
                <span
                  className={cn(
                    "eyebrow-style text-fg-tertiary pb-2 text-[10px]",
                    index > 0 && "border-border mt-2 border-t pt-4",
                  )}
                >
                  {GROUPS[index]}
                </span>
              )}
              <div
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-lg py-1.5 sm:grid-cols-[12.5rem_1fr_4rem_5.5rem_4.5rem]",
                  isDrop &&
                    "-mx-2 bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-2",
                )}
              >
                <span className="lead-style flex min-w-0 items-center gap-2">
                  <span className="truncate">{step.label}</span>
                  {isDrop && (
                    <Tag tone="red" size="xs">
                      Biggest drop
                    </Tag>
                  )}
                </span>
                <span
                  aria-hidden
                  className="bg-overlay-1 relative col-span-2 row-start-2 h-5 rounded-sm sm:col-span-1 sm:row-start-auto"
                >
                  <span
                    className={cn(
                      "duration-slow absolute inset-y-0 left-0 rounded-sm transition-[width]",
                      platform ? "bg-trend" : "bg-selected",
                      step.count > 0 && "min-w-1",
                    )}
                    style={{ width: `${width}%` }}
                  />
                  {prior > 0 && (
                    <span
                      className="bg-fg-tertiary absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full"
                      style={{ left: `${(prior / scale) * 100}%` }}
                    />
                  )}
                </span>
                <span className="lead-style flex items-baseline justify-end gap-2 text-right tabular-nums sm:contents">
                  <span className="font-medium sm:text-right">
                    {count(step.count)}
                    <span className="sr-only">
                      {" "}
                      (previous period {count(prior)})
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-fg-secondary sm:text-right",
                      isDrop && "text-danger font-medium",
                    )}
                  >
                    <span className="sm:hidden">
                      {index === 0 ? "" : "Step "}
                    </span>
                    <span className="sr-only">from previous step </span>
                    {index === 0 ? "" : percent(step.stepRate)}
                  </span>
                  <span className="text-fg-tertiary max-sm:hidden sm:text-right">
                    <span className="sr-only">of leads </span>
                    {percent(step.overallRate)}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
