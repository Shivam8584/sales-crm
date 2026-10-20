import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { taskFields } from "./schema";
import { requireViewer } from "./auth";
import { checkOneOf, checkTitle, dayFromNow, lastRank } from "./workShared";
import { PRIORITIES, TASK_STATUSES } from "../lib/work";

const MAX_DESCRIPTION = 5_000;

const taskPatch = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(v.string()),
  priority: v.optional(v.string()),
  assignee: v.optional(v.string()),
  companySlug: v.optional(v.union(v.string(), v.null())),
  dueDate: v.optional(v.union(v.string(), v.null())),
});

function checkTask(patch: {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
}) {
  checkTitle(patch.title);
  checkOneOf(patch.status, TASK_STATUSES);
  checkOneOf(patch.priority, PRIORITIES);
  if ((patch.description?.length ?? 0) > MAX_DESCRIPTION) {
    throw new ConvexError("Description is too long");
  }
}

function taskToClient(doc: Doc<"tasks">) {
  return {
    id: doc._id as string,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    priority: doc.priority,
    assignee: doc.assignee,
    companyId: doc.companySlug,
    dueDate: doc.dueDate,
    rank: doc.rank,
    createdAt: doc.createdAt,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const docs = await ctx.db.query("tasks").collect();
    return docs.map(taskToClient).sort((a, b) => a.rank - b.rank);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    status: v.string(),
    priority: v.string(),
    assignee: v.string(),
    companySlug: v.union(v.string(), v.null()),
    dueDate: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    checkTask(args);
    return await ctx.db.insert("tasks", {
      ...args,
      title: args.title.trim(),
      description: args.description.trim(),
      rank: await lastRank(ctx, "tasks", args.status),
      createdAt: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: { id: v.id("tasks"), patch: taskPatch },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    checkTask(args.patch);
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new ConvexError("Task not found");
    const patch = { ...args.patch };
    if (patch.title !== undefined) patch.title = patch.title.trim();
    if (patch.status !== undefined && patch.status !== doc.status) {
      Object.assign(patch, {
        rank: await lastRank(ctx, "tasks", patch.status),
      });
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const move = mutation({
  args: { id: v.id("tasks"), status: v.string(), rank: v.number() },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    checkTask({ status: args.status });
    if (!(await ctx.db.get(args.id))) throw new ConvexError("Task not found");
    await ctx.db.patch(args.id, { status: args.status, rank: args.rank });
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    await ctx.db.delete(args.id);
    const { _id, _creationTime, ...fields } = doc;
    void _id;
    void _creationTime;
    return fields;
  },
});

export const restore = mutation({
  args: { task: v.object(taskFields) },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    return await ctx.db.insert("tasks", args.task);
  },
});

const TASK_TEMPLATES: {
  title: string;
  status: string;
  priority: string;
  dueInDays: number;
}[] = [
  {
    title: "Send pricing proposal",
    status: "todo",
    priority: "urgent",
    dueInDays: 1,
  },
  {
    title: "Book security review",
    status: "todo",
    priority: "normal",
    dueInDays: 4,
  },
  {
    title: "Prepare QBR deck",
    status: "in-progress",
    priority: "normal",
    dueInDays: 2,
  },
  {
    title: "Follow up on legal redlines",
    status: "in-progress",
    priority: "urgent",
    dueInDays: -1,
  },
  {
    title: "Intro call with new champion",
    status: "todo",
    priority: "low",
    dueInDays: 7,
  },
  {
    title: "Share onboarding plan",
    status: "done",
    priority: "normal",
    dueInDays: -3,
  },
  {
    title: "Confirm budget owner",
    status: "todo",
    priority: "normal",
    dueInDays: 3,
  },
  {
    title: "Update mutual action plan",
    status: "done",
    priority: "low",
    dueInDays: -5,
  },
];

/** Seeds example tasks across the existing companies, once per deployment. */
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const done = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "tasks-bootstrapped"))
      .unique();
    if (done) return false;
    await ctx.db.insert("meta", { key: "tasks-bootstrapped" });
    if (await ctx.db.query("tasks").first()) return false;

    const companies = await ctx.db.query("companies").collect();
    const createdAt = new Date().toISOString();
    const ranks: Record<string, number> = {};
    for (const [i, template] of TASK_TEMPLATES.entries()) {
      const company = companies[(i * 3) % Math.max(1, companies.length)];
      ranks[template.status] = (ranks[template.status] ?? 0) + 1;
      await ctx.db.insert("tasks", {
        title: template.title,
        description: "",
        status: template.status,
        priority: template.priority,
        assignee: company?.owner ?? "Sarah Nguyen",
        companySlug: company?.slug ?? null,
        dueDate: dayFromNow(template.dueInDays),
        rank: ranks[template.status],
        createdAt,
      });
    }
    return true;
  },
});
