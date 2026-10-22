import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { TASK_STATUSES, type TaskStatus } from "../lib/domain/enums";
import { personName } from "../lib/domain/labels";
import { cleanText } from "../lib/domain/normalize";
import { taskCompletedAt } from "../lib/domain/transitions";
import { emitAutomationTrigger } from "./lib/automations/engine";
import { invalid, notFound } from "./lib/errors";
import { memberMutation, memberQuery, type Viewer } from "./lib/functions";
import { searchText, vSearch } from "./lib/lists";
import { assertCan, can } from "./lib/permissions";
import {
  memberIndex,
  memberRef,
  requireAccount,
  requireActiveMember,
  requirePerson,
} from "./lib/records";
import {
  checkDueDate,
  endPosition,
  hasRefs,
  positionBefore,
  taskRefs,
  touchRecords,
} from "./lib/tasks";
import { logSystem } from "./lib/timeline";
import { literals, vDay, vPriority, vTaskStatus } from "./lib/validators";

const MAX_TITLE = 200;
const UNDO_WINDOW_MS = 10 * 60_000;

/** Assignees and managers reassign a task; whoever just handed it on may undo that. */
function checkReassign(viewer: Viewer, task: Doc<"tasks">, now: number) {
  const undoing =
    task.reassignedById === viewer._id &&
    now - (task.reassignedAt ?? 0) < UNDO_WINDOW_MS;
  if (!undoing && !can(viewer, "task.reassign", [task.assigneeId])) {
    assertCan(viewer, "task.reassign", [task.assigneeId]);
  }
}

/** The fields that follow a status change: board position and completion time. */
async function statusEffects(
  ctx: QueryCtx,
  task: Doc<"tasks">,
  status: TaskStatus,
  now: number,
) {
  return {
    position: await endPosition(ctx, status),
    completedAt: taskCompletedAt(task.status, status, task.completedAt, now),
  };
}
const MAX_NOTES = 5_000;
const RECENT_DONE_MS = 14 * 24 * 60 * 60_000;
const SEARCH_LIMIT = 200;
const COLUMN_LIMIT = 500;

const editable = {
  title: v.optional(v.string()),
  notes: v.optional(v.union(v.string(), v.null())),
  status: v.optional(vTaskStatus),
  priority: v.optional(vPriority),
  assigneeId: v.optional(v.id("members")),
  dueDate: v.optional(v.union(v.string(), v.null())),
  accountId: v.optional(v.union(v.id("accounts"), v.null())),
  personId: v.optional(v.union(v.id("people"), v.null())),
};

type Patch = {
  title?: string;
  notes?: string | null;
  status?: TaskStatus;
  priority?: Doc<"tasks">["priority"];
  assigneeId?: Id<"members">;
  dueDate?: string | null;
  accountId?: Id<"accounts"> | null;
  personId?: Id<"people"> | null;
};

async function clean(ctx: MutationCtx, patch: Patch, current?: Doc<"tasks">) {
  const out: Partial<Doc<"tasks">> = {};
  if (patch.title !== undefined) {
    const title = cleanText(patch.title);
    if (!title) invalid("title", "Enter a title");
    if (title.length > MAX_TITLE) invalid("title", "Title is too long");
    out.title = title;
  }
  if (patch.notes !== undefined) {
    const notes = patch.notes?.trim() || undefined;
    if (notes && notes.length > MAX_NOTES)
      invalid("notes", "Notes are too long");
    out.notes = notes;
  }
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.priority !== undefined) out.priority = patch.priority;
  if (patch.assigneeId !== undefined) {
    await requireActiveMember(ctx, patch.assigneeId, "assigneeId");
    out.assigneeId = patch.assigneeId;
  }
  if (patch.dueDate !== undefined) {
    out.dueDate = patch.dueDate ? checkDueDate(patch.dueDate) : undefined;
  }
  if (patch.accountId !== undefined) {
    if (patch.accountId) await requireAccount(ctx, patch.accountId);
    out.accountId = patch.accountId ?? undefined;
  }
  if (patch.personId !== undefined) {
    if (patch.personId) {
      const person = await requirePerson(ctx, patch.personId);
      if (
        patch.accountId === undefined &&
        person.accountId &&
        !current?.accountId
      ) {
        out.accountId = person.accountId;
      }
    }
    out.personId = patch.personId ?? undefined;
  }
  return out;
}

function snapshot(task: Doc<"tasks">): Required<Patch> {
  return {
    title: task.title,
    notes: task.notes ?? null,
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate ?? null,
    accountId: task.accountId ?? null,
    personId: task.personId ?? null,
  };
}

