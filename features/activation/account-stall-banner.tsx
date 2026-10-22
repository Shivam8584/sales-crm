"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { dayFromToday, dayPhrase } from "@/features/tasks/task-meta";
import { useTaskActions } from "@/features/tasks/use-task-actions";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import AlertTriangleIcon from "@/public/assets/icons/alert-triangle.svg";
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
  const urgent = rule.priority === "urgent";

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

  const live = open && !snoozed;
  return (
    <aside
      aria-label="Onboarding stuck"
      className={cn(
        "flex min-h-11 flex-col gap-2 rounded-2xl py-1.5 pr-1.5 pl-4 text-sm sm:flex-row sm:items-center sm:gap-3",
        !live
          ? "bg-well"
          : urgent
            ? "bg-danger-surface text-danger-foreground"
            : "bg-warning-surface text-warning-foreground",
      )}
    >
      <p className="flex min-w-0 flex-1 items-center gap-3 py-1.5">
        <AlertTriangleIcon aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 truncate">
          <span className="font-medium" title={rule.description}>
            {rule.label}
          </span>{" "}
          for{" "}
          <time
            dateTime={new Date(stall.since).toISOString()}
            title={`Since ${dateTime(stall.since)}`}
          >
            {stuckFor(stall.since)}
          </time>
          .{" "}
          <span className="opacity-70" title={rule.playbook}>
            {firstSentence(rule.playbook)}
          </span>
          <span className="opacity-70"> · {status}</span>
        </span>
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {live && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={snooze}
              className="hover:bg-foreground/5 text-current/70 hover:text-current"
            >
              Snooze 1 day
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => task && void setDone(task, true)}
              className="hover:bg-foreground/5 text-current/70 hover:text-current"
            >
              Mark done
            </Button>
          </>
        )}
        {(task || stall.canOpenTask) && (
          <Button
            variant={live ? "primary" : "secondary"}
            size="sm"
            loading={creating}
            onClick={() => void openTask()}
          >
            {task ? "Open task" : "Create task"}
          </Button>
        )}
      </div>
    </aside>
  );
}
