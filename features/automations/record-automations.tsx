"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import {
  SUBJECT_LABEL,
  isLive,
  type SubjectKind,
} from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import PlusIcon from "@/public/assets/icons/plus.svg";
import AddToAutomation from "./add-to-automation";
import { RunStatus } from "./automation-runs";

export type AutomationTarget =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> }
  | { leadId: Id<"leads"> }
  | { dealId: Id<"deals"> };

type RecordRun = FunctionReturnType<
  typeof api.automations.forRecord
>["runs"][number];

function subjectOf(target: AutomationTarget): {
  kind: SubjectKind;
  id: string;
} {
  if ("accountId" in target) return { kind: "account", id: target.accountId };
  if ("personId" in target) return { kind: "person", id: target.personId };
  if ("leadId" in target) return { kind: "lead", id: target.leadId };
  return { kind: "deal", id: target.dealId };
}

/** A record's sequence runs, with add, pause, resume and remove; for a record page tab. */
export function RecordAutomations({ target }: { target: AutomationTarget }) {
  const subject = subjectOf(target);
  const data = useQuery(api.automations.forRecord, { target: subject });
  const exit = useMutation(api.automations.exitEnrollment);
  const pause = useMutation(api.automations.pauseEnrollment);
  const resume = useMutation(api.automations.resumeEnrollment);
  const noun = SUBJECT_LABEL[subject.kind][0];

  async function run(
    action: () => Promise<unknown>,
    message: string,
    undo?: () => void,
  ) {
    try {
      await action();
      toast(message, undo);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  const onPause = (item: RecordRun) =>
    run(
      () => pause({ id: item._id }),
      `Paused in ${item.automation}`,
      () => void resume({ id: item._id }),
    );
  const onResume = (item: RecordRun) =>
    run(() => resume({ id: item._id }), `Resumed in ${item.automation}`);
  const onRemove = (item: RecordRun) =>
    run(() => exit({ id: item._id }), `Removed from ${item.automation}`);

  if (data === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  const addButton = data.available.length > 0 && (
    <AddToAutomation
      kind={subject.kind}
      ids={[subject.id]}
      align="end"
      side="bottom"
      className="h-control-sm"
    >
      <PlusIcon aria-hidden className="size-2.5" />
      Add to sequence
    </AddToAutomation>
  );

  return (
    <div className="flex flex-col gap-3">
      {(data.runs.length > 0 || addButton) && (
        <div className="flex items-center justify-between gap-2">
          <span className="caption-style text-fg-tertiary">
            {data.runs.filter((item) => isLive(item.status)).length} running ·{" "}
            {data.runs.length} total
          </span>
          {addButton}
        </div>
      )}
      {data.runs.length === 0 ? (
        <div className="border-border flex flex-col items-start gap-2 rounded-xl border border-dashed px-4 py-5">
          <span className="text-sm font-medium">Not in any sequence</span>
          <span className="caption-style text-fg-tertiary leading-snug">
            Sequences enrol this {noun} when their trigger fires.
            {data.available.length
              ? " You can also add it by hand."
              : ` No active sequence runs on ${SUBJECT_LABEL[subject.kind][1]} yet.`}
          </span>
          {data.available.length === 0 && (
            <Button variant="secondary" size="xs" href="/automation/sequences">
              Open sequences
            </Button>
          )}
        </div>
      ) : (
        <ul className="bg-card shadow-card flex flex-col overflow-hidden rounded-xl">
          {data.runs.map((item) => {
            const live = isLive(item.status);
            const detail = live
              ? [
                  item.step,
                  !item.paused &&
                    item.nextRunAt &&
                    `next ${relativeTime(item.nextRunAt)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : item.exitReason;
            return (
              <li
                key={item._id}
                className="border-border flex items-center gap-3 px-4 py-3 not-last:border-b max-sm:flex-wrap"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={`/automation/sequences/${item.automationId}`}
                      className="hover:text-foreground focus-visible:ring-ring truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2"
                    >
                      {item.automation}
                    </Link>
                    <RunStatus
                      status={item.status}
                      held={item.held}
                      paused={item.paused}
                    />
                  </div>
                  <span className="caption-style text-fg-tertiary truncate">
                    {detail ? `${detail} · ` : ""}
                    <time title={dateTime(item.enrolledAt)}>
                      enrolled {relativeTime(item.enrolledAt)}
                    </time>
                  </span>
                </div>
                {live && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        void (item.paused ? onResume(item) : onPause(item))
                      }
                    >
                      {item.paused ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => void onRemove(item)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default RecordAutomations;
