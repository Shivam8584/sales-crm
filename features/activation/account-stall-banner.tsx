"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { dayFromToday, dayPhrase } from "@/features/tasks/task-meta";
import { useTaskActions } from "@/features/tasks/use-task-actions";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import { firstSentence, stuckFor } from "./stall";

/** Shown at the top of an account page while its onboarding is stuck on a step. */
export default function AccountStallBanner({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  const stall = useQuery(api.activation.forAccount, { accountId });
  const ensureTask = useMutation(api.activation.ensureTask);
  const setEdit = useUiStore((state) => state.setEdit);
  const { update, setDone } = useTaskActions();
  const [creating, setCreating] = useState(false);

  if (!stall) return null;
  const { rule, task } = stall;
  const today = dayFromToday(0);
  const open = task && task.status !== "done";
  const snoozed = open && task.dueDate !== null && task.dueDate > today;

  async function openTask() {
    if (task) {
      setEdit({ type: "task", id: task._id });
      return;
    }
    setCreating(true);
    try {
      const id = await ensureTask({ accountId });
      if (id) setEdit({ type: "task", id });
      else toast("This brand isn't stuck any more");
    } catch (error) {
      toast(readError(error, "Couldn't open the task").message, {
        tone: "danger",
      });
    } finally {
      setCreating(false);
    }
  }

  function snooze() {
    if (!task) return;
    const tomorrow = dayFromToday(1);
    void update(task._id, { dueDate: tomorrow }).then((previous) => {
      if (!previous) return;
      toast("Snoozed until tomorrow", () => {
        void update(task._id, { dueDate: previous.dueDate });
      });
    });
  }

  const status = !task
    ? "No task yet"
    : !open
      ? `Followed up ${task.completedAt ? relativeTime(task.completedAt) : ""}`.trim()
      : snoozed
        ? `Snoozed, back ${dayPhrase(task.dueDate!)}`
        : task.assignee
          ? `With ${task.assignee.name}${task.dueDate ? ` · due ${dayPhrase(task.dueDate)}` : ""}`
          : "Open task";

  return (
    <aside
      aria-label="Onboarding stuck"
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:gap-4",
        snoozed || !open
          ? "border-border bg-overlay-1"
          : "border-warning/30 bg-[color-mix(in_srgb,var(--warning)_7%,transparent)]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {snoozed ? (
          <ClockIcon
            aria-hidden
            className="text-fg-tertiary mt-0.5 size-4 shrink-0"
          />
        ) : (
          <AlertIcon
            aria-hidden
            className={cn(
              "mt-0.5 size-4 shrink-0",
              open ? "text-warning" : "text-fg-tertiary",
            )}
          />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="lead-style leading-snug">
            <span className="font-medium" title={rule.description}>
              {rule.label}
            </span>
            <span className="text-fg-secondary">
              {" "}
              at {STAGE_LABEL[stall.stage]} for{" "}
              <time
                dateTime={new Date(stall.since).toISOString()}
                title={`Since ${dateTime(stall.since)}`}
              >
                {stuckFor(stall.since)}
              </time>
            </span>
          </p>
          <p
            className="caption-style text-fg-secondary leading-snug text-pretty"
            title={rule.playbook}
          >
            {firstSentence(rule.playbook)}
          </p>
          <p className="caption-style text-fg-tertiary truncate">{status}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 max-sm:pl-7">
        {open && !snoozed && (
          <>
            <Button variant="ghost" size="sm" onClick={snooze}>
              Snooze 1 day
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => task && void setDone(task, true)}
            >
              Mark done
            </Button>
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          loading={creating}
          onClick={() => void openTask()}
        >
          {task ? "Open task" : "Create task"}
        </Button>
      </div>
    </aside>
  );
}
