import type { Doc } from "../_generated/dataModel";
import { type Utm, UTM_KEYS } from "../../lib/domain/leads";
import {
  cleanText,
  normalizeEmail,
  normalizePhone,
} from "../../lib/domain/normalize";
import {
  CAMPAIGN_STATUSES,
  ORG_ROLES,
  PAUSE_REASONS,
  PLATFORM_EVENTS,
  type PlatformEventData,
  type PlatformEventType,
} from "../../lib/domain/platform";
import type { StateEvent } from "../../lib/domain/platform-state";

export const UNKNOWN_TYPE = "unknown type";
export const DEMO_ORG = "demo organisation";
const MAX_ID = 200;
const MAX_TEXT = 300;
// Convex documents top out at 1 MiB, the same as the request cap, so oversized payloads are parked unstored.
export const MAX_PAYLOAD = 512 * 1024;

export type Envelope = {
  eventId: string;
  type: string;
  occurredAt: number;
  data: Record<string, unknown>;
  /** Envelope version; absent means 1. */
  version?: number;
};

export type ReceiveResult =
  | { status: "duplicate" | "processed" | "pending" }
  | { status: "ignored" }
  | { status: "parked"; error: string };

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max = MAX_TEXT) {
  return typeof value === "string" ? cleanText(value.slice(0, max)) : undefined;
}

export function id(value: unknown) {
  const result = text(value, MAX_ID);
  return result && !/\s/.test(result) ? result : undefined;
}

export function isPlatformEvent(type: string): type is PlatformEventType {
  return (PLATFORM_EVENTS as readonly string[]).includes(type);
}

/** Validates `{v?, event_id, event, occurred_at, data}`; the payload is checked per type later. */
export function parseEnvelope(
  value: Record<string, unknown>,
): Parsed<Envelope> {
  const eventId = id(value.event_id);
  if (!eventId) return { ok: false, error: "event_id is required" };
  const type = id(value.event);
  if (!type) return { ok: false, error: "event is required" };
  const occurredAt =
    typeof value.occurred_at === "string" ? Date.parse(value.occurred_at) : NaN;
  if (Number.isNaN(occurredAt)) {
    return { ok: false, error: "occurred_at must be an ISO 8601 timestamp" };
  }
  if (!isObject(value.data))
    return { ok: false, error: "data must be an object" };
  if (
    value.v !== undefined &&
    (typeof value.v !== "number" || !Number.isSafeInteger(value.v))
  ) {
    return { ok: false, error: "v must be an integer" };
  }
  return {
    ok: true,
    value: {
      eventId,
      type,
      occurredAt,
      data: value.data,
      ...(value.v === undefined ? {} : { version: value.v as number }),
    },
  };
}

class PayloadError extends Error {}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) throw new PayloadError(`${field} is required`);
  return value;
}

function paise(
  value: unknown,
  field: string,
  optional: true,
): number | undefined;
function paise(value: unknown, field: string, optional?: false): number;
function paise(value: unknown, field: string, optional = false) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new PayloadError(`${field} must be a non-negative integer`);
  }
  return value;
}

/** A balance can go below zero. */
function balance(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new PayloadError(`${field} must be an integer`);
  }
  return value;
}

function count(value: unknown, field: string) {
  return paise(value, field);
}

function flag(value: unknown) {
  return value === true;
}

function oneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  field: string,
): T {
  if (!(options as readonly unknown[]).includes(value)) {
    throw new PayloadError(`${field} must be one of ${options.join(", ")}`);
  }
  return value as T;
}

function maybeOneOf<T extends string>(value: unknown, options: readonly T[]) {
  return (options as readonly unknown[]).includes(value)
    ? (value as T)
    : undefined;
}

function utm(value: unknown): Utm {
  const result: Utm = {};
  if (!isObject(value)) return result;
  for (const key of UTM_KEYS) {
    const item = text(value[key], 200);
    if (item) result[key] = item;
  }
  return result;
}

export const email = (value: unknown) =>
  normalizeEmail(text(value) ?? "") ?? undefined;
export const phone = (value: unknown) =>
  normalizePhone(text(value, 24) ?? "") ?? undefined;
const orgId = (data: Record<string, unknown>) =>
  required(id(data.org_id), "org_id");
const campaign = (data: Record<string, unknown>) => ({
  org_id: orgId(data),
  campaign_id: required(id(data.campaign_id), "campaign_id"),
  title: text(data.title),
});

