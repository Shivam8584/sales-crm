"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Board, { type BoardColumnDef } from "@/components/board/board";
import Skeleton from "@/components/_ui/skeleton";
import type { Id } from "@/convex/_generated/dataModel";
import { TASK_STATUSES, type TaskStatus } from "@/lib/domain/enums";
import { TASK_STATUS_LABEL } from "@/lib/domain/labels";
import { useUiStore } from "@/stores/ui-store";
import TaskCard from "./task-card";
import TaskComposer from "./task-composer";
import { STATUS_TONE, type TaskRow } from "./task-meta";
import { useTaskActions } from "./use-task-actions";

type BoardItem = TaskRow & { id: string };

const columnOf = (item: BoardItem) => item.status;
const labelOf = (item: BoardItem) => item.title;
const renderCard = (item: BoardItem) => <TaskCard task={item} />;

type TasksBoardProps = {
  tasks: TaskRow[];
  /** Assignee for tasks added from a column. */
  assigneeId?: Id<"members">;
  overlay?: ReactNode;
};

export default function TasksBoard({
  tasks,
  assigneeId,
  overlay,
}: TasksBoardProps) {
  const setEdit = useUiStore((state) => state.setEdit);
  const { move } = useTaskActions();
  const [composing, setComposing] = useState<TaskStatus | null>(null);

  const items = useMemo(
    () => tasks.map((task) => ({ ...task, id: task._id as string })),
    [tasks],
  );

  const columns: BoardColumnDef[] = TASK_STATUSES.map((status) => ({
    id: status,
    name: TASK_STATUS_LABEL[status],
    tone: STATUS_TONE[status],
    summary:
      composing === status ? (
        <TaskComposer
          status={status}
          assigneeId={assigneeId}
          onClose={() => setComposing(null)}
          className="mt-1"
        />
      ) : undefined,
  }));

  const onMove = useCallback(
    (id: string, columnId: string, beforeId: string | null) => {
      const task = items.find((item) => item.id === id);
      if (!task) return;
      void move(task, columnId as TaskStatus, beforeId as Id<"tasks"> | null);
    },
    [items, move],
  );

  return (
    <Board
      columns={columns}
      items={items}
      columnOf={columnOf}
      renderCard={renderCard}
      getLabel={labelOf}
      onMove={onMove}
      onOpen={(id) => setEdit({ type: "task", id })}
      onAdd={(status) => setComposing(status as TaskStatus)}
      addLabel="Add task"
      emptyLabel="No tasks"
      overlay={overlay}
    />
  );
}

export function TasksBoardSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {[3, 2, 1].map((count, column) => (
        <div
          key={column}
          className="border-border flex w-[85vw] max-w-80 shrink-0 flex-col gap-2.5 border-r px-3 pt-3 sm:w-72 lg:w-auto lg:max-w-none lg:min-w-64 lg:flex-1"
        >
          <div className="flex h-5 items-center gap-2 pb-3">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              className="bg-card shadow-card flex flex-col gap-3 rounded-xl p-3"
            >
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