/** Timeline entries for creating, completing and reopening a task. */
async function logStatus(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  task: Doc<"tasks">,
  from: TaskStatus | null,
) {
  const refs = taskRefs(task);
  if (!hasRefs(refs)) return;
  let subject: string | null = null;
  if (from === null) subject = `added the task “${task.title}”`;
  else if (task.status === "done" && from !== "done") {
    subject = `completed the task “${task.title}”`;
    await touchRecords(ctx, refs);
    await emitAutomationTrigger(ctx, { kind: "task_completed", refs });
  } else if (task.status !== "done" && from === "done") {
    subject = `reopened the task “${task.title}”`;
  }
  if (subject) await logSystem(ctx, refs, subject, undefined, ctx.viewer._id);
}

async function toClientList(ctx: QueryCtx, tasks: Doc<"tasks">[]) {
  const members = await memberIndex(ctx);
  const accounts = new Map<Id<"accounts">, Doc<"accounts"> | null>();
  const people = new Map<Id<"people">, Doc<"people"> | null>();
  const deals = new Map<Id<"deals">, Doc<"deals"> | null>();
  const leads = new Map<Id<"leads">, Doc<"leads"> | null>();
  for (const task of tasks) {
    if (task.dealId && !deals.has(task.dealId)) {
      deals.set(task.dealId, await ctx.db.get(task.dealId));
    }
    if (task.leadId && !leads.has(task.leadId)) {
      leads.set(task.leadId, await ctx.db.get(task.leadId));
    }
    if (task.accountId && !accounts.has(task.accountId)) {
      accounts.set(task.accountId, await ctx.db.get(task.accountId));
    }
    if (task.personId && !people.has(task.personId)) {
      people.set(task.personId, await ctx.db.get(task.personId));
    }
  }
  return tasks.map((task) => {
    const account = task.accountId ? accounts.get(task.accountId) : null;
    const person = task.personId ? people.get(task.personId) : null;
    const deal = task.dealId ? deals.get(task.dealId) : null;
    const lead = task.leadId ? leads.get(task.leadId) : null;
    return {
      _id: task._id,
      _creationTime: task._creationTime,
      title: task.title,
      notes: task.notes ?? null,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ?? null,
      position: task.position,
      assigneeId: task.assigneeId,
      assignee: memberRef(members, task.assigneeId),
      account: account
        ? {
            _id: account._id,
            name: account.name,
            domain: account.domain ?? null,
            logoUrl: account.logoUrl ?? null,
          }
        : null,
      person: person ? { _id: person._id, name: personName(person) } : null,
      deal: deal ? { _id: deal._id, title: deal.title } : null,
      lead: lead ? { _id: lead._id, name: lead.name } : null,
      automated: Boolean(task.automationKey),
      completedAt: task.completedAt ?? null,
      updatedAt: task.updatedAt,
    };
  });
}

/**
 * Tasks ordered by board position: open tasks plus done ones from the last
 * two weeks unless `done` says otherwise, so the board stays the team's
 * working set. Priority, overdue and title search narrow it on the server.
 */
export const list = memberQuery({
  args: {
    assigneeId: v.optional(v.id("members")),
    status: v.optional(vTaskStatus),
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
    dealId: v.optional(v.id("deals")),
    leadId: v.optional(v.id("leads")),
    done: v.optional(literals(["none", "recent", "all"])),
    priority: v.optional(vPriority),
    /** Only open tasks due before this day. */
    overdueBefore: v.optional(vDay),
    search: vSearch,
  },
  handler: async (ctx, args) => {
    const done = args.done ?? "recent";
    const since = Date.now() - RECENT_DONE_MS;
    const statuses = (args.status ? [args.status] : TASK_STATUSES).filter(
      (status) => status !== "done" || done !== "none",
    );
    let tasks: Doc<"tasks">[] = [];
    const text = searchText(args.search);
    const assignee = args.assigneeId;
    if (text) {
      tasks = await ctx.db
        .query("tasks")
        .withSearchIndex("search_title", (q) =>
          assignee
            ? q.search("title", text).eq("assigneeId", assignee)
            : q.search("title", text),
        )
        .take(SEARCH_LIMIT);
    } else if (args.accountId) {
      const id = args.accountId;
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_account", (q) => q.eq("accountId", id))
        .take(COLUMN_LIMIT);
    } else if (args.personId) {
      const id = args.personId;
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_person", (q) => q.eq("personId", id))
        .take(COLUMN_LIMIT);
    } else if (args.dealId) {
      const id = args.dealId;
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_deal", (q) => q.eq("dealId", id))
        .take(COLUMN_LIMIT);
    } else if (args.leadId) {
      const id = args.leadId;
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_lead", (q) => q.eq("leadId", id))
        .take(COLUMN_LIMIT);
    } else {
      const assigneeId = args.assigneeId;
      for (const status of statuses) {
        const recentOnly = status === "done" && done === "recent";
        const column = assigneeId
          ? ctx.db
              .query("tasks")
              .withIndex("by_assignee_status_completed", (q) => {
                const scoped = q
                  .eq("assigneeId", assigneeId)
                  .eq("status", status);
                return recentOnly ? scoped.gte("completedAt", since) : scoped;
              })
          : recentOnly
            ? ctx.db
                .query("tasks")
                .withIndex("by_status_completed", (q) =>
                  q.eq("status", "done").gte("completedAt", since),
                )
            : ctx.db
                .query("tasks")
                .withIndex("by_status_position", (q) => q.eq("status", status));
        tasks.push(
          ...(await (status === "done" ? column.order("desc") : column).take(
            COLUMN_LIMIT,
          )),
        );
      }
    }
    const visible = tasks
      .filter(
        (task) =>
          statuses.includes(task.status) &&
          (!args.assigneeId || task.assigneeId === args.assigneeId) &&
          (!args.accountId || task.accountId === args.accountId) &&
          (!args.personId || task.personId === args.personId) &&
          (!args.dealId || task.dealId === args.dealId) &&
          (!args.leadId || task.leadId === args.leadId) &&
          (task.status !== "done" ||
            done === "all" ||
            (task.completedAt ?? task.updatedAt) >= since) &&
          (!args.priority || task.priority === args.priority) &&
          (!args.overdueBefore ||
            (task.status !== "done" &&
              task.dueDate !== undefined &&
              task.dueDate < args.overdueBefore)),
      )
      .sort((a, b) => a.position - b.position);
    return await toClientList(ctx, visible);
  },
});

