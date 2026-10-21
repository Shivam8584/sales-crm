"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { RecordSection } from "@/components/record/record-layout";
import PlusIcon from "@/public/assets/icons/plus.svg";
import type { HiddenRecord } from "./task-card";
import TaskChecklist, { TaskChecklistSkeleton } from "./task-checklist";
import TaskComposer from "./task-composer";
import { byUrgency } from "./task-meta";

export type TaskTarget =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> }
  | { dealId: Id<"deals"> }
  | { leadId: Id<"leads"> };

function hiddenFor(target: TaskTarget): HiddenRecord {
  if ("accountId" in target) return "account";
  if ("personId" in target) return "person";
  if ("dealId" in target) return "deal";
  return "lead";
}

/** Open tasks for a record, with a quick-add row; `bare` drops the section title for use inside a tab. */
export default function RecordTasks({
  target,
  bare = false,
}: {
  target: TaskTarget;
  bare?: boolean;
}) {
  const tasks = useQuery(api.tasks.list, { ...target, done: "none" });
  const [composing, setComposing] = useState(false);
  const sorted = tasks && [...tasks].sort(byUrgency);
  const showAdd = Boolean(sorted?.length) && !composing;

  const add = (
    <Button variant="ghost" size="xs" onClick={() => setComposing(true)}>
      <PlusIcon aria-hidden className="size-2.5" />
      Add task
    </Button>
  );

  const body = (
    <>
      {sorted === undefined ? (
        <TaskChecklistSkeleton rows={1} />
      ) : sorted.length > 0 ? (
        <TaskChecklist
          tasks={sorted}
          hideRecord={hiddenFor(target)}
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
    </>
  );

  if (bare) {
    return (
      <div className="flex flex-col gap-3">
        {showAdd && <div className="-mb-1 flex justify-end">{add}</div>}
        {body}
      </div>
    );
  }

  return (
    <RecordSection title="Tasks" action={showAdd ? add : undefined}>
      {body}
    </RecordSection>
  );
}
