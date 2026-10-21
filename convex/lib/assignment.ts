import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { roundRobinMemberIds } from "./settings";

export const LEAD_ROTATION_KEY = "leads.roundRobin";

async function readSetting(ctx: MutationCtx, key: string) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/**
 * Next active member in a round-robin rotation, ordered by join date. The
 * pointer lives in `settings` under `key`, so separate rotations can coexist.
 * The lead rotation is limited to the participants picked in workspace
 * settings, falling back to the whole team when none of them is active.
 */
export async function nextOwner(
  ctx: MutationCtx,
  key: string = LEAD_ROTATION_KEY,
): Promise<Id<"members"> | null> {
  const active = (
    await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect()
  ).sort((a, b) => a.joinedAt - b.joinedAt);
  const chosen = new Set(
    key === LEAD_ROTATION_KEY ? await roundRobinMemberIds(ctx) : [],
  );
  const limited =
    chosen.size > 0
      ? active.filter((member) => chosen.has(member._id))
      : active;
  const rotation = limited.length > 0 ? limited : active;
  if (rotation.length === 0) return null;

  const pointer = await readSetting(ctx, key);
  // The pointer may name someone outside the rotation; continue after them in join order.
  const last = active.findIndex((member) => member._id === pointer?.value);
  const next =
    rotation.find((member) => active.indexOf(member) > last) ?? rotation[0];
  if (pointer) await ctx.db.patch(pointer._id, { value: next._id });
  else await ctx.db.insert("settings", { key, value: next._id });
  return next._id;
}
