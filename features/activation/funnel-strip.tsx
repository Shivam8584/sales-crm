import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import { ACTIVATION_STAGES } from "@/lib/domain/platform";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

type Desk = FunctionReturnType<typeof api.activation.desk>;

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * How many linked brands reached each activation step, with the weakest step
 * flagged. Selecting a step narrows the stuck list to brands at that step.
 */
export default function FunnelStrip({
  desk,
  selected,
  onSelect,
}: {
  desk: Desk | undefined;
  selected: string | null;
  onSelect: (stage: string | null) => void;
}) {
  const top = desk?.funnel[0]?.count ?? 0;
  const stuckAt = new Map<string, number>();
  for (const row of desk?.rows ?? []) {
    stuckAt.set(row.stage, (stuckAt.get(row.stage) ?? 0) + 1);
  }

  return (
    <section
      aria-label="Activation funnel"
      className="border-border grid shrink-0 grid-cols-3 border-b lg:grid-cols-6"
    >
      {ACTIVATION_STAGES.map((stage, step) => {
        const item = desk?.funnel[step];
        const leak = desk?.leak === step;
        const share = item && top ? item.count / top : 0;
        const stuck = stuckAt.get(stage) ?? 0;
        const active = selected === stage;
        return (
          <button
            key={stage}
            type="button"
            aria-pressed={active}
            disabled={!desk}
            onClick={() => onSelect(active ? null : stage)}
            className={cn(
              "border-border hover:bg-overlay-1 focus-visible:ring-ring duration-fast relative flex min-w-0 cursor-pointer flex-col gap-2 px-4 py-3.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-default",
              step % 3 !== 2 && "border-r",
              step < 3 && "max-lg:border-b",
              step === 2 && "lg:border-r",
              leak &&
                "bg-[color-mix(in_srgb,var(--tag-red-bg)_55%,transparent)]",
              active && "bg-overlay-2 hover:bg-overlay-2",
            )}
          >
            <span className="flex h-4 min-w-0 items-center justify-between gap-2">
              <span
                className={cn(
                  "caption-style truncate font-medium",
                  active ? "text-foreground" : "text-fg-secondary",
                )}
              >
                {STAGE_LABEL[stage]}
              </span>
              {leak && (
                <Tag tone="red" size="xs" className="-my-1 shrink-0">
                  <span className="max-sm:hidden">Biggest leak</span>
                  <span className="sm:hidden">Leak</span>
                </Tag>
              )}
            </span>
            {item ? (
              <span className="flex h-6 items-baseline gap-2">
                <span className="text-xl leading-none font-semibold tabular-nums">
                  {item.count}
                </span>
                {item.conversion !== null && (
                  <span
                    className={cn(
                      "caption-style truncate tabular-nums",
                      leak ? "text-danger font-medium" : "text-fg-tertiary",
                    )}
                  >
                    {percent(item.conversion)}
                    <span className="max-sm:sr-only"> moved on</span>
                  </span>
                )}
              </span>
            ) : (
              <Skeleton className="my-1 h-4 w-10" />
            )}
            <span
              aria-hidden
              className="bg-track block h-1 overflow-hidden rounded-full"
            >
              <span
                className={cn(
                  "duration-slow ease-power3-out block h-full rounded-full transition-[width]",
                  leak ? "bg-danger" : "bg-trend",
                )}
                style={{ width: `${share * 100}%` }}
              />
            </span>
            <span
              className={cn(
                "caption-style h-4 truncate tabular-nums",
                stuck > 0 ? "text-warning" : "text-fg-tertiary",
              )}
            >
              {stuck > 0 ? `${stuck} stuck here` : ""}
            </span>
          </button>
        );
      })}
    </section>
  );
}
