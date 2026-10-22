import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Skeleton from "@/components/_ui/skeleton";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STEP_LABEL,
} from "@/lib/domain/platform";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

type Desk = FunctionReturnType<typeof api.activation.desk>;

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * How many linked brands reached each activation step. The weakest step is
 * flagged; selecting a step narrows the stuck list to brands at that step.
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
  const stuckAt = new Map<string, number>();
  for (const row of desk?.rows ?? []) {
    stuckAt.set(row.stage, (stuckAt.get(row.stage) ?? 0) + 1);
  }

  return (
    <section
      aria-label="Activation funnel"
      className="border-border scrollbar-none shrink-0 overflow-x-auto border-b px-2 py-2"
    >
      <div className="grid min-w-[48rem] grid-cols-5">
        {ACTIVATION_STAGES.map((stage, step) => {
          const item = desk?.funnel[step];
          const leak = desk?.leak === step;
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
                "hover:bg-overlay-1 focus-visible:ring-ring duration-fast flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg p-2.5 text-left transition-colors outline-none focus-visible:ring-2 disabled:cursor-default",
                active && "bg-overlay-2 hover:bg-overlay-2",
              )}
            >
              <span className="caption-style text-fg-secondary flex min-w-0 items-center justify-between gap-2">
                <span
                  title={ACTIVATION_STEP_LABEL[stage]}
                  className={cn("truncate", active && "text-foreground")}
                >
                  {step + 1} · {STAGE_LABEL[stage]}
                </span>
                {leak && <span className="text-danger shrink-0">Leak</span>}
              </span>
              {item ? (
                <span className="flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="text-lg leading-none font-medium">
                    {item.count}
                  </span>
                  <span
                    className={cn(
                      "caption-style truncate",
                      leak ? "text-danger" : "text-fg-tertiary",
                    )}
                    title={
                      item.conversion === null
                        ? undefined
                        : `${percent(item.conversion)} of the previous step moved on`
                    }
                  >
                    {item.conversion === null
                      ? "Start"
                      : `${percent(item.conversion)} moved on`}
                  </span>
                </span>
              ) : (
                <Skeleton className="h-5 w-10" />
              )}
              <span
                className={cn(
                  "caption-style tabular-nums",
                  stuck > 0 ? "text-warning" : "text-fg-tertiary",
                )}
              >
                {stuck > 0 ? `${stuck} stuck here` : "None stuck"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
