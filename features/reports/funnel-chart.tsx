import Link from "next/link";
import Tag from "@/components/_ui/tag";
import SegmentBar from "@/components/_common/segment-bar";
import {
  FIRST_PLATFORM_STEP,
  type FunnelStepKey,
  type Report,
} from "@/convex/lib/reports";
import { cn } from "@/lib/utils";
import { count, percent } from "./format";

const GROUPS: Record<number, string> = {
  0: "Sales",
  [FIRST_PLATFORM_STEP]: "On the platform",
};

const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[11.5rem_minmax(0,1fr)_3.5rem_3.5rem_5.5rem_4.5rem]";

/** Funnel steps as segmented meters scaled to the larger period, with step, overall and previous-period figures. */
export default function FunnelChart({
  funnel,
  previous,
  hrefFor,
}: {
  funnel: Report["funnel"];
  previous: number[];
  /** The list behind a step, e.g. accounts at that stage today. */
  hrefFor: (key: FunnelStepKey) => string;
}) {
  const scale = Math.max(1, funnel.steps[0].count, previous[0] ?? 0);
  const dropIndex = funnel.steps.findIndex(
    (step) => step.key === funnel.biggestDrop,
  );
  const drop = dropIndex > 0 ? funnel.steps[dropIndex] : null;
  const before = dropIndex > 0 ? funnel.steps[dropIndex - 1] : null;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
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
      <div
        className={cn(
          GRID,
          "caption-style text-fg-tertiary hidden tabular-nums sm:grid",
        )}
      >
        <span>Step</span>
        <span>Share of leads</span>
        <span className="text-right">Count</span>
        <span className="text-right">Prev.</span>
        <span className="text-right">From previous</span>
        <span className="text-right">Of leads</span>
      </div>
      <ol className="flex flex-col" aria-label="Funnel steps">
        {funnel.steps.map((step, index) => {
          const isDrop = index === dropIndex;
          const platform = index >= FIRST_PLATFORM_STEP;
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
                  GRID,
                  "rounded-lg py-1.5",
                  isDrop &&
                    "-mx-2 bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-2",
                )}
              >
                <span className="lead-style flex min-w-0 items-center gap-2">
                  <Link
                    href={hrefFor(step.key)}
                    title={
                      platform
                        ? `Accounts at ${step.label} now`
                        : `Open ${step.label.toLowerCase()} in Leads`
                    }
                    className="hover:text-foreground decoration-fg-tertiary/60 hover:decoration-fg-secondary focus-visible:ring-ring truncate rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2"
                  >
                    {step.label}
                  </Link>
                  {isDrop && (
                    <Tag tone="red" size="xs">
                      Biggest drop
                    </Tag>
                  )}
                </span>
                <SegmentBar
                  percent={(step.count / scale) * 100}
                  segments={40}
                  tone={isDrop ? "danger" : platform ? "success" : "auto"}
                  className="col-span-2 row-start-2 w-full sm:col-span-1 sm:row-start-auto"
                />
                <span className="lead-style flex items-baseline justify-end gap-2 text-right tabular-nums sm:contents">
                  <span className="font-medium sm:text-right">
                    {count(step.count)}
                  </span>
                  <span className="text-fg-tertiary max-sm:hidden sm:text-right">
                    <span className="sr-only">previous period </span>
                    {count(prior)}
                  </span>
                  <span
                    className={cn(
                      "text-fg-secondary sm:text-right",
                      isDrop && "text-danger font-medium",
                    )}
                  >
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
