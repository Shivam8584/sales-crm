"use client";

import { useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TaskStatus } from "@/lib/domain/enums";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import type { TaskRow } from "./task-meta";

export type TaskPatch = FunctionArgs<typeof api.tasks.update>["patch"];
type ListArgs = FunctionArgs<typeof api.tasks.list>;

const GAP = 1024;

function belongs(args: ListArgs, row: TaskRow) {
  if (args.status && row.status !== args.status) return false;
  if (args.done === "none" && row.status === "done") return false;
  if (args.assigneeId && row.assigneeId !== args.assigneeId) return false;
  return true;
}

function between(before?: number, after?: number) {
  if (before === undefined && after === undefined) return GAP;
  if (before === undefined) return after! - GAP;
  if (after === undefined) return before + GAP;
  return (before + after) / 2;
}

/** Rewrites one task in every cached task query; `next` returns null to drop it. */
function rewrite(
  store: OptimisticLocalStore,
  id: Id<"tasks">,
  next: (row: TaskRow, rows: TaskRow[]) => TaskRow | null,
) {
  for (const { args, value } of store.getAllQueries(api.tasks.list)) {
    if (!value) continue;
    const row = value.find((item) => item._id === id);
    if (!row) continue;
    const updated = next(row, value);
    const rows = value.filter((item) => item._id !== id);
    if (updated && belongs(args, updated)) rows.push(updated);
    store.setQuery(
      api.tasks.list,
      args,
      rows.sort((a, b) => a.position - b.position),
    );
  }
  for (const { args, value } of store.getAllQueries(api.tasks.get)) {
    if (!value || value._id !== id) continue;
    store.setQuery(api.tasks.get, args, next(value, [value]));
  }
}

function withStatus(row: TaskRow, status: TaskStatus, position: number) {
  if (status === row.status) return { ...row, position };
  return {
    ...row,
    status,
    position,
    completedAt: status === "done" ? Date.now() : null,
  };
}

function optimisticUpdate(
  store: OptimisticLocalStore,
  { id, patch }: FunctionArgs<typeof api.tasks.update>,
) {
  const members = store.getQuery(api.members.list, {});
  rewrite(store, id, (row, rows) => {
    let next: TaskRow = { ...row };
    if (patch.title !== undefined) next.title = patch.title.trim();
    if (patch.notes !== undefined) next.notes = patch.notes || null;
    if (patch.priority !== undefined) next.priority = patch.priority;
    if (patch.dueDate !== undefined) next.dueDate = patch.dueDate || null;
    if (patch.assigneeId !== undefined) {
      const member = members?.find((item) => item._id === patch.assigneeId);
      next.assigneeId = patch.assigneeId;
      next.assignee = member
        ? { _id: member._id, name: member.name }
        : row.assignee;
    }
    if (patch.status !== undefined && patch.status !== row.status) {
      const last = Math.max(
        0,
        ...rows
          .filter((item) => item.status === patch.status)
          .map((item) => item.position),
      );
      next = withStatus(next, patch.status, last + GAP);
    }
    return next;
  });
}

function optimisticMove(
  store: OptimisticLocalStore,
  { id, status, beforeId }: FunctionArgs<typeof api.tasks.move>,
) {
  rewrite(store, id, (row, rows) => {
    const column = rows
      .filter((item) => item.status === status && item._id !== id)
      .sort((a, b) => a.position - b.position);
    const found = beforeId
      ? column.findIndex((item) => item._id === beforeId)
      : -1;
    const index = found === -1 ? column.length : found;
    return withStatus(
      row,
      status,
      between(column[index - 1]?.position, column[index]?.position),
    );
  });
}

function optimisticRemove(
  store: OptimisticLocalStore,
  { id }: FunctionArgs<typeof api.tasks.remove>,
) {
  rewrite(store, id, () => null);
}

function report(error: unknown) {
  toast(readError(error, "Couldn't save that change").message, {
    tone: "danger",
  });
}

function optimisticUpdateMany(
  store: OptimisticLocalStore,
  { updates }: FunctionArgs<typeof api.tasks.updateMany>,
) {
  for (const { id, patch } of updates) optimisticUpdate(store, { id, patch });
}

/** `tasks.updateMany` with an optimistic update, for bulk actions. */
export function useUpdateMany() {
  const updateMany = useMutation(api.tasks.updateMany);
  return useMemo(
    () => updateMany.withOptimisticUpdate(optimisticUpdateMany),
    [updateMany],
  );
}

/** `tasks.update` with an optimistic update; rejects so forms can show field errors. */
export function useUpdateTask() {
  const update = useMutation(api.tasks.update);
  return useMemo(() => update.withOptimisticUpdate(optimisticUpdate), [update]);
}

/** Task mutations with optimistic updates and undo toasts. */
export function useTaskActions() {
  const updateTask = useUpdateTask();
  const moveBase = useMutation(api.tasks.move);
  const removeBase = useMutation(api.tasks.remove);
  const moveTask = useMemo(
    () => moveBase.withOptimisticUpdate(optimisticMove),
    [moveBase],
  );
  const removeTask = useMemo(
    () => removeBase.withOptimisticUpdate(optimisticRemove),
    [removeBase],
  );
  const placeTask = useMutation(api.tasks.place);
  const restoreTask = useMutation(api.tasks.restore);

  const update = useCallback(
    async (id: Id<"tasks">, patch: TaskPatch, label?: string) => {
      try {
        const previous = await updateTask({ id, patch });
        if (!label) return previous;
        const restore = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            previous[key as keyof typeof previous],
          ]),
        ) as TaskPatch;
        toast(`${label} updated`, () => {
          updateTask({ id, patch: restore }).catch(report);
        });
        return previous;
      } catch (error) {
        report(error);
      }
    },
    [updateTask],
  );

  const setDone = useCallback(
    async (task: Pick<TaskRow, "_id" | "title" | "status">, done: boolean) => {
      const status: TaskStatus = done ? "done" : "todo";
      if (task.status === status) return;
      try {
        const previous = await updateTask({ id: task._id, patch: { status } });
        toast(
          done ? `Completed “${task.title}”` : `Reopened “${task.title}”`,
          () => {
            updateTask({
              id: task._id,
              patch: { status: previous.status },
            }).catch(report);
          },
        );
      } catch (error) {
        report(error);
      }
    },
    [updateTask],
  );

  const move = useCallback(
    async (task: TaskRow, status: TaskStatus, beforeId: Id<"tasks"> | null) => {
      try {
        const previous = await moveTask({ id: task._id, status, beforeId });
        if (status === "done" && task.status !== "done") {
          toast(`Completed “${task.title}”`, () => {
            placeTask({ id: task._id, ...previous }).catch(report);
          });
        }
      } catch (error) {
        report(error);
      }
    },
    [moveTask, placeTask],
  );

  const remove = useCallback(
    async (task: Pick<TaskRow, "_id" | "title">) => {
      try {
        const stored = await removeTask({ id: task._id });
        toast(`Deleted “${task.title}”`, () => {
          restoreTask({ task: stored }).catch(report);
        });
        return true;
      } catch (error) {
        report(error);
        return false;
      }
    },
    [removeTask, restoreTask],
  );

  return useMemo(
    () => ({ update, setDone, move, remove }),
    [update, setDone, move, remove],
  );
}
