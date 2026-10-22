"use client";

import Avatar from "@/components/_ui/avatar";
import { Checkbox } from "@/components/_ui/checkbox";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { AutoTag, RecordChip, type HiddenRecord } from "./task-card";
import { DueChip } from "./task-chips";
import { PriorityIcon, type TaskRow } from "./task-meta";
import { useTaskActions } from "./use-task-actions";

type TaskChecklistProps = {
  tasks: TaskRow[];
  /** Hide the linked record when the list already sits on that record. */
  hideRecord?: HiddenRecord;
  showAssignee?: boolean;
  className?: string;
};

/** Compact rows with a complete checkbox; the title opens the task. */
export default function TaskChecklist({
  tasks,
  hideRecord,
  showAssignee = false,
  className,
}: TaskChecklistProps) {
  return (
    <ul className={cn("divide-border -mx-3 flex flex-col divide-y", className)}>
      {tasks.map((task) => (
        <TaskChecklistRow
          key={task._id}
          task={task}
          hideRecord={hideRecord}
          showAssignee={showAssignee}
        />
      ))}
    </ul>
  );
}

function TaskChecklistRow({
  task,
  hideRecord,
  showAssignee,
}: {
  task: TaskRow;
  hideRecord: TaskChecklistProps["hideRecord"];
  showAssignee: boolean;
}) {
  const { setDone } = useTaskActions();
  const setEdit = useUiStore((state) => state.setEdit);
  const done = task.status === "done";

  return (
    <li className="group/card hover:bg-overlay-1 duration-fast flex items-start gap-3 px-3 py-2.5 transition-colors sm:items-center">
      <Checkbox
        checked={done}
        onCheckedChange={(checked) => void setDone(task, checked === true)}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className="mt-px sm:mt-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={() => setEdit({ type: "task", id: task._id })}
          className={cn(
            "lead-style focus-visible:ring-ring hover:text-foreground min-w-0 cursor-pointer truncate rounded-sm text-left leading-snug outline-none focus-visible:ring-2 sm:flex-1",
            done && "text-fg-tertiary line-through",
          )}
        >
          {task.title}
        </button>
        <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
          {(task.priority === "urgent" || task.priority === "high") && (
            <Tooltip content={task.priority === "urgent" ? "Urgent" : "High"}>
              <span
                role="img"
                aria-label={`${task.priority === "urgent" ? "Urgent" : "High"} priority`}
              >
                <PriorityIcon priority={task.priority} className="size-3" />
              </span>
            </Tooltip>
          )}
          {task.automated && <AutoTag />}
          <RecordChip task={task} hide={hideRecord} className="max-w-48" />
          <DueChip task={task} hideEmpty />
          {showAssignee && task.assignee && (
            <Tooltip content={task.assignee.name}>
              <span>
                <Avatar name={task.assignee.name} label={task.assignee.name} />
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    </li>
  );
}

export function TaskChecklistSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="divide-border -mx-3 flex flex-col divide-y">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  );
}
