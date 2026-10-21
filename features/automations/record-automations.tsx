"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import OptionPicker from "@/components/fields/option-picker";
import {
  SUBJECT_LABEL,
  isLive,
  type SubjectKind,
} from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import PlusIcon from "@/public/assets/icons/plus.svg";
import { RunStatus } from "./automation-runs";

export type AutomationTarget =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> }
  | { leadId: Id<"leads"> }
  | { dealId: Id<"deals"> };

function subjectOf(target: AutomationTarget): {
  kind: SubjectKind;
  id: string;
} {
  if ("accountId" in target) return { kind: "account", id: target.accountId };
  if ("personId" in target) return { kind: "person", id: target.personId };
  if ("leadId" in target) return { kind: "lead", id: target.leadId };
  return { kind: "deal", id: target.dealId };
}

/** A record's automation runs, with enrol and remove; for a record page tab. */
export function RecordAutomations({ target }: { target: AutomationTarget }) {
  const subject = subjectOf(target);
  const data = useQuery(api.automations.forRecord, { target: subject });
  const enrol = useMutation(api.automations.enrollRecord);
  const exit = useMutation(api.automations.exitEnrollment);
  const noun = SUBJECT_LABEL[subject.kind][0];

  async function onEnrol(id: string | null) {
    if (!id) return;
    const name =
      data?.available.find((item) => item._id === id)?.name ?? "the automation";
    try {
      await enrol({ id: id as Id<"automations">, target: subject });
      toast(`Enrolled in ${name}`);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function onRemove(id: Id<"automationEnrollments">, name: string) {
    try {
      await exit({ id });
      toast(`Removed from ${name}`);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  if (data === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  const enrolButton = data.available.length > 0 && (
    <OptionPicker
      value={null}
      label="Enrol in an automation"
      align="end"
      searchPlaceholder="Search automations…"
      options={data.available.map((item) => ({
        value: item._id,
        label: item.name,
      }))}
      onChange={(id) => void onEnrol(id)}
      className="h-control-sm mx-0 px-2.5 text-xs"
    >
      <span className="flex items-center gap-1.5">
        <PlusIcon aria-hidden className="size-2.5" />
        Enrol in automation
      </span>
    </OptionPicker>
  );

  return (
    <div className="flex flex-col gap-3">
      {(data.runs.length > 0 || enrolButton) && (
        <div className="flex items-center justify-between gap-2">
          <span className="caption-style text-fg-tertiary">
            {data.runs.filter((run) => isLive(run.status)).length} running ·{" "}
            {data.runs.length} total
          </span>
          {enrolButton}
        </div>
      )}
      {data.runs.length === 0 ? (
        <div className="border-border flex flex-col items-start gap-2 rounded-xl border border-dashed px-4 py-5">
          <span className="text-sm font-medium">Not in any automation</span>
          <span className="caption-style text-fg-tertiary leading-snug">
            Automations enrol this {noun} when their trigger fires.
            {data.available.length
              ? " You can also enrol it by hand."
              : ` No active automation runs on ${SUBJECT_LABEL[subject.kind][1]} yet.`}
          </span>
          {data.available.length === 0 && (
            <Button variant="secondary" size="xs" href="/automations">
              Open automations
            </Button>
          )}
        </div>
      ) : (
        <ul className="bg-card shadow-card flex flex-col overflow-hidden rounded-xl">
          {data.runs.map((run) => {
            const live = isLive(run.status);
            const detail = live
              ? [
                  run.step,
                  run.nextRunAt && `next ${relativeTime(run.nextRunAt)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : run.exitReason;
            return (
              <li
                key={run._id}
                className="border-border group/run flex items-center gap-3 px-4 py-3 not-last:border-b"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={`/automations/${run.automationId}`}
                      className="hover:text-foreground focus-visible:ring-ring truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2"
                    >
                      {run.automation}
                    </Link>
                    <RunStatus status={run.status} held={run.held} />
                  </div>
                  <span className="caption-style text-fg-tertiary truncate">
                    {detail ? `${detail} · ` : ""}
                    <time title={dateTime(run.enrolledAt)}>
                      enrolled {relativeTime(run.enrolledAt)}
                    </time>
                  </span>
                </div>
                {live && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void onRemove(run._id, run.automation)}
                    className="shrink-0"
                  >
                    Remove
                  </Button>
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
