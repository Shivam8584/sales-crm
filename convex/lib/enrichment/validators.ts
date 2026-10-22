import { v } from "convex/values";

export const vAttempt = v.object({
  provider: v.string(),
  status: v.union(v.literal("ok"), v.literal("skipped"), v.literal("failed")),
  ms: v.number(),
  note: v.optional(v.string()),
});