export const get = memberQuery({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task) return null;
    const [row] = await toClientList(ctx, [task]);
    return row;
  },
});

export const create = memberMutation({
  args: {
    title: v.string(),
    notes: v.optional(v.string()),
    status: v.optional(vTaskStatus),
    priority: v.optional(vPriority),
    assigneeId: v.optional(v.id("members")),
    dueDate: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
    dealId: v.optional(v.id("deals")),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    const fields = await clean(ctx, {
      title: args.title,
      notes: args.notes,
      dueDate: args.dueDate,
      accountId: args.accountId,
      personId: args.personId,
      assigneeId: args.assigneeId ?? ctx.viewer._id,
    });
    let accountId = fields.accountId;
    if (args.dealId) {
      const deal = await ctx.db.get(args.dealId);
      if (!deal) notFound("Deal");
      accountId ??= deal.accountId;
    }
    if (args.leadId && !(await ctx.db.get(args.leadId))) notFound("Lead");
    const status = args.status ?? "todo";
    const now = Date.now();
    const id = await ctx.db.insert("tasks", {
      title: fields.title!,
      notes: fields.notes,
      status,
      priority: args.priority ?? "normal",
      assigneeId: fields.assigneeId!,
      dueDate: fields.dueDate,
      accountId,
      personId: fields.personId,
      dealId: args.dealId,
      leadId: args.leadId,
      position: await endPosition(ctx, status),
      completedAt: taskCompletedAt(null, status, undefined, now),
      updatedAt: now,
    });
    await logStatus(ctx, (await ctx.db.get(id))!, null);
    return id;
  },
});

/** Returns the previous values so the client can offer undo. */
export const update = memberMutation({
  args: { id: v.id("tasks"), patch: v.object(editable) },
  handler: async (ctx, { id, patch }) => {
    const task = await ctx.db.get(id);
    if (!task) notFound("Task");
    const before = snapshot(task);
    const now = Date.now();
    if (
      patch.assigneeId !== undefined &&
      patch.assigneeId !== task.assigneeId
    ) {
      checkReassign(ctx.viewer, task, now);
    }
    const fields = await clean(ctx, patch, task);
    if (fields.status && fields.status !== task.status) {
      Object.assign(fields, await statusEffects(ctx, task, fields.status, now));
    }
    if (fields.assigneeId && fields.assigneeId !== task.assigneeId) {
      fields.reassignedById = ctx.viewer._id;
      fields.reassignedAt = now;
    }
    await ctx.db.patch(id, { ...fields, updatedAt: now });
    await logStatus(ctx, { ...task, ...fields }, task.status);
    return before;
  },
});

const MAX_BULK = 200;

const vBulkPatch = v.object({
  status: v.optional(vTaskStatus),
  assigneeId: v.optional(v.id("members")),
  dueDate: v.optional(v.union(v.string(), v.null())),
});

/**
 * Applies a patch per task in one transaction, for bulk actions. Returns each
 * task's previous values for the patched fields, ready to pass back as undo.
 */
