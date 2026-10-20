import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import { ACTIVATION_STAGES } from "@/lib/domain/platform";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

type Desk = FunctionReturnType<typeof api.activation.desk>;

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** How many linked brands reached each activation step, with the weakest step flagged. */
export default function FunnelStrip({ desk }: { desk: Desk | undefined }) {
  const top = desk?.funnel[0]?.count ?? 0;

  return (
    <section
      aria-label="Activation funnel"
      className="border-border grid shrink-0 grid-cols-3 border-b lg:grid-cols-6"
    >
      {ACTIVATION_STAGES.map((stage, step) => {
        const item = desk?.funnel[step];
        const leak = desk?.leak === step;
        const share = item && top ? item.count / top : 0;
        return (
          <div
            key={stage}
            className={cn(
              "border-border flex min-w-0 flex-col gap-2 px-4 py-3.5",
              step % 3 !== 2 && "border-r",
              step < 3 && "max-lg:border-b",
              step === 2 && "lg:border-r",
              leak &&
                "bg-[color-mix(in_srgb,var(--tag-red-bg)_60%,transparent)]",
            )}
          >
            <span className="caption-style text-fg-secondary truncate">
              {STAGE_LABEL[stage]}
            </span>
            {item ? (
              <span className="flex h-5 items-baseline gap-2">
                <span className="text-lg leading-none font-medium tabular-nums">
                  {item.count}
                </span>
                {item.conversion !== null && (
                  <span
                    className={cn(
                      "caption-style tabular-nums",
                      leak ? "text-danger font-medium" : "text-fg-tertiary",
                    )}
                  >
                    {percent(item.conversion)}
                    <span className="sr-only"> of the previous step</span>
                  </span>
                )}
                {leak && (
                  <Tag tone="red" size="xs" className="ml-auto self-center">
                    <span className="max-sm:hidden">Biggest leak</span>
                    <span className="sm:hidden">Leak</span>
                  </Tag>
                )}
              </span>
            ) : (
              <Skeleton className="my-0.5 h-4 w-10" />
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
          </div>
        );
      })}
    </section>
  );
}
