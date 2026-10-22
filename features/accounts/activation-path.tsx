"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { dateTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Signed up → Activated as a horizontal path under the account header. Renders
 * nothing for accounts that aren't linked to a platform organisation.
 */
export default function ActivationPath({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  const data = useQuery(api.platform.forAccount, { accountId });

  if (data === undefined) {
    return <Skeleton aria-busy className="h-12 w-full" />;
  }
  if (data.orgId === null) return null;

  const steps = data.steps;
  const doneCount = steps.filter((step) => step.done).length;
  const current = [...steps].reverse().find((step) => step.done);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-fg-tertiary flex items-center justify-between gap-3 text-xs sm:sr-only">
        <span>Activation</span>
        <span className="tabular-nums">
          <span className="text-foreground">
            {current ? STAGE_LABEL[current.stage] : "Not started"} ·{" "}
          </span>
          {doneCount} of {steps.length}
        </span>
      </p>
      <ol
        aria-label={`Activation path, ${doneCount} of ${steps.length}`}
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        }}
      >
        {steps.map((step) => {
          const isCurrent = step === current;
          return (
            <li key={step.stage} className="flex min-w-0 flex-col gap-2">
              <span
                aria-hidden
                className="bg-foreground/10 block h-1 overflow-hidden rounded-full"
              >
                <span
                  className={cn(
                    "bg-foreground ease-out-hd block h-full rounded-full transition-[width] duration-[420ms]",
                    step.done ? "w-full" : "w-0",
                  )}
                />
              </span>
              <span className="flex min-w-0 flex-col max-sm:sr-only">
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-1 text-sm",
                    step.done ? "text-foreground" : "text-fg-tertiary",
                    isCurrent && "font-medium",
                  )}
                >
                  {step.done && <Dot />}
                  <span className="truncate">{STAGE_LABEL[step.stage]}</span>
                  <span className="sr-only">
                    {step.done ? ", done" : ", not yet"}
                  </span>
                </span>
                {step.at !== null ? (
                  <Tooltip content={dateTime(step.at)}>
                    <time
                      dateTime={new Date(step.at).toISOString()}
                      className="text-fg-tertiary w-fit text-xs tabular-nums"
                    >
                      {shortDate(step.at)}
                    </time>
                  </Tooltip>
                ) : (
                  <span className="text-fg-tertiary text-xs">Next</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Dot() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      fill="none"
      className="text-success size-3.5 shrink-0"
    >
      <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M3.75 6.1 5.3 7.6 8.25 4.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
