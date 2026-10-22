import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { LifecycleStage } from "../../lib/domain/enums";
import { checkGstin, panRoot } from "../../lib/domain/gstin";
import { STAGE_LABEL } from "../../lib/domain/labels";
import {
  UTM_KEYS,
  companyDomain,
  splitName,
  type Utm,
} from "../../lib/domain/leads";
import { formatMoney, type Money } from "../../lib/domain/money";
import {
  cleanText,
  normalizeEmail,
  normalizePhone,
} from "../../lib/domain/normalize";
import {
  ACTIVATION_STAGES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  ENVELOPE_VERSIONS,
  LOW_BALANCE_FLOOR_PAISE,
  ORG_ROLES,
  ORG_ROLE_TAG,
  ORG_ROLE_TITLE,
  PAUSE_REASONS,
  PLATFORM_EVENTS,
  PLATFORM_EVENT_LABEL,
  campaignTransition,
  eventStage,
  isFundingEvent,
  marketplaceLabel,
  pathIndex,
  type ActivationStage,
  type CampaignStatus,
  type OrgRole,
  type PauseReason,
  canonicalEvent,
  type PlatformEventData,
  type PlatformEventType,
} from "../../lib/domain/platform";
import {
  liveCampaigns,
  platformState,
  type StateEvent,
} from "../../lib/domain/platform-state";
import type { HealthCampaign, HealthInput } from "../../lib/domain/health";
import { nextOwner } from "./assignment";
import { emitAutomationTrigger } from "./automations/engine";
import { createLead, isOpen, leadHref, rescoreLead } from "./leads";
import { findAccount, findPerson } from "./identity";
import { firstLive } from "./merged";
import { personSearchText } from "./records";
import { logSystem, type RecordRefs } from "./timeline";
import { notify, notifyMany, leadershipIds } from "../notifications";
import { routes } from "../../lib/routes";

export const UNKNOWN_TYPE = "unknown type";
export const DEMO_ORG = "demo organisation";
const MAX_ID = 200;
const MAX_TEXT = 300;
// Convex documents top out at 1 MiB, the same as the request cap, so oversized payloads are parked unstored.
const MAX_PAYLOAD = 512 * 1024;

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

