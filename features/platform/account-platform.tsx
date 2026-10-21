"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { Properties, Property } from "@/components/record/properties";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/domain/money";
import { dateTime, relativeTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";

type Linked = Extract<
  FunctionReturnType<typeof api.platform.forAccount>,
  { steps: unknown }
>;

/** Hypedrive usage for a linked account, in the account page sidebar. */
export default function AccountPlatform({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  const data = useQuery(api.platform.forAccount, { accountId });

  return (
    <Properties title="Platform">
      {data === undefined ? (
        <div aria-busy className="flex flex-col gap-3 py-2">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-40" />
        </div>
      ) : data.orgId === null ? (
        <p className="text-fg-tertiary text-sm leading-8">
          Not on Hypedrive yet
        </p>
      ) : (
        <PlatformDetails data={data} />
      )}
    </Properties>
  );
}

function PlatformDetails({ data }: { data: Linked }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.orgId);
      toast("Org ID copied");
    } catch {
      toast("Couldn't copy the org ID", { tone: "danger" });
    }
  }

  return (
    <>
      <Property label="Deposits">
        {data.topups > 0 ? (
          <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
            <span className="tabular-nums">{formatMoney(data.deposits)}</span>
            <span className="caption-style text-fg-tertiary truncate">
              {data.topups === 1 ? "1 top-up" : `${data.topups} top-ups`}
            </span>
          </span>
        ) : (
          <span className="text-fg-tertiary text-sm">None yet</span>
        )}
      </Property>
      <Property label="Campaigns live">
        <span
          className={cn(
            "text-sm tabular-nums",
            data.campaignsLive === 0 && "text-fg-tertiary",
          )}
        >
          {data.campaignsLive === 0 ? "None yet" : data.campaignsLive}
        </span>
      </Property>
      <Property label="Last seen">
        {data.lastEventAt ? (
          <time
            dateTime={new Date(data.lastEventAt).toISOString()}
            title={dateTime(data.lastEventAt)}
            className="text-sm"
          >
            {relativeTime(data.lastEventAt)}
          </time>
        ) : (
          <span className="text-fg-tertiary text-sm">—</span>
        )}
      </Property>
      <Property
        label="Org ID"
        action={
          <Tooltip content="Copy org ID">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Copy org ID"
              onClick={() => void copy()}
            >
              <ClipboardIcon aria-hidden className="size-3" />
            </Button>
          </Tooltip>
        }
      >
        <span
          title={data.orgId}
          className="text-fg-secondary truncate font-mono text-xs"
        >
          {data.orgId}
        </span>
      </Property>
    </>
  );
}

/**
 * The activation path as a horizontal row of steps with the date each was
 * reached, for the account header. Renders nothing until the brand is on Hypedrive.
 */
export function AccountActivationPath({
  accountId,
  className,
}: {
  accountId: Id<"accounts">;
  className?: string;
}) {
  const data = useQuery(api.platform.forAccount, { accountId });
  const stall = useQuery(api.activation.forAccount, { accountId });
  if (!data || data.orgId === null) return null;

  const steps = data.steps;
  const next = steps.findIndex((step) => !step.done);
  const doneCount = steps.filter((step) => step.done).length;
  const stuck = stall ? next : -1;

  return (
    <section
      aria-label="Activation path"
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <p className="caption-style text-fg-tertiary flex items-center justify-between gap-3 sm:hidden">
        <span>
          Activation{" "}
          <span className="tabular-nums">
            {doneCount} of {steps.length}
          </span>
        </span>
        {next >= 0 && (
          <span className={cn("truncate", stuck >= 0 && "text-warning")}>
            Next: {STAGE_LABEL[steps[next].stage]}
          </span>
        )}
      </p>
      <ol className="grid grid-cols-6">
        {steps.map((step, index) => {
          const isNext = index === next;
          const isStuck = index === stuck;
          const linked = index < steps.length - 1;
          const lineDone = step.done && steps[index + 1]?.done;
          return (
            <li key={step.stage} className="flex min-w-0 flex-col gap-1.5">
              <span className="flex items-center">
                <PathDot done={step.done} next={isNext} stuck={isStuck} />
                {linked && (
                  <span
                    aria-hidden
                    className={cn(
                      "mx-1.5 h-px flex-1",
                      lineDone ? "bg-success/60" : "bg-line-strong",
                    )}
                  />
                )}
              </span>
              <span
                className={cn(
                  "caption-style truncate pr-2 max-sm:sr-only",
                  step.done
                    ? "text-foreground"
                    : isStuck
                      ? "text-warning font-medium"
                      : isNext
                        ? "text-fg-secondary font-medium"
                        : "text-fg-tertiary",
                )}
                title={STAGE_LABEL[step.stage]}
              >
                {STAGE_LABEL[step.stage]}
                <span className="sr-only">
                  {step.done
                    ? step.at
                      ? `, reached ${dateTime(step.at)}`
                      : ", done"
                    : isStuck
                      ? ", stuck here"
                      : isNext
                        ? ", next step"
                        : ", not yet"}
                </span>
              </span>
              <span
                aria-hidden
                className="caption-style text-fg-tertiary h-4 truncate tabular-nums max-sm:hidden"
                title={step.at ? dateTime(step.at) : undefined}
              >
                {step.at ? shortDate(step.at) : step.done ? "Done" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PathDot({
  done,
  next,
  stuck,
}: {
  done: boolean;
  next: boolean;
  stuck: boolean;
}) {
  if (done) {
    return (
      <span
        aria-hidden
        className="bg-success text-background flex size-4 shrink-0 items-center justify-center rounded-full"
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
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border",
        stuck
          ? "border-warning bg-warning/15"
          : next
            ? "border-fg-secondary"
            : "border-line-strong border-dashed",
      )}
    >
      {(next || stuck) && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            stuck ? "bg-warning" : "bg-fg-secondary",
          )}
        />
      )}
    </span>
  );
}
