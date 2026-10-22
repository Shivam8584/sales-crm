import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { istToday } from "../../../lib/domain/day";
import { parseLimit, usedToday } from "../../../lib/domain/research";

export const KEYS = {
  enabled: "research.enabled",
  dailyCap: "research.dailyCap",
  staleDays: "research.staleDays",
  usage: "research.usage",
  accountCursor: "research.cursor.accounts",
  personCursor: "research.cursor.people",
} as const;

export async function read(ctx: QueryCtx, key: string) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.value ?? null;
}

export async function write(ctx: MutationCtx, key: string, value: string) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) await ctx.db.insert("settings", { key, value });
  else if (row.value !== value) await ctx.db.patch(row._id, { value });
}

/** The agent is off until an admin turns it on. */
export async function researchConfig(ctx: QueryCtx) {
  const [enabled, cap, stale, usage] = await Promise.all([
    read(ctx, KEYS.enabled),
    read(ctx, KEYS.dailyCap),
    read(ctx, KEYS.staleDays),
    read(ctx, KEYS.usage),
  ]);
  return {
    enabled: enabled === "1",
    dailyCap: parseLimit(cap, "dailyCap"),
    staleDays: parseLimit(stale, "staleDays"),
    usedToday: usedToday(usage, istToday()),
  };
}
