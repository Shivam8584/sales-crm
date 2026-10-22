import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  personName,
} from "../../lib/domain/labels";
import { diff } from "./timeline";

type Change = NonNullable<Doc<"auditEvents">["changes"]>[number];
type RecordType = Doc<"auditEvents">["recordType"];

const MAX_VALUE = 200;

const TASK_LABELS = {
  title: "Title",
  notes: "Notes",
  status: "Status",
  priority: "Priority",
  dueDate: "Due date",
  assignee: "Assignee",
  account: "Account",
  person: "Person",
};

export async function recordEdit(
  ctx: MutationCtx,
  recordType: RecordType,
  recordId: Id<"deals"> | Id<"tasks">,
  label: string,
  actorId: Id<"members">,
  changes: Change[],
) {
  if (changes.length === 0) return;
  await ctx.db.insert("auditEvents", {
    action: "update",
    recordType,
    recordId,
    label,
    actorId,
    at: Date.now(),
    changes,
  });
}

/** Keeps a copy that `restore` can re-create the record from. */
export async function recordDelete(
  ctx: MutationCtx,
  recordType: RecordType,
  recordId: Id<"deals"> | Id<"tasks">,
  label: string,
  actorId: Id<"members">,
  snapshot: unknown,
) {
  await ctx.db.insert("auditEvents", {
    action: "delete",
    recordType,
    recordId,
    label,
    actorId,
    at: Date.now(),
    snapshot,
  });
}

/** Closes the matching delete so it can't be restored a second time. */
export async function markRestored(
  ctx: MutationCtx,
  recordType: RecordType,
  matches: (event: Doc<"auditEvents">) => boolean,
) {
  const recent = await ctx.db
    .query("auditEvents")
    .withIndex("by_action_at", (q) => q.eq("action", "delete"))
    .order("desc")
    .filter((q) =>
      q.and(
        q.eq(q.field("recordType"), recordType),
        q.eq(q.field("restoredAt"), undefined),
      ),
    )
    .take(50);
  const event = recent.find(matches);
  if (event) {
    await ctx.db.patch(event._id, {
      restoredAt: Date.now(),
      snapshot: undefined,
    });
  }
}

async function taskView(ctx: QueryCtx, task: Doc<"tasks">) {
  const [assignee, account, person] = await Promise.all([
    ctx.db.get(task.assigneeId),
    task.accountId ? ctx.db.get(task.accountId) : null,
    task.personId ? ctx.db.get(task.personId) : null,
  ]);
  return {
    title: task.title,
    notes:
      task.notes && task.notes.length > MAX_VALUE
        ? `${task.notes.slice(0, MAX_VALUE)}…`
        : task.notes,
    status: TASK_STATUS_LABEL[task.status],
    priority: PRIORITY_LABEL[task.priority],
    dueDate: task.dueDate,
    assignee: assignee?.name,
    account: account?.name,
    person: person ? personName(person) : undefined,
  };
}

export async function recordTaskEdit(
  ctx: MutationCtx,
  before: Doc<"tasks">,
  patch: Partial<Doc<"tasks">>,
  actorId: Id<"members">,
) {
  const after = { ...before, ...patch };
  const [from, to] = await Promise.all([
    taskView(ctx, before),
    taskView(ctx, after),
  ]);
  await recordEdit(
    ctx,
    "tasks",
    before._id,
    after.title,
    actorId,
    diff(from, to, TASK_LABELS),
  );
}
