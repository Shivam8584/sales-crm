import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { DEFAULTS, LIMITS } from "../../../lib/domain/agents";
import { istToday } from "../../../lib/domain/day";
import { usedToday } from "../../../lib/domain/research";
import { read, write } from "../research/config";

export const KEYS = {
  enabled: "agents.enabled",
  dailyCap: "agents.dailyCap",
  usage: "agents.usage",
} as const;

export function parseCap(raw: string | null) {
  const value = Number(raw);
  const { min, max } = LIMITS.globalDailyRuns;
  return raw !== null && Number.isInteger(value) && value >= min && value <= max
    ? value
    : DEFAULTS.globalDailyRuns;
}

/** Agents run unless an admin has switched them all off. */
export async function agentsConfig(ctx: QueryCtx) {
  const [enabled, cap, usage] = await Promise.all([
    read(ctx, KEYS.enabled),
    read(ctx, KEYS.dailyCap),
    read(ctx, KEYS.usage),
  ]);
  return {
    enabled: enabled !== "0",
    dailyCap: parseCap(cap),
    usedToday: usedToday(usage, istToday()),
  };
}

export async function countRun(ctx: MutationCtx, used: number) {
  await write(ctx, KEYS.usage, `${istToday()}:${used + 1}`);
}

export { write };
