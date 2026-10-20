import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { LifecycleStage } from "../../lib/domain/enums";
import { checkGstin, panRoot } from "../../lib/domain/gstin";
import { STAGE_LABEL } from "../../lib/domain/labels";
import { UTM_KEYS, companyDomain, type Utm } from "../../lib/domain/leads";
import { formatMoney, type Money } from "../../lib/domain/money";
import {
  cleanText,
  normalizeEmail,
  normalizePhone,
} from "../../lib/domain/normalize";
import {
  ACTIVATION_STAGES,
  EVENT_STAGE,
  PLATFORM_EVENTS,
  PLATFORM_EVENT_LABEL,
  type PlatformEventData,
  type PlatformEventType,
} from "../../lib/domain/platform";
import { nextOwner } from "./assignment";
import { createLead, isOpen, leadHref } from "./leads";
import { personSearchText } from "./records";
import { logSystem, type RecordRefs } from "./timeline";
import { notify, notifyMany, leadershipIds } from "../notifications";

export const UNKNOWN_TYPE = "unknown type";
const MAX_ID = 200;
const MAX_TEXT = 300;
// Convex documents top out at 1 MiB, the same as the request cap, so oversized payloads are parked unstored.
const MAX_PAYLOAD = 512 * 1024;

export type Envelope = {
  eventId: string;
  type: string;
  occurredAt: number;
  data: Record<string, unknown>;
};

export type ReceiveResult =
  | { status: "duplicate" | "processed" | "pending" }
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

/** Validates `{event_id, event, occurred_at, data}`; the payload is checked per type later. */
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
  return { ok: true, value: { eventId, type, occurredAt, data: value.data } };
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