export const updateMany = memberMutation({
  args: {
    updates: v.array(v.object({ id: v.id("tasks"), patch: vBulkPatch })),
  },
  handler: async (ctx, { updates }) => {
    if (updates.length > MAX_BULK) {
      invalid("updates", `Select at most ${MAX_BULK} tasks`);
    }
    const previous = [];
    for (const { id, patch } of updates) {
      const task = await ctx.db.get(id);
      if (!task) continue;
      const before = snapshot(task);
      const now = Date.now();
      if (
        patch.assigneeId !== undefined &&
        patch.assigneeId !== task.assigneeId
      ) {
        checkReassign(ctx.viewer, task, now);
      }
      const fields = await clean(ctx, patch, task);
      if (fields.status && fields.status !== task.status) {
        Object.assign(
          fields,
          await statusEffects(ctx, task, fields.status, now),
        );
      }
      if (fields.assigneeId && fields.assigneeId !== task.assigneeId) {
        fields.reassignedById = ctx.viewer._id;
        fields.reassignedAt = now;
      }
      await ctx.db.patch(id, { ...fields, updatedAt: now });
      await logStatus(ctx, { ...task, ...fields }, task.status);
      previous.push({
        id,
        patch: {
          ...(patch.status !== undefined && { status: before.status }),
          ...(patch.assigneeId !== undefined && {
            assigneeId: before.assigneeId,
          }),
          ...(patch.dueDate !== undefined && { dueDate: before.dueDate }),
        },
      });
    }
    return previous;
  },
});

/** Moves a task to a column, right before `beforeId` or at the end. */
export const move = memberMutation({
  args: {
    id: v.id("tasks"),
    status: vTaskStatus,
    beforeId: v.union(v.id("tasks"), v.null()),
  },
  handler: async (ctx, { id, status, beforeId }) => {
    const task = await ctx.db.get(id);
    if (!task) notFound("Task");
    const previous = { status: task.status, position: task.position };
    const position = await positionBefore(ctx, status, id, beforeId);
    const now = Date.now();
    const completedAt = taskCompletedAt(
      task.status,
      status,
      task.completedAt,
      now,
    );
    await ctx.db.patch(id, { status, position, completedAt, updatedAt: now });
    await logStatus(ctx, { ...task, status }, task.status);
    return previous;
  },
});

/** Puts a moved task back where it was; the undo for `move`. */
export const place = memberMutation({
  args: { id: v.id("tasks"), status: vTaskStatus, position: v.number() },
  handler: async (ctx, { id, status, position }) => {
    const task = await ctx.db.get(id);
    if (!task) notFound("Task");
    if (!Number.isFinite(position)) invalid("position", "Invalid position");
    const now = Date.now();
    await ctx.db.patch(id, {
      status,
      position,
      completedAt: taskCompletedAt(task.status, status, task.completedAt, now),
      updatedAt: now,
    });
    await logStatus(ctx, { ...task, status }, task.status);
  },
});

const vStored = schema.tables.tasks.validator;

/** Deletes the task and returns it, so the client can offer undo via `restore`. */
export const remove = memberMutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task) notFound("Task");
    assertCan(ctx.viewer, "task.delete", [task.assigneeId]);
    await ctx.db.delete(id);
    const refs = taskRefs(task);
    if (hasRefs(refs)) {
      await logSystem(
        ctx,
        refs,
        `deleted the task “${task.title}”`,
        undefined,
        ctx.viewer._id,
      );
    }
    const { _id, _creationTime, ...stored } = task;
    void _id;
    void _creationTime;
    return stored;
  },
});

export const restore = memberMutation({
  args: { task: vStored },
  handler: async (ctx, { task }) => {
    const exists = async (id: Id<"accounts" | "people" | "deals" | "leads">) =>
      (await ctx.db.get(id)) !== null;
    const assignee = await ctx.db.get(task.assigneeId);
    if (!Number.isFinite(task.position))
      invalid("position", "Invalid position");
    const id = await ctx.db.insert("tasks", {
      ...task,
      completedAt: taskCompletedAt(
        task.status,
        task.status,
        task.completedAt,
        Date.now(),
      ),
      assigneeId:
        assignee?.status === "active" ? task.assigneeId : ctx.viewer._id,
      accountId:
        task.accountId && (await exists(task.accountId))
          ? task.accountId
          : undefined,
      personId:
        task.personId && (await exists(task.personId))
          ? task.personId
          : undefined,
      dealId:
        task.dealId && (await exists(task.dealId)) ? task.dealId : undefined,
      leadId:
        task.leadId && (await exists(task.leadId)) ? task.leadId : undefined,
      updatedAt: Date.now(),
    });
    const restored = (await ctx.db.get(id))!;
    const refs = taskRefs(restored);
    if (hasRefs(refs)) {
      await logSystem(
        ctx,
        refs,
        `restored the task “${restored.title}”`,
        undefined,
        ctx.viewer._id,
      );
    }
    return id;
  },
});
