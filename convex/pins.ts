import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { memberMutation, memberQuery } from "./lib/functions";
import { fail, notFound } from "./lib/errors";
import { personName } from "../lib/domain/labels";
import { recordKey } from "../lib/domain/notifications";

const MAX_PINS = 12;

const vPinnable = v.union(
  v.object({ accountId: v.id("accounts") }),
  v.object({ personId: v.id("people") }),
  v.object({ dealId: v.id("deals") }),
  v.object({ leadId: v.id("leads") }),
);

async function keyOf(ctx: QueryCtx, target: typeof vPinnable.type) {
  if ("accountId" in target) {
    if (!(await ctx.db.get(target.accountId))) notFound("Account");
    return recordKey("accounts", target.accountId);
  }
  if ("personId" in target) {
    if (!(await ctx.db.get(target.personId))) notFound("Person");
    return recordKey("people", target.personId);
  }
  if ("dealId" in target) {
    if (!(await ctx.db.get(target.dealId))) notFound("Deal");
    return recordKey("deals", target.dealId);
  }
  if (!(await ctx.db.get(target.leadId))) notFound("Lead");
  return recordKey("leads", target.leadId);
}

/** The signed-in member's pinned records, oldest pin first, with their current names. */
export const mine = memberQuery({
  args: {},
  handler: async (ctx) => {
    const pins = await ctx.db
      .query("pins")
      .withIndex("by_member", (q) => q.eq("memberId", ctx.viewer._id))
      .collect();
    const resolved = await Promise.all(
      pins.map(async ({ _id, record }) => {
        const [table, id] = record.split(":");
        const doc = await ctx.db.get(id as never);
        if (!doc) return null;
        const row = doc as Record<string, unknown>;
        const title =
          table === "people"
            ? personName(row as { firstName: string; lastName: string })
            : String(row.name ?? row.title);
        return { _id, record, title, href: `/${table}/${id}` };
      }),
    );
    return resolved.filter((pin) => pin !== null);
  },
});

/** Returns whether the record is now pinned. */
export const toggle = memberMutation({
  args: { target: vPinnable },
  handler: async (ctx, { target }) => {
    const record = await keyOf(ctx, target);
    const existing = await ctx.db
      .query("pins")
      .withIndex("by_member_record", (q) =>
        q.eq("memberId", ctx.viewer._id).eq("record", record),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    const count = (
      await ctx.db
        .query("pins")
        .withIndex("by_member", (q) => q.eq("memberId", ctx.viewer._id))
        .take(MAX_PINS)
    ).length;
    if (count >= MAX_PINS) fail("conflict", `You can pin ${MAX_PINS} records`);
    await ctx.db.insert("pins", { memberId: ctx.viewer._id, record });
    return true;
  },
});
