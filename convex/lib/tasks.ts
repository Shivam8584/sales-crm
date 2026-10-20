import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { Priority, TaskStatus } from "../../lib/domain/enums";
import { isValidDay } from "../../lib/domain/normalize";
import { invalid } from "./errors";
import { logSystem, type RecordRefs } from "./timeline";

const GAP = 1024;
const MIN_GAP = 1e-6;
const DAY_MS = 24 * 60 * 60_000;

export async function endPosition(ctx: QueryCtx, status: TaskStatus) {
  const last = await ctx.db
    .query("tasks")
    .withIndex("by_status_position", (q) => q.eq("status", status))
    .order("desc")
    .first();
  return (last?.position ?? 0) + GAP;
}

function between(before: number | undefined, after: number | undefined) {
  if (before === undefined && after === undefined) return GAP;
  if (before === undefined) return after! - GAP;
  if (after === undefined) return before + GAP;
  return (before + after) / 2;
}

/** Position that places a task right before `beforeId` (or last) in a column. */
export async function positionBefore(
  ctx: MutationCtx,
  status: TaskStatus,
  taskId: Id<"tasks">,
  beforeId: Id<"tasks"> | null,
) {
  const column = async () =>
    (
      await ctx.db
        .query("tasks")
        .withIndex("by_status_position", (q) => q.eq("status", status))
        .collect()
    ).filter((task) => task._id !== taskId);
  let tasks = await column();
  const neighbours = () => {
    const found = beforeId
      ? tasks.findIndex((task) => task._id === beforeId)
      : -1;
    const index = found === -1 ? tasks.length : found;
    return [tasks[index - 1]?.position, tasks[index]?.position] as const;
  };
  let [before, after] = neighbours();
  if (before !== undefined && after !== undefined && after - before < MIN_GAP) {
    for (const [index, task] of tasks.entries()) {
      await ctx.db.patch(task._id, { position: (index + 1) * GAP });
    }
    tasks = await column();
    [before, after] = neighbours();
  }
  return between(before, after);
}

export function taskRefs(task: Partial<Doc<"tasks">>): RecordRefs {
  return {
    accountId: task.accountId,
    personId: task.personId,
    dealId: task.dealId,
    leadId: task.leadId,
  };
}

export function hasRefs(refs: RecordRefs) {
  return Boolean(refs.accountId || refs.personId || refs.dealId || refs.leadId);
}

/** Bumps `lastActivityAt` on the linked account and person. */
export async function touchRecords(ctx: MutationCtx, refs: RecordRefs) {
  const now = Date.now();
  for (const id of [refs.accountId, refs.personId]) {
    if (!id) continue;
    const doc = await ctx.db.get(id);
    if (doc && (doc.lastActivityAt ?? 0) < now) {
      await ctx.db.patch(id, { lastActivityAt: now });
    }
  }
}

export function checkDueDate(day: string) {
  if (!isValidDay(day)) invalid("dueDate", "Pick a valid date");
  return day;
}

export type AutomatedTask = {
  /** Stable identity of the rule and record, e.g. `activation:gst:<accountId>`. */
  automationKey: string;
  title: string;
  notes?: string;
  priority?: Priority;
  assigneeId: Id<"members">;
  dueDate?: string;
  accountId?: Id<"accounts">;
  personId?: Id<"people">;
  dealId?: Id<"deals">;
  leadId?: Id<"leads">;
  /** A task completed within this window is left done; defaults to 7 days. */
  cooldownMs?: number;
};

export type AutomatedTaskResult = {
  id: Id<"tasks">;
  outcome: "created" | "reopened" | "unchanged";
};

/**
 * Creates the task for `automationKey`, or leaves the existing one alone.
 * A done task is reopened only once it was completed longer ago than the cooldown,
 * so a rule that keeps firing doesn't undo a rep's recent work.
 */
export async function upsertAutomatedTask(
  ctx: MutationCtx,
  { automationKey, cooldownMs = 7 * DAY_MS, ...task }: AutomatedTask,
): Promise<AutomatedTaskResult> {
  if (task.dueDate) checkDueDate(task.dueDate);
  const existing = await ctx.db
    .query("tasks")
    .withIndex("by_automation_key", (q) => q.eq("automationKey", automationKey))
    .first();
  const now = Date.now();

  if (!existing) {
    const id = await ctx.db.insert("tasks", {
      ...task,
      title: task.title.trim(),
      status: "todo",
      priority: task.priority ?? "normal",
      position: await endPosition(ctx, "todo"),
      automationKey,
      updatedAt: now,
    });
    const refs = taskRefs(task);
    if (hasRefs(refs)) {
      await logSystem(ctx, refs, `created the task “${task.title.trim()}”`);
    }
    return { id, outcome: "created" };
  }

  const recentlyDone =
    existing.status === "done" &&
    now - (existing.completedAt ?? existing.updatedAt) < cooldownMs;
  if (existing.status !== "done" || recentlyDone) {
    return { id: existing._id, outcome: "unchanged" };
  }

  await ctx.db.patch(existing._id, {
    title: task.title.trim(),
    notes: task.notes,
    priority: task.priority ?? existing.priority,
    dueDate: task.dueDate,
    status: "todo",
    completedAt: undefined,
    position: await endPosition(ctx, "todo"),
    updatedAt: now,
  });
  const refs = taskRefs(existing);
  if (hasRefs(refs)) {
    await logSystem(ctx, refs, `reopened the task “${task.title.trim()}”`);
  }
  return { id: existing._id, outcome: "reopened" };
}
