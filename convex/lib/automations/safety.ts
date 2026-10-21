import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  FREQUENCY_CAP,
  isValidFrequencyCap,
} from "../../../lib/domain/automations";

export const SAFETY_KEYS = {
  killSwitch: "automations.killSwitch",
  frequencyCap: "automations.frequencyCap",
} as const;

export type KillSwitch = { at: number; byId: Id<"members"> };

export type Safety = {
  /** Set while every automation is stopped workspace-wide. */
  killSwitch: KillSwitch | null;
  frequencyCap: number;
  frequencyCapIsDefault: boolean;
};

async function read(ctx: QueryCtx, key: string) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.value ?? null;
}

export async function write(
  ctx: MutationCtx,
  key: string,
  value: string | null,
) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (value === null) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) {
    if (row.value !== value) await ctx.db.patch(row._id, { value });
  } else {
    await ctx.db.insert("settings", { key, value });
  }
  return row?.value ?? null;
}

function parseKill(raw: string | null): KillSwitch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<KillSwitch>;
    return typeof value.at === "number" && typeof value.byId === "string"
      ? { at: value.at, byId: value.byId }
      : null;
  } catch {
    return null;
  }
}

export function parseFrequencyCap(raw: string | null) {
  const value = Number(raw);
  return raw !== null && isValidFrequencyCap(value) ? value : null;
}

export async function readSafety(ctx: QueryCtx): Promise<Safety> {
  const cap = parseFrequencyCap(await read(ctx, SAFETY_KEYS.frequencyCap));
  return {
    killSwitch: parseKill(await read(ctx, SAFETY_KEYS.killSwitch)),
    frequencyCap: cap ?? FREQUENCY_CAP.default,
    frequencyCapIsDefault: cap === null,
  };
}

export async function killSwitchOn(ctx: QueryCtx) {
  return parseKill(await read(ctx, SAFETY_KEYS.killSwitch)) !== null;
}
