import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import SegmentBar from "@/components/_common/segment-bar";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STEP_LABEL,
} from "@/lib/domain/platform";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

type Desk = FunctionReturnType<typeof api.activation.desk>;

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * How many linked brands reached each activation step, as stat tiles with a
 * segment bar of the share of signups that got there. The weakest step is
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
  const top = desk?.funnel[0]?.count ?? 0;
  const stuckAt = new Map<string, number>();
  for (const row of desk?.rows ?? []) {
    stuckAt.set(row.stage, (stuckAt.get(row.stage) ?? 0) + 1);
  }

  return (
    <section
      aria-label="Activation funnel"
      className="border-border scrollbar-none shrink-0 overflow-x-auto border-b px-4 py-4"
    >
      <div className="grid min-w-[48rem] grid-cols-5 gap-2">
        {ACTIVATION_STAGES.map((stage, step) => {
          const item = desk?.funnel[step];
          const leak = desk?.leak === step;
          const share = item && top ? (item.count / top) * 100 : 0;
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
                "border-line-strong hover:bg-overlay-1 focus-visible:ring-ring duration-fast flex min-w-0 cursor-pointer flex-col gap-3 rounded-lg border p-2.75 text-left transition-colors outline-none focus-visible:ring-2 disabled:cursor-default",
                leak && "border-(--tag-red-border)",
                active && "bg-overlay-2 hover:bg-overlay-2 border-fg-tertiary",
              )}
            >
              <span className="caption-style text-fg-secondary flex h-3.5 min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-fg-tertiary tabular-nums">
                    {step + 1}
                  </span>
                  <span
                    title={ACTIVATION_STEP_LABEL[stage]}
                    className={cn("truncate", active && "text-foreground")}
                  >
                    {STAGE_LABEL[stage]}
                  </span>
                </span>
                {leak && (
                  <Tag tone="red" size="xs" className="-my-1 shrink-0">
                    Leak
                  </Tag>
                )}
              </span>
              {item ? (
                <span className="flex h-5 items-baseline justify-between gap-2">
                  <span className="text-xl leading-none font-semibold tabular-nums">
                    {item.count}
                  </span>
                  <span
                    className={cn(
                      "caption-style truncate tabular-nums",
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
              <SegmentBar
                percent={share}
                segments={18}
                tone={leak ? "danger" : "auto"}
                className="w-full"
              />
              <span
                className={cn(
                  "caption-style flex h-3 items-center justify-between gap-2 tabular-nums",
                  stuck > 0 ? "text-warning" : "text-fg-tertiary",
                )}
              >
                <span className="truncate">
                  {stuck > 0 ? `${stuck} stuck here` : "None stuck"}
                </span>
                <span className="text-fg-tertiary shrink-0">
                  {item && top ? `${Math.round(share)}%` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
