"use client";

import { useId } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { Property } from "@/components/record/properties";
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

/** Hypedrive platform usage for a linked account, in the account page sidebar. */
export default function AccountPlatform({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  const data = useQuery(api.platform.forAccount, { accountId });
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2
        id={headingId}
        className="caption-style text-fg-tertiary mb-1.5 font-medium"
      >
        Platform
      </h2>
      {data === undefined ? (
        <div aria-busy className="flex flex-col gap-2.5 py-1">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-3 w-36" />
        </div>
      ) : data.orgId === null ? (
        <p className="text-fg-tertiary text-sm leading-8">
          Not on Hypedrive yet
        </p>
      ) : (
        <PlatformDetails data={data} />
      )}
    </section>
  );
}

function PlatformDetails({ data }: { data: Linked }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.orgId);
      toast("Org ID copied");
    } catch {
      toast("Couldn't copy the org ID");
    }
  }

  return (
    <>
      <dl className="flex flex-col">
        <Property
          label="Organisation"
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
      </dl>
      <ActivationSteps steps={data.steps} />
      <dl className="flex flex-col">
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
      </dl>
    </>
  );
}

function ActivationSteps({ steps }: { steps: Linked["steps"] }) {
  const doneCount = steps.filter((step) => step.done).length;
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <p className="caption-style text-fg-tertiary flex justify-between">
        <span>Activation</span>
        <span className="tabular-nums">
          {doneCount} of {steps.length}
        </span>
      </p>
      <ol aria-label="Activation progress" className="flex flex-col">
        {steps.map((step, index) => {
          const next = steps[index + 1];
          return (
            <li
              key={step.stage}
              className="relative grid h-7 grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-2.5"
            >
              {next && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[calc(50%+0.5rem)] left-[0.4375rem] h-[calc(100%-1rem)] w-px -translate-x-1/2",
                    step.done && next.done ? "bg-success/50" : "bg-border",
                  )}
                />
              )}
              <StepDot done={step.done} />
              <span
                className={cn(
                  "truncate text-sm",
                  step.done ? "text-foreground" : "text-fg-tertiary",
                )}
              >
                {STAGE_LABEL[step.stage]}
                <span className="sr-only">
                  {step.done ? ", done" : ", not yet"}
                </span>
              </span>
              {step.at !== null && (
                <time
                  dateTime={new Date(step.at).toISOString()}
                  title={dateTime(step.at)}
                  className="caption-style text-fg-tertiary tabular-nums"
                >
                  {shortDate(step.at)}
                </time>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepDot({ done }: { done: boolean }) {
  if (!done) {
    return (
      <span
        aria-hidden
        className="border-line-strong size-3.5 rounded-full border border-dashed"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="bg-success text-background flex size-3.5 items-center justify-center rounded-full"
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
