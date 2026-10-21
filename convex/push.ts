import { v } from "convex/values";
import { memberMutation, memberQuery } from "./lib/functions";

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
