import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { memberMutation, memberQuery } from "./lib/functions";
import { notFound } from "./lib/errors";
import { memberIndex } from "./lib/records";
import { recordKey } from "../lib/domain/notifications";

const vFollowable = v.union(
  v.object({ accountId: v.id("accounts") }),
  v.object({ dealId: v.id("deals") }),
  v.object({ leadId: v.id("leads") }),
);

async function keyOf(ctx: QueryCtx, target: typeof vFollowable.type) {
  if ("accountId" in target) {
    if (!(await ctx.db.get(target.accountId))) notFound("Account");
    return recordKey("accounts", target.accountId);
  }
  if ("dealId" in target) {
    if (!(await ctx.db.get(target.dealId))) notFound("Deal");
    return recordKey("deals", target.dealId);
  }
  if (!(await ctx.db.get(target.leadId))) notFound("Lead");
  return recordKey("leads", target.leadId);
}

/** Whether the signed-in member follows a record, and who else does. */
export const forRecord = memberQuery({
  args: { target: vFollowable },
  handler: async (ctx, { target }) => {
    const record = await keyOf(ctx, target);
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_record", (q) => q.eq("record", record))
      .collect();
    const members = await memberIndex(ctx);
    return {
      following: follows.some((follow) => follow.memberId === ctx.viewer._id),
      followers: follows
        .map((follow) => members.get(follow.memberId))
        .filter((member) => member && member.status === "active")
        .map((member) => ({ _id: member!._id, name: member!.name })),
    };
  },
});

/** Returns whether the member was following before, for undo. */
export const setFollowing = memberMutation({
  args: { target: vFollowable, following: v.boolean() },
  handler: async (ctx, { target, following }) => {
    const record = await keyOf(ctx, target);
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_member_record", (q) =>
        q.eq("memberId", ctx.viewer._id).eq("record", record),
      )
      .unique();
    if (following && !existing) {
      await ctx.db.insert("follows", { memberId: ctx.viewer._id, record });
    }
    if (!following && existing) await ctx.db.delete(existing._id);
    return { wasFollowing: Boolean(existing) };
  },
});
