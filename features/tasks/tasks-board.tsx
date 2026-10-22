"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Board, {
  type BoardColumnDef,
  type BoardSort,
} from "@/components/board/board";
import type { BoardPrefs } from "@/components/board/board-prefs";
import Skeleton from "@/components/_ui/skeleton";
import type { Id } from "@/convex/_generated/dataModel";
import { PRIORITIES, TASK_STATUSES, type TaskStatus } from "@/lib/domain/enums";
import { TASK_STATUS_LABEL } from "@/lib/domain/labels";
import { useUiStore } from "@/stores/ui-store";
import TaskCard from "./task-card";
import TaskComposer from "./task-composer";
import { STATUS_BADGE, type TaskRow } from "./task-meta";
import { useTaskActions } from "./use-task-actions";

type BoardItem = TaskRow & { id: string };

const columnOf = (item: BoardItem) => item.status;
const labelOf = (item: BoardItem) => item.title;
const renderCard = (item: BoardItem) => <TaskCard task={item} />;

const COLUMNS: BoardColumnDef[] = TASK_STATUSES.map((status) => ({
  id: status,
  name: TASK_STATUS_LABEL[status],
  icon: STATUS_BADGE[status].icon,
  tone: STATUS_BADGE[status].tone,
}));

const SORTS: BoardSort<BoardItem>[] = [
  {
    id: "priority",
    label: "priority",
    compare: (a, b) =>
      PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
      a.position - b.position,
  },
  {
    id: "due",
    label: "due date",
    compare: (a, b) =>
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.position - b.position,
  },
];

type TasksBoardProps = {
  tasks: TaskRow[];
  prefs: BoardPrefs;
  /** Assignee for tasks added from a column. */
  assigneeId?: Id<"members">;
  overlay?: ReactNode;
};

export default function TasksBoard({
  tasks,
  prefs,
  assigneeId,
  overlay,
}: TasksBoardProps) {
  const setEdit = useUiStore((state) => state.setEdit);
  const { move, reorder } = useTaskActions();
  const [composing, setComposing] = useState<TaskStatus | null>(null);

  const items = useMemo(
    () => tasks.map((task) => ({ ...task, id: task._id as string })),
    [tasks],
  );

  const onMove = useCallback(
    (id: string, columnId: string, beforeId: string | null) => {
      const task = items.find((item) => item.id === id);
      if (!task) return;
      void move(task, columnId as TaskStatus, beforeId as Id<"tasks"> | null);
    },
    [items, move],
  );

  const renderColumnTop = (columnId: string) =>
    composing === columnId ? (
      <TaskComposer
        status={composing}
        assigneeId={assigneeId}
        onClose={() => setComposing(null)}
      />
    ) : null;

  return (
    <Board
      columns={COLUMNS}
      items={items}
      columnOf={columnOf}
      renderCard={renderCard}
      getLabel={labelOf}
      onMove={onMove}
      onOpen={(id) => setEdit({ type: "task", id })}
      onAdd={(status) => setComposing(status as TaskStatus)}
      renderColumnTop={renderColumnTop}
      sorts={SORTS}
      onReorder={(columnId, ids, sort) =>
        void reorder(
          tasks,
          ids,
          `Sorted ${TASK_STATUS_LABEL[columnId as TaskStatus]} by ${sort.label}`,
        )
      }
      prefs={prefs}
      addLabel="Add task"
      emptyLabel="No tasks"
      overlay={overlay}
    />
  );
}

export function TasksBoardSkeleton() {
  return (
    <div aria-busy className="flex min-h-0 flex-1 overflow-hidden">
      {[3, 2, 1].map((count, column) => (
        <div
          key={column}
          className="border-border flex w-[85vw] max-w-85 shrink-0 flex-col gap-3 border-r px-4 pt-4 sm:w-80 lg:w-auto lg:max-w-none lg:min-w-80 lg:flex-1"
        >
          <div className="flex h-5 items-center gap-2 pb-5">
            <Skeleton className="size-3.5 rounded-[4px]" />
            <Skeleton className="h-3 w-16" />
          </div>
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              className="bg-card shadow-card flex flex-col rounded-2xl"
            >
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
