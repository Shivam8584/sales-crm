import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const LEAD_ROTATION_KEY = "leads.roundRobin";

/**
 * Next active member in a round-robin rotation, ordered by join date. The
 * pointer lives in `settings` under `key`, so separate rotations can coexist.
 */
export async function nextOwner(
  ctx: MutationCtx,
  key: string = LEAD_ROTATION_KEY,
): Promise<Id<"members"> | null> {
  const rotation = (
    await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect()
  ).sort((a, b) => a.joinedAt - b.joinedAt);
  if (rotation.length === 0) return null;

  const pointer = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const last = rotation.findIndex((member) => member._id === pointer?.value);
  const next = rotation[(last + 1) % rotation.length];
  if (pointer) await ctx.db.patch(pointer._id, { value: next._id });
  else await ctx.db.insert("settings", { key, value: next._id });
  return next._id;
}