function flag(value: unknown) {
  return value === true;
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

const PARSERS: {
  [T in PlatformEventType]: (
    data: Record<string, unknown>,
  ) => PlatformEventData[T];
} = {
  "user.signed_up": (data) => ({
    user_id: required(id(data.user_id), "user_id"),
    email: normalizeEmail(text(data.email) ?? "") ?? undefined,
    phone: normalizePhone(text(data.phone, 24) ?? "") ?? undefined,
    name: text(data.name, 120),
    utm: utm(data.utm),
  }),
  "organization.created": (data) => ({
    org_id: required(id(data.org_id), "org_id"),
    created_by: required(id(data.created_by), "created_by"),
    name: required(text(data.name, 120), "name"),
    website: text(data.website),
  }),
  "organization.gst_verified": (data) => ({
    org_id: required(id(data.org_id), "org_id"),
    gstin: required(text(data.gstin, 20), "gstin"),
    legal_name: text(data.legal_name),
  }),
  "organization.gst_failed": (data) => ({
    org_id: required(id(data.org_id), "org_id"),
    gstin: text(data.gstin, 20),
    reason: required(text(data.reason), "reason"),
  }),
  "wallet.topup_succeeded": (data) => ({
    org_id: required(id(data.org_id), "org_id"),
    amount_paise: paise(data.amount_paise, "amount_paise"),
    method: text(data.method, 40),
    is_first: flag(data.is_first),
  }),
  "campaign.submitted": (data) => ({
    org_id: required(id(data.org_id), "org_id"),
    campaign_id: required(id(data.campaign_id), "campaign_id"),
    title: text(data.title),
  }),
  "campaign.live": (data) => ({
    org_id: required(id(data.org_id), "org_id"),
    campaign_id: required(id(data.campaign_id), "campaign_id"),
    title: text(data.title),
  }),
  "enrollment.approved": (data) => ({
    org_id: required(id(data.org_id), "org_id"),
    campaign_id: required(id(data.campaign_id), "campaign_id"),
    platform_fee_paise: paise(
      data.platform_fee_paise,
      "platform_fee_paise",
      true,
    ),
    is_first_for_org: flag(data.is_first_for_org),
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

const PRE_PATH: LifecycleStage[] = ["prospect", "lead", "qualified", "demo"];
const REVIVABLE: LifecycleStage[] = ["at_risk", "dormant", "disqualified"];
/** Events that show a brand is actually using the platform, as opposed to setting up. */
const ACTIVITY_EVENTS: PlatformEventType[] = [
  "wallet.topup_succeeded",
  "campaign.live",
  "enrollment.approved",
];
const PATH = ACTIVATION_STAGES as readonly LifecycleStage[];

/**
 * The stage an event moves an account to, or null to leave it. Accounts only
 * move forward along the activation path; an at-risk, dormant or disqualified
 * account is revived by real usage, to the furthest stage it has reached.
 */
export function nextStage(
  current: LifecycleStage,
  target: LifecycleStage,
  options: { activity: boolean; reached?: LifecycleStage | null },
): LifecycleStage | null {
  const index = PATH.indexOf(target);
  if (index < 0) return null;
  if (PRE_PATH.includes(current)) return target;
  if (PATH.includes(current)) {
    return index > PATH.indexOf(current) ? target : null;
  }
  if (!REVIVABLE.includes(current) || !options.activity) return null;
  const reached = options.reached ? PATH.indexOf(options.reached) : -1;
  return reached > index ? options.reached! : target;
}

export function furthestStage(stages: (LifecycleStage | undefined)[]) {
  let best = -1;
  for (const stage of stages) {
    best = Math.max(best, stage ? PATH.indexOf(stage) : -1);
  }
  return best < 0 ? null : PATH[best];
}

function inr(amount: number): Money {
  return { amount, currency: "INR" };
}

const TOPUP_METHOD: Record<string, string> = {
  upi: "UPI",
  va: "bank transfer",
  card: "card",
  netbanking: "netbanking",
};

/** Timeline subject and body for an event about `who`. */
export function describeEvent<T extends PlatformEventType>(
  type: T,
  data: PlatformEventData[T],
  who: string,
): { subject: string; body?: string } {
  const subject = `reported that ${who} ${PLATFORM_EVENT_LABEL[type]}`;
  const lines = (...parts: (string | false | undefined)[]) =>
    parts.filter(Boolean).join("\n") || undefined;
  switch (type) {
    case "organization.created": {
      const event = data as PlatformEventData["organization.created"];
      return {
        subject,
        body: lines(`Organisation: ${event.name}`, event.website),
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
        subject: `${subject} with ${formatMoney(inr(event.amount_paise), { fractions: event.amount_paise % 100 !== 0 })}`,
        body: lines(
          event.is_first && "First top-up",
          method && `Paid by ${method}`,
        ),
      };
    }
    case "campaign.submitted":
    case "campaign.live": {
      const event = data as PlatformEventData["campaign.live"];
      return {
        subject: event.title ? `${subject}, “${event.title}”` : subject,
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

export async function accountForOrg(ctx: QueryCtx, orgId: string) {
  return await ctx.db
    .query("accounts")
    .withIndex("by_platform_org", (q) => q.eq("platformOrgId", orgId))
    .first();
}

async function personByPlatformUser(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("people")
    .withIndex("by_platform_user", (q) => q.eq("platformUserId", userId))
    .first();
}

async function personByEmail(ctx: QueryCtx, email: string) {
  const people = await ctx.db
    .query("people")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();
  return people.find((person) => !person.archivedAt) ?? null;
}

async function accountByDomain(ctx: QueryCtx, domain: string | null) {
  if (!domain) return null;
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_domain", (q) => q.eq("domain", domain))
    .collect();
  return accounts.find((account) => !account.archivedAt) ?? null;
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

function signupData(event: Doc<"platformEvents"> | null) {
  if (!event) return null;
  const parsed = parseEventData("user.signed_up", JSON.parse(event.payload));
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

async function reachedStage(ctx: QueryCtx, orgId: string) {
  const events = await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return furthestStage(
    events
      .filter((event) => event.processedAt && isPlatformEvent(event.type))
      .map((event) => EVENT_STAGE[event.type as PlatformEventType]),
  );
}

/** Moves the account along the path for this event and records the activity. */
async function touchAccount(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  event: Doc<"platformEvents">,
  patch: Partial<Doc<"accounts">> = {},
): Promise<StageChange> {
  const type = event.type as PlatformEventType;
  const target = EVENT_STAGE[type];
  const activity = ACTIVITY_EVENTS.includes(type);
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
  return stage && stage !== account.stage
    ? { from: account.stage, to: stage }
    : null;
}

type Outcome = { status: "processed" | "pending" } | { error: string };

async function onSignedUp(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData["user.signed_up"],
): Promise<Outcome> {
  const domainAccount = await accountByDomain(ctx, emailDomain(data.email));
  const known =
    (await personByPlatformUser(ctx, data.user_id)) ??
    (data.email ? await personByEmail(ctx, data.email) : null);

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
    const change = account ? await touchAccount(ctx, account, event) : null;
    await log(
      ctx,
      { personId: person._id, accountId: account?._id },
      event,
      describeEvent(event.type as "user.signed_up", data, fullName(person)),
      change,
    );
    return { status: "processed" };
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
  }
  const change = domainAccount
    ? await touchAccount(ctx, domainAccount, event)
    : null;
  await log(
    ctx,
    { leadId, accountId: domainAccount?._id },
    event,
    describeEvent(event.type as "user.signed_up", data, name),
    change,
  );
  return { status: "processed" };
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

  let account = await accountForOrg(ctx, data.org_id);
  let created = false;
  if (!account) {
    const unlinked = (candidate: Doc<"accounts"> | null) =>
      candidate && !candidate.archivedAt && !candidate.platformOrgId
        ? candidate
        : null;
    account =
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
        stage: EVENT_STAGE["organization.created"]!,
        tags: [],
        platformOrgId: data.org_id,
        lastActivityAt: event.occurredAt,
        updatedAt: now,
      });
      account = (await ctx.db.get(accountId))!;
      created = true;
      await notify(ctx, ownerId, {
        kind: "platform_org",
        title: `New on Hypedrive: ${data.name}`,
        body: "Organisation created on the platform",
        href: `/accounts/${accountId}`,
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
  }
  if (created) {
    const entry = await logSystem(
      ctx,
      { accountId: account._id },
      "created the account",
    );
    await ctx.db.patch(entry, { occurredAt: event.occurredAt });
  }
  const change = created ? null : await touchAccount(ctx, account, event);
  await log(
    ctx,
    { accountId: account._id, personId: person?._id },
    event,
    describeEvent(event.type as "organization.created", data, account.name),
    change,
  );
  return { status: "processed" };
}

async function onOrgEvent(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  type: Exclude<PlatformEventType, "user.signed_up" | "organization.created">,
  data: PlatformEventData[typeof type],
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
  const change = await touchAccount(ctx, account, event, patch);
  await log(
    ctx,
    { accountId: account._id },
    event,
    describeEvent(type, data, account.name),
    change,
  );
  return { status: "processed" };
}

async function dispatch(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  type: PlatformEventType,
  data: PlatformEventData[PlatformEventType],
): Promise<Outcome> {
  switch (type) {
    case "user.signed_up":
      return onSignedUp(ctx, event, data as PlatformEventData[typeof type]);
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
    default:
      return onOrgEvent(ctx, event, type, data as never);
  }
}

async function settle(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
): Promise<ReceiveResult> {
  if (!isPlatformEvent(event.type)) {
    await ctx.db.patch(event._id, { error: UNKNOWN_TYPE });
    return { status: "parked", error: UNKNOWN_TYPE };
  }
  const parsed = parseEventData(event.type, JSON.parse(event.payload));
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
  }
  return { status: outcome.status };
}

/** Events that arrived before their org was known, processed in the order they happened. */
async function replayOrg(
  ctx: MutationCtx,
  orgId: string,
  skip: Id<"platformEvents">,
) {
  const waiting = await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .filter((q) =>
      q.and(
        q.eq(q.field("processedAt"), undefined),
        q.eq(q.field("error"), undefined),
      ),
    )
    .collect();
  for (const event of waiting) {
    if (event._id !== skip) await settle(ctx, event);
  }
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
    orgId: id(envelope.data.org_id),
    userId: id(envelope.data.user_id) ?? id(envelope.data.created_by),
    occurredAt: envelope.occurredAt,
    payload: tooLarge ? "{}" : payload,
    error: tooLarge ? "payload too large" : undefined,
  });
  if (tooLarge) return { status: "parked", error: "payload too large" };
  return await settle(ctx, (await ctx.db.get(eventDoc))!);
}

/** Re-runs parked and waiting events, e.g. after support for a new event type ships. */
export async function retry(ctx: MutationCtx, events: Doc<"platformEvents">[]) {
  const results: ReceiveResult[] = [];
  for (const event of events) {
    if (event.processedAt) continue;
    const fresh = (await ctx.db.get(event._id))!;
    if (fresh.processedAt) continue;
    await ctx.db.patch(event._id, { error: undefined });
    results.push(await settle(ctx, { ...fresh, error: undefined }));
  }
  return results;
}

export type PlatformStep = {
  stage: LifecycleStage;
  at: number | null;
  done: boolean;
};

/** Activation milestones and usage totals derived from an org's processed events. */
export function platformMetrics(
  events: Doc<"platformEvents">[],
  stage: LifecycleStage,
  signedUpAt: number | null,
) {
  const first = new Map<LifecycleStage, number>();
  if (signedUpAt !== null) first.set("signed_up", signedUpAt);
  let deposits = 0;
  let topups = 0;
  let lastEventAt: number | null = signedUpAt;
  const campaigns = new Set<string>();
  for (const event of events) {
    if (!event.processedAt || !isPlatformEvent(event.type)) continue;
    lastEventAt = Math.max(lastEventAt ?? 0, event.occurredAt);
    const target = EVENT_STAGE[event.type];
    if (target && (first.get(target) ?? Infinity) > event.occurredAt) {
      first.set(target, event.occurredAt);
    }
    const data = JSON.parse(event.payload) as Record<string, unknown>;
    if (event.type === "wallet.topup_succeeded") {
      topups += 1;
      deposits += typeof data.amount_paise === "number" ? data.amount_paise : 0;
    }
    if (
      event.type === "campaign.live" &&
      typeof data.campaign_id === "string"
    ) {
      campaigns.add(data.campaign_id);
    }
  }
  const current = PATH.indexOf(stage);
  const beyond = stage === "expanding";
  const steps: PlatformStep[] = PATH.map((step, index) => {
    const at = first.get(step) ?? null;
    return {
      stage: step,
      at,
      done: at !== null || beyond || (current >= 0 && index <= current),
    };
  });
  return {
    steps,
    deposits: inr(deposits),
    topups,
    campaignsLive: campaigns.size,
    lastEventAt,
  };
}
