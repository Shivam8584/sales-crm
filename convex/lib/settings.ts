import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { DEFAULT_LEAD_SLA_SECONDS } from "../../lib/domain/leads";

export const SETTING_KEYS = {
  leadSlaMinutes: "leads.slaMinutes",
  roundRobinMemberIds: "leads.roundRobinMemberIds",
} as const;

export const LEAD_SLA_MINUTES = { min: 1, max: 120 } as const;

async function readRaw(ctx: QueryCtx, key: string) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.value ?? null;
}

function envSlaSeconds() {
  const value = Number(process.env.LEAD_SLA_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LEAD_SLA_SECONDS;
}

/** What the SLA falls back to when no admin has set one: LEAD_SLA_SECONDS, else 5 minutes. */
export function defaultLeadSlaMinutes() {
  return Math.min(
    LEAD_SLA_MINUTES.max,
    Math.max(LEAD_SLA_MINUTES.min, Math.round(envSlaSeconds() / 60)),
  );
}

export function parseSlaMinutes(raw: string | null) {
  const value = Number(raw);
  return raw !== null &&
    Number.isInteger(value) &&
    value >= LEAD_SLA_MINUTES.min &&
    value <= LEAD_SLA_MINUTES.max
    ? value
    : null;
}

export function parseMemberIds(raw: string | null): Id<"members">[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) &&
      value.every((item) => typeof item === "string")
      ? (value as Id<"members">[])
      : null;
  } catch {
    return null;
  }
}

/** The stored SLA in minutes, or null when the env/default applies. */
export async function storedLeadSlaMinutes(ctx: QueryCtx) {
  return parseSlaMinutes(await readRaw(ctx, SETTING_KEYS.leadSlaMinutes));
}

/** Speed-to-lead window: the workspace setting, then LEAD_SLA_SECONDS, then 5 minutes. */
export async function leadSlaSeconds(ctx: QueryCtx) {
  const minutes = await storedLeadSlaMinutes(ctx);
  return minutes !== null ? minutes * 60 : envSlaSeconds();
}

/** Members chosen for the lead rotation; empty means every active member. */
export async function roundRobinMemberIds(ctx: QueryCtx) {
  return (
    parseMemberIds(await readRaw(ctx, SETTING_KEYS.roundRobinMemberIds)) ?? []
  );
}
