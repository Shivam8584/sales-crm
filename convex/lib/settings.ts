import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { DEFAULT_LEAD_SLA_SECONDS } from "../../lib/domain/leads";
import {
  DEFAULT_COMPANY_POLICY,
  POLICY_FIELDS,
  isRate,
  policyProblem,
  type CompanyPolicy,
  type PlatformFloor,
  type PolicyField,
  type PricingPolicy,
} from "../../lib/domain/pricing";
import { invalid } from "./errors";

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

export const PRICING_KEYS = {
  marginFloorBps: "pricing.marginFloorBps",
  approvalBps: "pricing.approvalBps",
  defaultMarginBps: "pricing.defaultMarginBps",
  defaultFundBps: "pricing.defaultFundBps",
  defaultFeeBps: "pricing.defaultFeeBps",
  defaultBonusFeeBps: "pricing.defaultBonusFeeBps",
} as const satisfies Record<PolicyField, string>;

export type PricingKey = (typeof PRICING_KEYS)[PolicyField];

export const PRICING_KEY_LIST = POLICY_FIELDS.map(
  (field) => PRICING_KEYS[field],
) as [PricingKey, ...PricingKey[]];

function pricingField(key: PricingKey) {
  return POLICY_FIELDS.find((field) => PRICING_KEYS[field] === key)!;
}

/** The admin-set pricing values; fields left out use DEFAULT_COMPANY_POLICY. */
export async function storedPricingPolicy(ctx: QueryCtx) {
  const stored: Partial<CompanyPolicy> = {};
  for (const field of POLICY_FIELDS) {
    const raw = await readRaw(ctx, PRICING_KEYS[field]);
    const value = Number(raw);
    if (raw !== null && isRate(value)) stored[field] = value;
  }
  return stored;
}

function envRateBps(raw: string | undefined) {
  const value = Number(raw);
  return raw && Number.isFinite(value) && value >= 0 && value <= 1
    ? Math.round(value * 10_000)
    : 0;
}

function envMinor(raw: string | undefined) {
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/** The platform's own floor, from the same env names it uses; 0 when unset, like the platform. */
export function platformFloor(): PlatformFloor {
  return {
    rateBps: envRateBps(process.env.PLATFORM_MIN_MARGIN_RATE),
    minimum: envMinor(process.env.PLATFORM_MIN_MARGIN_ABS),
  };
}

export async function pricingPolicy(ctx: QueryCtx): Promise<PricingPolicy> {
  return {
    ...DEFAULT_COMPANY_POLICY,
    ...(await storedPricingPolicy(ctx)),
    platformFloor: platformFloor(),
  };
}

/** Validates one pricing setting against the rest of the policy; returns the stored value it replaces. */
export async function checkPricingSetting(
  ctx: QueryCtx,
  key: PricingKey,
  value: number | null,
) {
  const field = pricingField(key);
  const stored = await storedPricingPolicy(ctx);
  const next: CompanyPolicy = {
    ...DEFAULT_COMPANY_POLICY,
    ...stored,
    [field]: value ?? DEFAULT_COMPANY_POLICY[field],
  };
  const problem = policyProblem(next);
  if (problem) invalid(field, problem);
  return stored[field] ?? null;
}