function id(value: unknown) {
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

const email = (value: unknown) =>
  normalizeEmail(text(value) ?? "") ?? undefined;
const phone = (value: unknown) =>
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

const PRE_PATH: LifecycleStage[] = ["prospect", "lead", "qualified", "demo"];
const REVIVABLE: LifecycleStage[] = ["at_risk", "dormant", "disqualified"];

/** Shows a brand is actually using the platform, as opposed to setting up. */
function isActivity(type: string, data: Record<string, unknown>) {
  if (isFundingEvent(type)) return true;
  if (type === "enrollment.approved" || type === "campaign.slots_filled")
    return true;
  return campaignTransition(type, data)?.to === "live";
}

/**
 * The stage an event moves an account to, or null to leave it. Accounts only
 * move forward along the activation path; an at-risk, dormant or disqualified
 * account is revived by real usage, to the furthest stage it has reached.
 */
export function nextStage(
  current: LifecycleStage,
  target: ActivationStage,
  options: { activity: boolean; reached?: ActivationStage | null },
): ActivationStage | null {
  const index = pathIndex(target);
  if (index < 0) return null;
  if (PRE_PATH.includes(current)) return target;
  const at = pathIndex(current);
  if (at >= 0) {
    return index > at ? target : null;
  }
  if (!REVIVABLE.includes(current) || !options.activity) return null;
  const reached = options.reached ? pathIndex(options.reached) : -1;
  return reached > index ? options.reached! : target;
}

export function furthestStage(stages: (ActivationStage | null | undefined)[]) {
  let best = -1;
  for (const stage of stages) best = Math.max(best, pathIndex(stage));
  return best < 0 ? null : ACTIVATION_STAGES[best];
}

function inr(amount: number): Money {
  return { amount, currency: "INR" };
}

const rupees = (amount: number) =>
  formatMoney(inr(amount), { fractions: amount % 100 !== 0 });

const TOPUP_METHOD: Record<string, string> = {
  upi: "UPI",
  va: "bank transfer",
  card: "card",
  netbanking: "netbanking",
};

const PAUSE_REASON_LABEL: Record<PauseReason, string> = {
  brand_paused: "paused by the brand",
  insufficient_funds: "paused automatically for insufficient funds",
};

const quoted = (title: string | undefined) => (title ? ` “${title}”` : "");

/** Timeline subject and body for an event about `who`. */
export function describeEvent<T extends PlatformEventType>(
  type: T,
  data: PlatformEventData[T],
  who: string,
): { subject: string; body?: string } {
  const subject = `reported that ${who} ${PLATFORM_EVENT_LABEL[type]}`;
  const lines = (...parts: (string | false | undefined)[]) =>
    parts.filter(Boolean).join("\n") || undefined;
  const move = campaignTransition(type, data as Record<string, unknown>);
  if (move) {
    const event = data as PlatformEventData["campaign.status_changed"];
    const from = event.from ? `${CAMPAIGN_STATUS_LABEL[event.from]} → ` : "";
    const verb: Partial<Record<CampaignStatus, string>> = {
      pending_review: "submitted a campaign",
      live: "went live with a campaign",
      paused: "paused a campaign",
      ended: "ended a campaign",
      changes_requested: "was asked to change a campaign",
      rejected: "had a campaign rejected",
      scheduled: "had a campaign approved",
    };
    const reason =
      move.pauseReason === "insufficient_funds"
        ? "had a campaign paused for insufficient funds"
        : undefined;
    return {
      subject: `reported that ${who} ${reason ?? verb[move.to] ?? `moved a campaign to ${CAMPAIGN_STATUS_LABEL[move.to]}`}${quoted(move.title)}`,
      body: lines(
        `${from}${CAMPAIGN_STATUS_LABEL[move.to]}`,
        move.pauseReason && `Campaign ${PAUSE_REASON_LABEL[move.pauseReason]}`,
        move.pauseReason === "insufficient_funds" &&
          "It won't resume on its own after a top-up.",
        type === "campaign.changes_requested" &&
          (data as PlatformEventData["campaign.changes_requested"]).reason,
      ),
    };
  }
  switch (type) {
    case "organization.created": {
      const event = data as PlatformEventData["organization.created"];
      return {
        subject,
        body: lines(
          `Organisation: ${event.name}`,
          event.gstin && `GSTIN ${event.gstin} (verified)`,
          event.legal_name,
          event.website,
        ),
      };
    }
    case "organization.gst_verified": {
      const event = data as PlatformEventData["organization.gst_verified"];
      return {
        subject,
        body: lines(`GSTIN ${event.gstin}`, event.legal_name),
      };
    }
    case "organization.gst_failed": {
      const event = data as PlatformEventData["organization.gst_failed"];
      return {
        subject: `${subject}: ${event.reason}`,
        body: event.gstin && `GSTIN ${event.gstin}`,
      };
    }
    case "wallet.topup_succeeded": {
      const event = data as PlatformEventData["wallet.topup_succeeded"];
      const method = event.method
        ? (TOPUP_METHOD[event.method.toLowerCase()] ?? event.method)
        : undefined;
      return {
        subject: `${subject} with ${rupees(event.amount_paise)}`,
        body: lines(
          event.is_first && "First top-up",
          method && `Paid by ${method}`,
        ),
      };
    }
    case "wallet.deposit_received": {
      const event = data as PlatformEventData["wallet.deposit_received"];
      return {
        subject: `${subject}: ${rupees(event.amount_paise)}`,
        body: lines(
          event.is_first && "First deposit",
          event.utr && `UTR ${event.utr}`,
        ),
      };
    }
    case "wallet.low_balance":
    case "wallet.negative":
    case "wallet.recovered": {
      const event = data as PlatformEventData["wallet.low_balance"];
      return { subject, body: `Balance ${rupees(event.balance_paise)}` };
    }
    case "campaign.slots_filled": {
      const event = data as PlatformEventData["campaign.slots_filled"];
      return {
        subject: `${subject}${quoted(event.title)}`,
        body: lines(
          event.max_enrollments !== undefined &&
            `${event.max_enrollments} slots`,
          event.waiting
            ? `${event.waiting} creators waiting for a place`
            : undefined,
        ),
      };
    }
    case "enrollment.approved": {
      const event = data as PlatformEventData["enrollment.approved"];
      return {
        subject,
        body: lines(
          event.is_first_for_org && "First approved result",
          event.platform_fee_paise !== undefined &&
            `Platform fee ${formatMoney(inr(event.platform_fee_paise), { fractions: true })}`,
        ),
      };
    }
    case "enrollment.review_overdue": {
      const event = data as PlatformEventData["enrollment.review_overdue"];
      return {
        subject: `${subject}${quoted(event.title)}`,
        body: `${event.count} waiting, the oldest for ${event.oldest_days} days`,
      };
    }
    case "listing.created": {
      const event = data as PlatformEventData["listing.created"];
      return {
        subject: `${subject} on ${marketplaceLabel(event.platform_slug)}`,
        body: event.name,
      };
    }
    case "member.joined": {
      const event = data as PlatformEventData["member.joined"];
      return {
        subject: `${subject}: ${event.name ?? event.email ?? event.user_id}`,
        body: ORG_ROLE_TITLE[event.role],
      };
    }
    default:
      return { subject };
  }
}

type StageChange = { from: LifecycleStage; to: LifecycleStage } | null;

/** Timeline entries for an event, dated when it happened on the platform rather than when it arrived. */
async function log(
  ctx: MutationCtx,
  refs: RecordRefs,
  event: Doc<"platformEvents">,
  text: { subject: string; body?: string },
  change: StageChange = null,
) {
  const id = await logSystem(ctx, refs, text.subject, text.body);
  await ctx.db.patch(id, { occurredAt: event.occurredAt });
  if (change && refs.accountId) {
    await ctx.db.insert("timeline", {
      kind: "change",
      accountId: refs.accountId,
      occurredAt: event.occurredAt,
      changes: [
        {
          field: "Stage",
          from: STAGE_LABEL[change.from],
          to: STAGE_LABEL[change.to],
        },
      ],
    });
  }
}

const LINK_ROWS = 5;

/** Archived accounts never receive platform data; a merged one hands it to its winner. */
export async function accountForOrg(ctx: QueryCtx, orgId: string) {
  const rows = await ctx.db
    .query("accounts")
    .withIndex("by_platform_org", (q) => q.eq("platformOrgId", orgId))
    .take(LINK_ROWS);
  return await firstLive(rows, (id) => ctx.db.get(id));
}

export async function personByPlatformUser(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("people")
    .withIndex("by_platform_user", (q) => q.eq("platformUserId", userId))
    .take(LINK_ROWS);
  return await firstLive(rows, (id) => ctx.db.get(id));
}

async function personByEmail(ctx: QueryCtx, email: string) {
  return await findPerson(ctx, { email });
}

async function accountByDomain(ctx: QueryCtx, domain: string | null) {
  return domain ? await findAccount(ctx, { domain }) : null;
}

function emailDomain(email: string | undefined) {
  return email ? companyDomain(email.split("@")[1]) : null;
}

/** The stored `user.signed_up` event for a platform user. */
export async function signupEvent(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("platformEvents")
    .withIndex("by_user_type", (q) =>
      q.eq("userId", userId).eq("type", "user.signed_up"),
    )
    .first();
}

/** GST failures a platform user hit before they had an organisation. */
export async function gstFailures(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("platformEvents")
    .withIndex("by_user_type", (q) =>
      q.eq("userId", userId).eq("type", "organization.gst_failed"),
    )
    .collect();
}

function signupData(event: Doc<"platformEvents"> | null) {
  if (!event) return null;
  const parsed = parseEventData("user.signed_up", payloadOf(event));
  return parsed.ok ? parsed.value : null;
}

async function latestLead(ctx: QueryCtx, email: string | undefined) {
  if (!email) return null;
  const leads = await ctx.db
    .query("leads")
    .withIndex("by_email", (q) => q.eq("email", email))
    .order("desc")
    .take(20);
  return (
    leads.find(isOpen) ??
    leads.find((lead) => lead.status === "converted") ??
    null
  );
}

function fullName(person: Pick<Doc<"people">, "firstName" | "lastName">) {
  return `${person.firstName} ${person.lastName}`.trim();
}

async function linkPerson(
  ctx: MutationCtx,
  person: Doc<"people">,
  link: { platformUserId?: string; account?: Doc<"accounts"> | null },
  occurredAt: number,
) {
  const patch: Partial<Doc<"people">> = {
    updatedAt: Date.now(),
    lastActivityAt: Math.max(person.lastActivityAt ?? 0, occurredAt),
  };
  if (link.platformUserId && !person.platformUserId) {
    patch.platformUserId = link.platformUserId;
  }
  if (link.account && !person.accountId) {
    patch.accountId = link.account._id;
    patch.searchText = personSearchText(person, link.account.name);
  }
  await ctx.db.patch(person._id, patch);
  return { ...person, ...patch };
}

export type PlatformMember = {
  userId: string;
  name?: string;
  email?: string;
  phone?: string;
  roles: string[];
};

const ROLE_ORDER: OrgRole[] = [
  "owner",
  "finance_manager",
  "admin",
  "campaign_manager",
  "member",
];

/** The member's most telling role: owner first, then the billing contact. */
export function primaryRole(roles: string[]): OrgRole {
  return ROLE_ORDER.find((role) => roles.includes(role)) ?? "member";
}

/**
 * Makes a platform member a person on the account, matched by platform user id
 * and then email. Fills the title and role tags without overwriting a rep's edits.
 */
export async function upsertMember(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  member: PlatformMember,
  occurredAt: number,
): Promise<{ personId: Id<"people">; created: boolean } | null> {
  const role = primaryRole(member.roles);
  const memberEmail = member.email ? email(member.email) : undefined;
  const byUser = await personByPlatformUser(ctx, member.userId);
  if (byUser?.erasedAt) return null;
  const known =
    byUser ??
    (await findPerson(ctx, {
      email: memberEmail,
      phone: member.phone ? phone(member.phone) : undefined,
    }));
  const tags = member.roles.flatMap(
    (item) => ORG_ROLE_TAG[item as OrgRole] ?? [],
  );

  if (known) {
    if (known.erasedAt) return null;
    const linked = await linkPerson(
      ctx,
      known,
      { platformUserId: member.userId, account },
      occurredAt,
    );
    const patch: Partial<Doc<"people">> = {};
    if (!linked.title) patch.title = ORG_ROLE_TITLE[role];
    const memberPhone = member.phone ? phone(member.phone) : undefined;
    if (
      !linked.phone &&
      memberPhone &&
      !(await findPerson(ctx, { phone: memberPhone }, known._id))
    ) {
      patch.phone = memberPhone;
    }
    const missing = tags.filter((tag) => !linked.tags.includes(tag));
    if (missing.length) patch.tags = [...linked.tags, ...missing];
    if (Object.keys(patch).length) {
      const next = { ...linked, ...patch };
      patch.searchText = personSearchText(
        next,
        linked.accountId === account._id ? account.name : undefined,
      );
      await ctx.db.patch(known._id, patch);
    }
    return { personId: known._id, created: false };
  }

  const fallback = memberEmail?.split("@")[0] ?? "Team member";
  const { firstName, lastName } = splitName(member.name || fallback);
  const fields = {
    firstName: firstName || fallback,
    lastName,
    email: memberEmail,
    phone: member.phone ? phone(member.phone) : undefined,
    title: ORG_ROLE_TITLE[role],
  };
  const now = Date.now();
  const personId = await ctx.db.insert("people", {
    ...fields,
    accountId: account._id,
    ownerId: account.ownerId,
    tags,
    platformUserId: member.userId,
    lastActivityAt: occurredAt,
    updatedAt: now,
    searchText: personSearchText(fields, account.name),
  });
  const entry = await logSystem(
    ctx,
    { accountId: account._id, personId },
    `added ${fullName(fields)} from the Hypedrive team (${ORG_ROLE_TITLE[role]})`,
  );
  await ctx.db.patch(entry, { occurredAt });
  return { personId, created: true };
}

async function orgEvents(ctx: QueryCtx, orgId: string) {
  return await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
}

async function reachedStage(ctx: QueryCtx, orgId: string) {
  return furthestStage(
    stateEvents(await orgEvents(ctx, orgId)).map((event) =>
      eventStage(event.type, event.data),
    ),
  );
}

/** Moves the account along the path for this event and records the activity. */
async function touchAccount(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  event: Doc<"platformEvents">,
  data: Record<string, unknown>,
  patch: Partial<Doc<"accounts">> = {},
): Promise<StageChange> {
  const target = eventStage(event.type, data);
  const activity = isActivity(event.type, data);
  const reached =
    target &&
    activity &&
    REVIVABLE.includes(account.stage) &&
    account.platformOrgId
      ? await reachedStage(ctx, account.platformOrgId)
      : null;
  const stage = target
    ? nextStage(account.stage, target, { activity, reached })
    : null;
  await ctx.db.patch(account._id, {
    ...patch,
    ...(stage ? { stage } : {}),
    lastActivityAt: Math.max(account.lastActivityAt ?? 0, event.occurredAt),
    updatedAt: Date.now(),
  });
  if (!stage || stage === account.stage) return null;
  await emitAutomationTrigger(ctx, {
    kind: "account_stage_changed",
    refs: { accountId: account._id },
    value: stage,
  });
  return { from: account.stage, to: stage };
}

type Outcome =
  | { status: "processed"; refs: RecordRefs }
  | { status: "pending" }
  | { error: string };

async function onSignedUp(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData["user.signed_up"],
): Promise<Outcome> {
  const domainAccount = await accountByDomain(ctx, emailDomain(data.email));
  const known = await findPerson(ctx, {
    platformUserId: data.user_id,
    email: data.email,
    phone: data.phone,
  });

  if (known) {
    const person = await linkPerson(
      ctx,
      known,
      { platformUserId: data.user_id, account: domainAccount },
      event.occurredAt,
    );
    const account = person.accountId
      ? await ctx.db.get(person.accountId)
      : null;
    const change = account
      ? await touchAccount(ctx, account, event, data)
      : null;
    await log(
      ctx,
      { personId: person._id, accountId: account?._id },
      event,
      describeEvent("user.signed_up", data, fullName(person)),
      change,
    );
    return {
      status: "processed",
      refs: { personId: person._id, accountId: account?._id },
    };
  }

  const name =
    data.name ?? data.email?.split("@")[0] ?? data.phone ?? "New signup";
  const existing = await latestLead(ctx, data.email);
  let leadId: Id<"leads">;
  if (existing && isOpen(existing)) {
    leadId = existing._id;
    await ctx.db.patch(existing._id, {
      phone: existing.phone ?? data.phone,
      accountId: existing.accountId ?? domainAccount?._id,
    });
    const input = {
      kind: "lead_signup",
      title: `${existing.name} signed up on Hypedrive`,
      body: existing.companyName,
      href: leadHref(existing._id),
    };
    if (existing.ownerId) await notify(ctx, existing.ownerId, input);
    else await notifyMany(ctx, await leadershipIds(ctx), input);
  } else {
    const domain = emailDomain(data.email);
    const created = await createLead(ctx, {
      kind: "signup",
      source: "platform",
      name,
      email: data.email,
      phone: data.phone,
      companyName: domainAccount?.name ?? domain ?? name,
      website: domain ?? undefined,
      utm: data.utm ?? {},
    });
    leadId = created.id;
    if (domainAccount)
      await ctx.db.patch(leadId, { accountId: domainAccount._id });
      await rescoreLead(ctx, leadId);
  }
  const change = domainAccount
    ? await touchAccount(ctx, domainAccount, event, data)
    : null;
  await log(
    ctx,
    { leadId, accountId: domainAccount?._id },
    event,
    describeEvent("user.signed_up", data, name),
    change,
  );
  return {
    status: "processed",
    refs: { leadId, accountId: domainAccount?._id },
  };
}

async function onOrgCreated(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData["organization.created"],
): Promise<Outcome> {
  const creator = await personByPlatformUser(ctx, data.created_by);
  const signup = creator
    ? null
    : signupData(await signupEvent(ctx, data.created_by));
  const email = creator?.email ?? signup?.email;
  const person = creator ?? (email ? await personByEmail(ctx, email) : null);
  const lead = await latestLead(ctx, email);
  const gst = data.gstin ? checkGstin(data.gstin) : null;
  const verified: Partial<Doc<"accounts">> =
    gst?.ok === true
      ? { gstin: gst.gstin, panRoot: panRoot(gst.gstin) ?? undefined }
      : {};

  let account = await accountForOrg(ctx, data.org_id);
  let created = false;
  if (!account) {
    const unlinked = (candidate: Doc<"accounts"> | null) =>
      candidate && !candidate.archivedAt && !candidate.platformOrgId
        ? candidate
        : null;
    account =
      (gst?.ok
        ? await findAccount(
            ctx,
            { gstin: gst.gstin, domain: data.website },
            { unlinkedOnly: true },
          )
        : null) ??
      unlinked(await accountByDomain(ctx, companyDomain(data.website))) ??
      unlinked(person?.accountId ? await ctx.db.get(person.accountId) : null) ??
      unlinked(lead?.accountId ? await ctx.db.get(lead.accountId) : null) ??
      unlinked(await accountByDomain(ctx, emailDomain(email)));
    if (account) {
      await ctx.db.patch(account._id, { platformOrgId: data.org_id });
      account = { ...account, platformOrgId: data.org_id };
    } else {
      const ownerId =
        lead?.ownerId ?? person?.ownerId ?? (await nextOwner(ctx));
      if (!ownerId) return { error: "no active member to own the account" };
      const now = Date.now();
      const accountId = await ctx.db.insert("accounts", {
        name: data.name,
        domain: companyDomain(data.website) ?? undefined,
        ownerId,
        stage: "org_created",
        tags: [],
        platformOrgId: data.org_id,
        ...verified,
        lastActivityAt: event.occurredAt,
        updatedAt: now,
      });
      account = (await ctx.db.get(accountId))!;
      created = true;
      await notify(ctx, ownerId, {
        kind: "platform_org",
        title: `New on Hypedrive: ${data.name}`,
        body: "Organisation created with a verified GSTIN",
        href: routes.account(accountId),
      });
    }
  }

  if (person) {
    await linkPerson(
      ctx,
      person,
      { platformUserId: data.created_by, account },
      event.occurredAt,
    );
  }
  if (lead && !lead.accountId) {
    await ctx.db.patch(lead._id, { accountId: account._id });
    await rescoreLead(ctx, lead._id);
  }
  if (created) {
    const entry = await logSystem(
      ctx,
      { accountId: account._id },
      "created the account",
    );
    await ctx.db.patch(entry, { occurredAt: event.occurredAt });
  }
  const change = created
    ? null
    : await touchAccount(
        ctx,
        account,
        event,
        data,
        account.gstin ? {} : verified,
      );
  await log(
    ctx,
    { accountId: account._id, personId: person?._id },
    event,
    describeEvent("organization.created", data, account.name),
    change,
  );
  return {
    status: "processed",
    refs: { accountId: account._id, personId: person?._id },
  };
}

/** v2 GST failures belong to a user with no org yet: their person or lead, and the account their email domain points at. */
async function onUserGstFailed(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData["organization.gst_failed"] & { user_id: string },
): Promise<Outcome> {
  const signup = signupData(await signupEvent(ctx, data.user_id));
  const email = data.email ?? signup?.email;
  const known =
    (await personByPlatformUser(ctx, data.user_id)) ??
    (email ? await personByEmail(ctx, email) : null);
  const lead = known ? null : await latestLead(ctx, email);
  if (!known && !lead) return { status: "pending" };

  const domainAccount = await accountByDomain(ctx, emailDomain(email));
  const person = known
    ? await linkPerson(
        ctx,
        known,
        { platformUserId: data.user_id, account: domainAccount },
        event.occurredAt,
      )
    : null;
  const accountId =
    person?.accountId ?? lead?.accountId ?? domainAccount?._id ?? undefined;
  const account = accountId ? await ctx.db.get(accountId) : null;
  if (account) {
    await ctx.db.patch(account._id, {
      lastActivityAt: Math.max(account.lastActivityAt ?? 0, event.occurredAt),
      updatedAt: Date.now(),
    });
  }
  const who = person ? fullName(person) : lead!.name;
  await log(
    ctx,
    { personId: person?._id, leadId: lead?._id, accountId: account?._id },
    event,
    describeEvent("organization.gst_failed", data, who),
  );
  const recipient = account?.ownerId ?? lead?.ownerId ?? person?.ownerId;
  const input = {
    kind: "platform_gst_failed",
    title: `${who} couldn't verify GST on Hypedrive`,
    body: data.reason,
    href: account
      ? routes.account(account._id)
      : person
        ? routes.person(person._id)
        : leadHref(lead!._id),
  };
  if (recipient) await notify(ctx, recipient, input);
  else await notifyMany(ctx, await leadershipIds(ctx), input);
  return {
    status: "processed",
    refs: { personId: person?._id, leadId: lead?._id, accountId: account?._id },
  };
}

async function onMemberJoined(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  account: Doc<"accounts">,
  data: PlatformEventData["member.joined"],
) {
  const result = await upsertMember(
    ctx,
    account,
    {
      userId: data.user_id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      roles: [data.role],
    },
    event.occurredAt,
  );
  return result?.personId;
}

/** Owner alerts for events a rep should act on today. */
async function alertOwner(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  type: PlatformEventType,
  data: Record<string, unknown>,
) {
  const move = campaignTransition(type, data);
  const title =
    move?.pauseReason === "insufficient_funds"
      ? `${account.name}'s campaign paused: out of funds`
      : type === "wallet.negative"
        ? `${account.name}'s wallet went negative`
        : type === "campaign.slots_filled"
          ? `${account.name} sold out a campaign`
          : null;
  if (!title) return;
  await notify(ctx, account.ownerId, {
    kind: `platform_${type.replace(".", "_")}`,
    title,
    body:
      type === "campaign.slots_filled"
        ? "Every slot is taken: a good moment to talk about the next one."
        : "They need to top up, and paused campaigns must be resumed by hand.",
    href: routes.account(account._id),
  });
}

async function onOrgEvent(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  type: PlatformEventType,
  data: PlatformEventData[PlatformEventType] & { org_id: string },
): Promise<Outcome> {
  const account = await accountForOrg(ctx, data.org_id);
  if (!account) return { status: "pending" };

  const patch: Partial<Doc<"accounts">> = {};
  if (type === "organization.gst_verified") {
    const check = checkGstin(
      (data as PlatformEventData["organization.gst_verified"]).gstin,
    );
    if (!check.ok) return { error: `invalid GSTIN (${check.reason})` };
    patch.gstin = check.gstin;
    patch.panRoot = panRoot(check.gstin) ?? undefined;
  }
  const record = data as Record<string, unknown>;
  const change = await touchAccount(ctx, account, event, record, patch);
  const personId =
    type === "member.joined"
      ? await onMemberJoined(
          ctx,
          event,
          account,
          data as PlatformEventData["member.joined"],
        )
      : undefined;
  await log(
    ctx,
    { accountId: account._id, personId },
    event,
    describeEvent(type, data, account.name),
    change,
  );
  await alertOwner(ctx, account, type, record);
  return { status: "processed", refs: { accountId: account._id, personId } };
}

async function dispatch(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  type: PlatformEventType,
  data: PlatformEventData[PlatformEventType],
): Promise<Outcome> {
  switch (type) {
    case "user.signed_up": {
      const input = data as PlatformEventData["user.signed_up"];
      const outcome = await onSignedUp(ctx, event, input);
      if ("status" in outcome && outcome.status === "processed") {
        await replayUser(ctx, input.user_id, event._id);
      }
      return outcome;
    }
    case "organization.created": {
      const outcome = await onOrgCreated(
        ctx,
        event,
        data as PlatformEventData[typeof type],
      );
      if (
        "status" in outcome &&
        outcome.status === "processed" &&
        event.orgId
      ) {
        await replayOrg(ctx, event.orgId, event._id);
      }
      return outcome;
    }
    case "organization.gst_failed": {
      const input = data as PlatformEventData[typeof type];
      if (input.user_id && !input.org_id) {
        return onUserGstFailed(ctx, event, {
          ...input,
          user_id: input.user_id,
        });
      }
      return onOrgEvent(ctx, event, type, input as never);
    }
    default:
      return onOrgEvent(ctx, event, type, data as never);
  }
}

/** True when the org was created as a demo/test organisation on the platform. */
async function isDemoOrg(ctx: QueryCtx, orgId: string | undefined) {
  if (!orgId) return false;
  const created = await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .filter((q) => q.eq(q.field("type"), "organization.created"))
    .first();
  return created ? payloadOf(created).is_demo === true : false;
}

async function settle(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
): Promise<ReceiveResult> {
  const version = event.v ?? 1;
  if (!(ENVELOPE_VERSIONS as readonly number[]).includes(version)) {
    const error = `unsupported envelope version ${version}`;
    await ctx.db.patch(event._id, { error });
    return { status: "parked", error };
  }
  if (!isPlatformEvent(event.type)) {
    await ctx.db.patch(event._id, { error: UNKNOWN_TYPE });
    return { status: "parked", error: UNKNOWN_TYPE };
  }
  const raw = payloadOf(event);
  if (raw.is_demo === true || (await isDemoOrg(ctx, event.orgId))) {
    await ctx.db.patch(event._id, {
      ignored: DEMO_ORG,
      processedAt: Date.now(),
      error: undefined,
    });
    return { status: "ignored" };
  }
  const parsed = parseEventData(event.type, raw);
  const outcome = parsed.ok
    ? await dispatch(ctx, event, event.type, parsed.value)
    : { error: parsed.error };
  if ("error" in outcome) {
    await ctx.db.patch(event._id, { error: outcome.error });
    return { status: "parked", error: outcome.error };
  }
  if (outcome.status === "processed") {
    await ctx.db.patch(event._id, {
      processedAt: Date.now(),
      error: undefined,
    });
    if (parsed.ok)
      await emitPlatformTrigger(ctx, event, parsed.value, outcome.refs);
  }
  return { status: outcome.status };
}

/** Lets automations start or resume runs on the normalised event. */
async function emitPlatformTrigger(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData[PlatformEventType],
  refs: RecordRefs,
) {
  const trigger = canonicalEvent(event.type as PlatformEventType, data);
  if (!trigger) return;
  const move =
    trigger.type === "campaign.status_changed" ? trigger.data : undefined;
  await emitAutomationTrigger(ctx, {
    kind: "platform_event",
    refs,
    value: trigger.type,
    campaignStatus: move?.to,
    pauseReason: move?.pause_reason,
  });
}

const waiting = (event: Doc<"platformEvents">) =>
  !event.processedAt && !event.error && !event.ignored;

/** Events that arrived before their org was known, processed in the order they happened. */
async function replayOrg(
  ctx: MutationCtx,
  orgId: string,
  skip: Id<"platformEvents">,
) {
  const events = await orgEvents(ctx, orgId);
  for (const event of events) {
    if (event._id !== skip && waiting(event)) await settle(ctx, event);
  }
}

/** User-keyed events (a GST failure) that arrived before the signup. */
async function replayUser(
  ctx: MutationCtx,
  userId: string,
  skip: Id<"platformEvents">,
) {
  for (const event of await gstFailures(ctx, userId)) {
    if (event._id !== skip && waiting(event) && !event.orgId) {
      await settle(ctx, event);
    }
  }
}

function eventRefs(data: Record<string, unknown>) {
  return {
    orgId: id(data.org_id),
    userId: id(data.user_id) ?? id(data.created_by),
  };
}

/** Stores an event once (by event id) and processes it in the same transaction. */
export async function receive(
  ctx: MutationCtx,
  envelope: Envelope,
): Promise<ReceiveResult> {
  const existing = await ctx.db
    .query("platformEvents")
    .withIndex("by_event_id", (q) => q.eq("eventId", envelope.eventId))
    .first();
  if (existing) return { status: "duplicate" };

  const payload = JSON.stringify(envelope.data);
  const tooLarge = payload.length > MAX_PAYLOAD;
  const eventDoc = await ctx.db.insert("platformEvents", {
    eventId: envelope.eventId,
    type: envelope.type,
    ...eventRefs(envelope.data),
    occurredAt: envelope.occurredAt,
    payload: tooLarge ? "{}" : payload,
    ...(envelope.version === undefined ? {} : { v: envelope.version }),
    error: tooLarge ? "payload too large" : undefined,
  });
  if (tooLarge) return { status: "parked", error: "payload too large" };
  return await settle(ctx, (await ctx.db.get(eventDoc))!);
}

type RetryResult = Exclude<ReceiveResult, { status: "ignored" }>;

/** Re-runs parked and waiting events, e.g. after support for a new event type ships. An ignored event counts as handled. */
export async function retry(ctx: MutationCtx, events: Doc<"platformEvents">[]) {
  const results: RetryResult[] = [];
  for (const event of events) {
    if (event.processedAt || event.ignored) continue;
    const fresh = (await ctx.db.get(event._id))!;
    if (fresh.processedAt || fresh.ignored) continue;
    await ctx.db.patch(event._id, { error: undefined });
    const result = await settle(ctx, { ...fresh, error: undefined });
    results.push(
      result.status === "ignored" ? { status: "processed" } : result,
    );
  }
  return results;
}

export type PlatformStep = {
  stage: ActivationStage;
  at: number | null;
  done: boolean;
};

/** Activation milestones and usage totals derived from an org's processed events. */
export function platformMetrics(
  events: Doc<"platformEvents">[],
  stage: LifecycleStage,
  signedUpAt: number | null,
  now: number,
) {
  const list = stateEvents(events);
  const first = new Map<ActivationStage, number>();
  if (signedUpAt !== null) first.set("signed_up", signedUpAt);
  for (const event of list) {
    const target = eventStage(event.type, event.data);
    if (target && (first.get(target) ?? Infinity) > event.occurredAt) {
      first.set(target, event.occurredAt);
    }
  }
  const state = platformState(list, now);
  const current = pathIndex(stage);
  const beyond = stage === "expanding";
  const steps: PlatformStep[] = ACTIVATION_STAGES.map((step, index) => {
    const at = first.get(step) ?? null;
    return {
      stage: step,
      at,
      done: at !== null || beyond || (current >= 0 && index <= current),
    };
  });
  return {
    steps,
    deposits: inr(state.funding.totalPaise),
    topups: state.funding.count,
    campaignsLive: liveCampaigns(state).length,
    lastEventAt: state.lastEventAt ?? signedUpAt,
    state,
  };
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * Health from the latest platform snapshot, with webhook events filling in
 * whatever happened since (or everything, before the first sync).
 */
export function healthInput(
  account: Pick<Doc<"accounts">, "lastActivityAt">,
  events: StateEvent[],
  snapshot: Doc<"platformSnapshots"> | null,
  now: number,
): HealthInput {
  const state = platformState(events, now);
  const fetchedAt = snapshot?.fetchedAt ?? 0;

  const campaigns = new Map<string, HealthCampaign>();
  for (const item of snapshot?.campaigns ?? []) {
    campaigns.set(item.id, {
      id: item.id,
      title: item.title,
      status: item.status,
      pauseReason: item.pauseReason,
      fillPct: item.max ? (item.enrolled / item.max) * 100 : null,
    });
  }
  for (const item of state.campaigns) {
    const known = campaigns.get(item.id);
    const fresher = !known || item.since > fetchedAt;
    campaigns.set(item.id, {
      id: item.id,
      title: known?.title ?? item.title,
      status: fresher ? item.status : known.status,
      pauseReason: fresher ? item.pauseReason : known.pauseReason,
      fillPct:
        item.slotsFilledAt !== undefined && item.slotsFilledAt > fetchedAt
          ? 100
          : (known?.fillPct ?? null),
      endedAt: item.endedAt,
    });
  }

  const funding = events.filter((event) => isFundingEvent(event.type));
  const depositsSince = (days: number) =>
    funding
      .filter((event) => now - event.occurredAt <= days * DAY_MS)
      .reduce((sum, event) => sum + Number(event.data?.amount_paise ?? 0), 0);

  const balancePaise = snapshot?.balancePaise ?? null;
  const walletFresh =
    state.wallet.since !== null && state.wallet.since > fetchedAt;
  const wallet =
    balancePaise !== null && !walletFresh
      ? balancePaise < 0
        ? "negative"
        : balancePaise < LOW_BALANCE_FLOOR_PAISE
          ? "low"
          : "ok"
      : state.wallet.status;

  const reviewCount = state.reviews.reduce((sum, item) => sum + item.count, 0);
  const reviewDays = state.reviews.length
    ? Math.max(
        ...state.reviews.map((item) =>
          Math.floor((now - item.oldestAt) / DAY_MS),
        ),
      )
    : null;
  const latestReview = Math.max(0, ...state.reviews.map((r) => r.reportedAt));
  const reviewsFromEvents = !snapshot || latestReview > fetchedAt;

  const markets = new Map<string, number>();
  for (const item of snapshot?.listings ?? []) {
    markets.set(item.marketplace, item.firstAt);
  }
  for (const item of state.listings) {
    markets.set(
      item.slug,
      Math.min(markets.get(item.slug) ?? item.at, item.at),
    );
  }

  return {
    now,
    balancePaise: walletFresh
      ? (state.wallet.balancePaise ?? null)
      : balancePaise,
    wallet,
    campaigns: [...campaigns.values()],
    deposits30dPaise: snapshot ? snapshot.deposits30d : depositsSince(30),
    deposits90dPaise: snapshot ? snapshot.deposits90d : depositsSince(90),
    fundingCount: Math.max(state.funding.count, snapshot?.depositCount90d ?? 0),
    staleReviews: reviewsFromEvents ? reviewCount : snapshot.staleReviews,
    oldestReviewDays: reviewsFromEvents
      ? reviewDays
      : (snapshot.oldestReviewDays ?? null),
    disputes: snapshot?.disputes ?? 0,
    lastActivityAt:
      Math.max(account.lastActivityAt ?? 0, state.lastEventAt ?? 0) || null,
    marketplaces: [...markets].map(([slug, firstAt]) => ({ slug, firstAt })),
    membersJoined30d: state.members.filter(
      (item) => now - item.at <= 30 * DAY_MS,
    ).length,
  };
}

export async function latestSnapshot(ctx: QueryCtx, accountId: Id<"accounts">) {
  return await ctx.db
    .query("platformSnapshots")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();
}
