import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { dealFields } from "./schema";
import { requireViewer } from "./auth";
import { checkOneOf, checkTitle, dayFromNow, lastRank } from "./workShared";
import { DEAL_STAGES } from "../lib/work";

const dealPatch = v.object({
  title: v.optional(v.string()),
  companySlug: v.optional(v.string()),
  stage: v.optional(v.string()),
  value: v.optional(v.number()),
  owner: v.optional(v.string()),
  closeDate: v.optional(v.union(v.string(), v.null())),
});

function checkDeal(patch: { title?: string; stage?: string; value?: number }) {
  checkTitle(patch.title);
  checkOneOf(patch.stage, DEAL_STAGES);
  if (
    patch.value !== undefined &&
    (patch.value < 0 || !isFinite(patch.value))
  ) {
    throw new ConvexError("Value must be a positive number");
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

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const docs = await ctx.db.query("deals").collect();
    return docs.map(dealToClient).sort((a, b) => a.rank - b.rank);
  },
});

export const create = mutation({
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

export const update = mutation({
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

export const move = mutation({
  args: { id: v.id("deals"), stage: v.string(), rank: v.number() },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    checkDeal({ stage: args.stage });
    if (!(await ctx.db.get(args.id))) throw new ConvexError("Deal not found");
    await ctx.db.patch(args.id, { stage: args.stage, rank: args.rank });
  },
});

export const remove = mutation({
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

export const restore = mutation({
  args: { deal: v.object(dealFields) },
  handler: async (ctx, args) => {
    await requireViewer(ctx);
    return await ctx.db.insert("deals", args.deal);
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

function stageFor(winProbability: number, index: number) {
  if (winProbability >= 80) return index === 0 ? "negotiation" : "won";
  if (winProbability >= 60) return index === 0 ? "proposal" : "negotiation";
  if (winProbability >= 40) return index === 0 ? "evaluation" : "proposal";
  if (winProbability >= 25) return "discovery";
  return index === 0 ? "discovery" : "lost";
}

/** Seeds example deals from the existing companies, once per deployment. */
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const done = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "deals-bootstrapped"))
      .unique();
    if (done) return false;
    await ctx.db.insert("meta", { key: "deals-bootstrapped" });
    if (await ctx.db.query("deals").first()) return false;

    const companies = await ctx.db.query("companies").collect();
    const createdAt = new Date().toISOString();
    const ranks: Record<string, number> = {};
    for (const [i, company] of companies.entries()) {
      const count = company.openDeals > 4 ? 2 : 1;
      for (let index = 0; index < count; index++) {
        const stage = stageFor(company.winProbability, index);
        ranks[stage] = (ranks[stage] ?? 0) + 1;
        await ctx.db.insert("deals", {
          title: DEAL_NAMES[(i + index) % DEAL_NAMES.length],
          companySlug: company.slug,
          stage,
          value: Math.round(company.pipelineValue / count / 1000) * 1000,
          owner: company.owner,
          closeDate: dayFromNow(10 + ((i * 7 + index * 11) % 60)),
          rank: ranks[stage],
          createdAt,
        });
      }
    }
    return true;
  },
});
