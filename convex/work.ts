import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { dealFields, taskFields } from "./schema";
import { requireViewer } from "./auth";
import { DEAL_STAGES, PRIORITIES, TASK_STATUSES } from "../lib/work";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5_000;

const dealPatch = v.object({
  title: v.optional(v.string()),
  companySlug: v.optional(v.string()),
  stage: v.optional(v.string()),
  value: v.optional(v.number()),
  owner: v.optional(v.string()),
  closeDate: v.optional(v.union(v.string(), v.null())),
});

const taskPatch = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(v.string()),
  priority: v.optional(v.string()),
  assignee: v.optional(v.string()),
  companySlug: v.optional(v.union(v.string(), v.null())),
  dueDate: v.optional(v.union(v.string(), v.null())),
});

function checkTitle(title: string | undefined) {
  if (title === undefined) return;
  const trimmed = title.trim();
  if (!trimmed) throw new ConvexError("Title is required");
  if (trimmed.length > MAX_TITLE) throw new ConvexError("Title is too long");
}

function checkOneOf(value: string | undefined, allowed: { id: string }[]) {
  if (value !== undefined && !allowed.some((item) => item.id === value)) {
    throw new ConvexError(`Unknown value: ${value}`);
  }
}

function checkDeal(patch: { title?: string; stage?: string; value?: number }) {
  checkTitle(patch.title);
  checkOneOf(patch.stage, [...DEAL_STAGES]);
  if (
    patch.value !== undefined &&
    (patch.value < 0 || !isFinite(patch.value))
  ) {
    throw new ConvexError("Value must be a positive number");
  }
}

function checkTask(patch: {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
}) {
  checkTitle(patch.title);
  checkOneOf(patch.status, [...TASK_STATUSES]);
  checkOneOf(patch.priority, [...PRIORITIES]);
  if ((patch.description?.length ?? 0) > MAX_DESCRIPTION) {
    throw new ConvexError("Description is too long");
  }
}

function dealToClient(doc: Doc<"deals">) {
  return {
    id: doc._id as string,
    title: doc.title,
    companyId: doc.companySlug,
    stage: doc.stage,
    value: doc.value,
    owner: doc.owner,
    closeDate: doc.closeDate,
    rank: doc.rank,
    createdAt: doc.createdAt,
  };
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

async function lastRank(
  ctx: MutationCtx,
  table: "deals" | "tasks",
  column: string,
) {
  const docs =
    table === "deals"
      ? (await ctx.db.query("deals").collect()).filter(
          (doc) => doc.stage === column,
        )
      : (await ctx.db.query("tasks").collect()).filter(
          (doc) => doc.status === column,
        );
  return docs.reduce((max, doc) => Math.max(max, doc.rank), 0) + 1;
}

export const deals = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const docs = await ctx.db.query("deals").collect();
    return docs.map(dealToClient).sort((a, b) => a.rank - b.rank);
  },
});

export const tasks = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const docs = await ctx.db.query("tasks").collect();
    return docs.map(taskToClient).sort((a, b) => a.rank - b.rank);
  },
});

export const createDeal = mutation({
  args: {
    title: v.string(),
    companySlug: v.string(),
    stage: v.string(),
    value: v.number(),
    owner: v.string(),
    closeDate: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    checkDeal(args);
    return await ctx.db.insert("deals", {
      ...args,
      title: args.title.trim(),
      rank: await lastRank(ctx, "deals", args.stage),
      createdAt: new Date().toISOString(),
    });
  },
});

export const updateDeal = mutation({
  args: { id: v.id("deals"), patch: dealPatch },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    checkDeal(args.patch);
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new ConvexError("Deal not found");
    const patch = { ...args.patch };
    if (patch.title !== undefined) patch.title = patch.title.trim();
    if (patch.stage !== undefined && patch.stage !== doc.stage) {
      Object.assign(patch, { rank: await lastRank(ctx, "deals", patch.stage) });
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const moveDeal = mutation({
  args: { id: v.id("deals"), stage: v.string(), rank: v.number() },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    checkDeal({ stage: args.stage });
    if (!(await ctx.db.get(args.id))) throw new ConvexError("Deal not found");
    await ctx.db.patch(args.id, { stage: args.stage, rank: args.rank });
  },
});

export const removeDeal = mutation({
  args: { id: v.id("deals") },
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

export const restoreDeal = mutation({
  args: { deal: v.object(dealFields) },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    return await ctx.db.insert("deals", args.deal);
  },
});

export const createTask = mutation({
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

export const updateTask = mutation({
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

export const moveTask = mutation({
  args: { id: v.id("tasks"), status: v.string(), rank: v.number() },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    checkTask({ status: args.status });
    if (!(await ctx.db.get(args.id))) throw new ConvexError("Task not found");
    await ctx.db.patch(args.id, { status: args.status, rank: args.rank });
  },
});

export const removeTask = mutation({
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

export const restoreTask = mutation({
  args: { task: v.object(taskFields) },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    return await ctx.db.insert("tasks", args.task);
  },
});

const DEAL_NAMES = [
  "Platform expansion",
  "Security add-on",
  "Annual renewal",
  "Pilot rollout",
  "Analytics upgrade",
  "Team seats",
];

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

function dayFromNow(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function stageFor(winProbability: number, index: number) {
  if (winProbability >= 80) return index === 0 ? "negotiation" : "won";
  if (winProbability >= 60) return index === 0 ? "proposal" : "negotiation";
  if (winProbability >= 40) return index === 0 ? "evaluation" : "proposal";
  if (winProbability >= 25) return "discovery";
  return index === 0 ? "discovery" : "lost";
}

/** Seeds example deals and tasks from the existing companies, once per deployment. */
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const done = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "work-bootstrapped"))
      .unique();
    if (done) return false;
    await ctx.db.insert("meta", { key: "work-bootstrapped" });
    if (
      (await ctx.db.query("deals").first()) ||
      (await ctx.db.query("tasks").first())
    ) {
      return false;
    }

    const companies = await ctx.db.query("companies").collect();
    const createdAt = new Date().toISOString();
    const ranks: Record<string, number> = {};
    const nextRank = (column: string) =>
      (ranks[column] = (ranks[column] ?? 0) + 1);

    for (const [i, company] of companies.entries()) {
      const count = company.openDeals > 4 ? 2 : 1;
      for (let index = 0; index < count; index++) {
        const stage = stageFor(company.winProbability, index);
        await ctx.db.insert("deals", {
          title: DEAL_NAMES[(i + index) % DEAL_NAMES.length],
          companySlug: company.slug,
          stage,
          value: Math.round(company.pipelineValue / count / 1000) * 1000,
          owner: company.owner,
          closeDate: dayFromNow(10 + ((i * 7 + index * 11) % 60)),
          rank: nextRank(stage),
          createdAt,
        });
      }
    }

    const ids: Id<"tasks">[] = [];
    for (const [i, template] of TASK_TEMPLATES.entries()) {
      const company = companies[(i * 3) % Math.max(1, companies.length)];
      ids.push(
        await ctx.db.insert("tasks", {
          title: template.title,
          description: "",
          status: template.status,
          priority: template.priority,
          assignee: company?.owner ?? "Sarah Nguyen",
          companySlug: company?.slug ?? null,
          dueDate: dayFromNow(template.dueInDays),
          rank: nextRank(`task:${template.status}`),
          createdAt,
        }),
      );
    }
    return ids.length > 0;
  },
});
