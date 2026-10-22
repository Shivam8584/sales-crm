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
    <div className="flex flex-col gap-2.5">
      <p className="caption-style text-fg-tertiary flex items-center justify-between gap-3">
        <span>Activation</span>
        <span className="tabular-nums">
          <span className="text-foreground sm:hidden">
            {current ? STAGE_LABEL[current.stage] : "Not started"} ·{" "}
          </span>
          {doneCount} of {steps.length}
        </span>
      </p>
      <ol aria-label="Activation path" className="flex items-start">
        {steps.map((step, index) => {
          const next = steps[index + 1];
          const isCurrent = step === current;
          return (
            <li
              key={step.stage}
              className="relative flex min-w-0 flex-1 flex-col gap-1.5"
            >
              <span className="flex items-center">
                <Dot done={step.done} current={isCurrent} />
                {next && (
                  <span
                    aria-hidden
                    className={cn(
                      "mx-1 h-px flex-1",
                      next.done ? "bg-success/60" : "bg-line-strong",
                    )}
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 pr-2 max-sm:sr-only">
                <span
                  className={cn(
                    "caption-style truncate",
                    step.done ? "text-foreground" : "text-fg-tertiary",
                    isCurrent && "font-medium",
                  )}
                >
                  {STAGE_LABEL[step.stage]}
                  <span className="sr-only">
                    {step.done ? ", done" : ", not yet"}
                  </span>
                </span>
                {step.at !== null ? (
                  <Tooltip content={dateTime(step.at)}>
                    <time
                      dateTime={new Date(step.at).toISOString()}
                      className="caption-style text-fg-tertiary w-fit tabular-nums"
                    >
                      {shortDate(step.at)}
                    </time>
                  </Tooltip>
                ) : (
                  <span aria-hidden className="caption-style text-fg-disabled">
                    —
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Dot({ done, current }: { done: boolean; current: boolean }) {
  if (!done) {
    return (
      <span
        aria-hidden
        className="border-line-strong size-3.5 shrink-0 rounded-full border border-dashed"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "bg-success text-background flex size-3.5 shrink-0 items-center justify-center rounded-full",
        current && "ring-success/25 ring-3",
      )}
    >
      <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
        <path
          d="M3 6.25 5 8.25 9 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
