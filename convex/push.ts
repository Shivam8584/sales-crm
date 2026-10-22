import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, memberMutation, memberQuery } from "./lib/functions";
import { internalQuery, type MutationCtx } from "./_generated/server";

export type PushPayload = { title: string; body: string; href: string };

/** Queues a browser push for one member; delivery runs after the calling mutation commits. */
export async function schedulePush(
  ctx: MutationCtx,
  memberId: Id<"members">,
  payload: PushPayload,
) {
  await ctx.scheduler.runAfter(0, internal.pushSend.sendToMember, {
    memberId,
    ...payload,
  });
}

export const forMember = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) =>
    await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .take(20),
});

export const drop = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** The public VAPID key the browser needs to subscribe; null while push is not configured. */
export const config = memberQuery({
  args: {},
  handler: async () => ({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null }),
});

export const subscribe = memberMutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, { endpoint, p256dh, auth }) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        memberId: ctx.viewer._id,
        p256dh,
        auth,
      });
      return;
    }
    await ctx.db.insert("pushSubscriptions", {
      memberId: ctx.viewer._id,
      endpoint,
      p256dh,
      auth,
    });
  },
});

export const unsubscribe = memberMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (existing && existing.memberId === ctx.viewer._id)
      await ctx.db.delete(existing._id);
  },
});
