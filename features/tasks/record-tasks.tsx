"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { RecordSection } from "@/components/record/record-layout";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TaskChecklist, { TaskChecklistSkeleton } from "./task-checklist";
import TaskComposer from "./task-composer";

export type TaskTarget =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> };

/** Open tasks section on an account or person page. */
export default function RecordTasks({ target }: { target: TaskTarget }) {
  const tasks = useQuery(api.tasks.list, { ...target, done: "none" });
  const [composing, setComposing] = useState(false);
  const onAccount = "accountId" in target;

  const add = (
    <Button variant="ghost" size="xs" onClick={() => setComposing(true)}>
      <PlusIcon aria-hidden className="size-2.5" />
      Add task
    </Button>
  );

  return (
    <RecordSection
      title="Tasks"
      action={tasks?.length || composing ? add : undefined}
    >
      {tasks === undefined ? (
        <TaskChecklistSkeleton rows={1} />
      ) : tasks.length > 0 ? (
        <TaskChecklist
          tasks={tasks}
          hideRecord={onAccount ? "account" : "person"}
          showAssignee
        />
      ) : (
        !composing && (
          <p className="caption-style text-fg-tertiary -mt-1 flex items-center gap-1">
            No open tasks ·
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="text-fg-secondary hover:text-foreground focus-visible:ring-ring cursor-pointer rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2"
            >
              Add task
            </button>
          </p>
        )
      )}
      {composing && (
        <TaskComposer
          {...target}
          label="New task"
          onClose={() => setComposing(false)}
          className="border-border border shadow-none"
        />
      )}
    </RecordSection>
  );
}