const PARSERS: {
  [T in PlatformEventType]: (
    data: Record<string, unknown>,
  ) => PlatformEventData[T];
} = {
  "user.signed_up": (data) => ({
    user_id: required(id(data.user_id), "user_id"),
    email: email(data.email),
    phone: phone(data.phone),
    name: text(data.name, 120),
    utm: utm(data.utm),
  }),
  "organization.created": (data) => ({
    org_id: orgId(data),
    created_by: required(id(data.created_by), "created_by"),
    name: required(text(data.name, 120), "name"),
    website: text(data.website),
    gstin: text(data.gstin, 20),
    legal_name: text(data.legal_name),
    support_phone: phone(data.support_phone),
    is_demo: flag(data.is_demo),
  }),
  "organization.gst_verified": (data) => ({
    org_id: orgId(data),
    gstin: required(text(data.gstin, 20), "gstin"),
    legal_name: text(data.legal_name),
  }),
  "organization.gst_failed": (data) => {
    const user = id(data.user_id);
    const org = id(data.org_id);
    if (!user && !org) throw new PayloadError("user_id is required");
    return {
      user_id: user,
      org_id: org,
      email: email(data.email),
      gstin: text(data.gstin, 20),
      reason: required(text(data.reason), "reason"),
    };
  },
  "wallet.topup_succeeded": (data) => ({
    org_id: orgId(data),
    amount_paise: paise(data.amount_paise, "amount_paise"),
    method: text(data.method, 40),
    is_first: flag(data.is_first),
    balance_paise:
      data.balance_paise === undefined
        ? undefined
        : balance(data.balance_paise, "balance_paise"),
  }),
  "wallet.deposit_received": (data) => ({
    org_id: orgId(data),
    amount_paise: paise(data.amount_paise, "amount_paise"),
    utr: text(data.utr, 40),
    is_first: flag(data.is_first),
    balance_paise:
      data.balance_paise === undefined
        ? undefined
        : balance(data.balance_paise, "balance_paise"),
  }),
  "wallet.low_balance": (data) => ({
    org_id: orgId(data),
    balance_paise: balance(data.balance_paise, "balance_paise"),
    threshold_paise: paise(data.threshold_paise, "threshold_paise", true),
  }),
  "wallet.negative": (data) => ({
    org_id: orgId(data),
    balance_paise: balance(data.balance_paise, "balance_paise"),
  }),
  "wallet.recovered": (data) => ({
    org_id: orgId(data),
    balance_paise: balance(data.balance_paise, "balance_paise"),
  }),
  "campaign.status_changed": (data) => {
    const to = oneOf(data.to, CAMPAIGN_STATUSES, "to");
    return {
      ...campaign(data),
      from: maybeOneOf(data.from, CAMPAIGN_STATUSES),
      to,
      pause_reason:
        to === "paused"
          ? maybeOneOf(data.pause_reason, PAUSE_REASONS)
          : undefined,
    };
  },
  "campaign.submitted": campaign,
  "campaign.live": campaign,
  "campaign.paused": (data) => ({
    ...campaign(data),
    pause_reason: maybeOneOf(data.pause_reason, PAUSE_REASONS),
  }),
  "campaign.ended": campaign,
  "campaign.changes_requested": (data) => ({
    ...campaign(data),
    reason: text(data.reason),
  }),
  "campaign.slots_filled": (data) => ({
    ...campaign(data),
    max_enrollments: paise(data.max_enrollments, "max_enrollments", true),
    waiting: paise(data.waiting, "waiting", true),
  }),
  "enrollment.approved": (data) => ({
    ...campaign(data),
    platform_fee_paise: paise(
      data.platform_fee_paise,
      "platform_fee_paise",
      true,
    ),
    is_first_for_org: flag(data.is_first_for_org),
  }),
  "enrollment.review_overdue": (data) => ({
    ...campaign(data),
    count: count(data.count, "count"),
    oldest_days: count(data.oldest_days, "oldest_days"),
  }),
  "listing.created": (data) => ({
    org_id: orgId(data),
    listing_id: required(id(data.listing_id), "listing_id"),
    platform_slug: required(id(data.platform_slug), "platform_slug"),
    name: text(data.name),
  }),
  "member.joined": (data) => ({
    org_id: orgId(data),
    user_id: required(id(data.user_id), "user_id"),
    role: maybeOneOf(data.role, ORG_ROLES) ?? "member",
    name: text(data.name, 120),
    email: email(data.email),
    phone: phone(data.phone),
  }),
};

export function parseEventData<T extends PlatformEventType>(
  type: T,
  data: Record<string, unknown>,
): Parsed<PlatformEventData[T]> {
  try {
    return { ok: true, value: PARSERS[type](data) };
  } catch (error) {
    if (error instanceof PayloadError) {
      return { ok: false, error: `invalid data: ${error.message}` };
    }
    throw error;
  }
}

/** The stored payload, or an empty object when it can't be read. */
export function payloadOf(event: Pick<Doc<"platformEvents">, "payload">) {
  try {
    const value: unknown = JSON.parse(event.payload);
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

/** Processed events in the shape the state and stall rules read. */
export function stateEvents(events: Doc<"platformEvents">[]): StateEvent[] {
  return events
    .filter(
      (event) =>
        event.processedAt && !event.ignored && isPlatformEvent(event.type),
    )
    .map((event) => ({
      type: event.type,
      occurredAt: event.occurredAt,
      data: payloadOf(event),
    }));
}
