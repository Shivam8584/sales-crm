import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { LifecycleStage } from "../lib/domain/enums";
import { gstinCheckChar } from "../lib/domain/gstin";
import {
  ACTIVATION_STAGES,
  type PlatformEventData,
  type PlatformEventType,
} from "../lib/domain/platform";
import { syncAccountActivation } from "./lib/activation";
import { fail } from "./lib/errors";
import { adminQuery, memberQuery } from "./lib/functions";
import { json, parseJsonObject, readBody, verifyHmac } from "./lib/http";
import {
  accountForOrg,
  parseEnvelope,
  platformMetrics,
  receive,
  retry,
  signupEvent,
  type Envelope,
} from "./lib/platform";
import { requireAccount } from "./lib/records";
import { literals } from "./lib/validators";

const BODY_LIMIT = 1024 * 1024;
const RECENT_LIMIT = 100;
const ORG_EVENT_LIMIT = 5000;

const vEnvelope = v.object({
  eventId: v.string(),
  type: v.string(),
  occurredAt: v.number(),
  data: v.record(v.string(), v.any()),
});

/** The CRM account an event is about: by org, or by the signed-up user's person. */
async function accountFor(
  ctx: MutationCtx,
  event: { orgId?: string; userId?: string },
): Promise<Id<"accounts"> | null> {
  if (event.orgId) {
    const account = await accountForOrg(ctx, event.orgId);
    if (account) return account._id;
  }
  if (event.userId) {
    const userId = event.userId;
    const person = await ctx.db
      .query("people")
      .withIndex("by_platform_user", (q) => q.eq("platformUserId", userId))
      .first();
    if (person?.accountId) return person.accountId;
  }
  return null;
}

// Without this, a brand that moves on keeps its stall task open until the hourly check.
async function syncActivation(
  ctx: MutationCtx,
  events: { orgId?: string; userId?: string }[],
) {
  const ids = new Set<Id<"accounts">>();
  for (const event of events) {
    const id = await accountFor(ctx, event);
    if (id) ids.add(id);
  }
  const now = Date.now();
  for (const id of ids) await syncAccountActivation(ctx, id, now);
}

const refs = (data: Record<string, unknown>) => ({
  orgId: typeof data.org_id === "string" ? data.org_id : undefined,
  userId:
    typeof data.user_id === "string"
      ? data.user_id
      : typeof data.created_by === "string"
        ? data.created_by
        : undefined,
});

export const ingest = internalMutation({
  args: { envelope: vEnvelope },
  handler: async (ctx, { envelope }) => {
    const result = await receive(ctx, envelope);
    if (result.status === "processed") {
      await syncActivation(ctx, [refs(envelope.data)]);
    }
    return result;
  },
});

/** Keeps an event whose processing threw, so it is parked rather than lost. */
export const park = internalMutation({
  args: { envelope: vEnvelope, error: v.string() },
  handler: async (ctx, { envelope, error }) => {
    const existing = await ctx.db
      .query("platformEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", envelope.eventId))
      .first();
    if (existing) return;
    const ref = (value: unknown) =>
      typeof value === "string" ? value : undefined;
    await ctx.db.insert("platformEvents", {
      eventId: envelope.eventId,
      type: envelope.type,
      orgId: ref(envelope.data.org_id),
      userId: ref(envelope.data.user_id) ?? ref(envelope.data.created_by),
      occurredAt: envelope.occurredAt,
      payload: JSON.stringify(envelope.data),
      error: error.slice(0, 500),
    });
  },
});

/**
 * `POST /webhooks/platform`: signed events from the Hypedrive backend.
 * 200 processed or duplicate, 202 stored for later (unknown org or type, bad payload).
 */
export const webhook = httpAction(async (ctx, request) => {
  const secret = process.env.PLATFORM_WEBHOOK_SECRET;
  if (!secret) {
    console.error("PLATFORM_WEBHOOK_SECRET is not set; rejecting webhook");
    return json({ ok: false, error: "Webhook not configured" }, 503);
  }
  const body = await readBody(request, BODY_LIMIT);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const signature = request.headers.get("X-Hypedrive-Signature");
  if (!(await verifyHmac(secret, body.raw, signature))) {
    return json({ ok: false, error: "Invalid signature" }, 401);
  }
  const parsed = parseJsonObject(body.raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
  const envelope = parseEnvelope(parsed.value);
  if (!envelope.ok) return json({ ok: false, error: envelope.error }, 400);

  const eventId = envelope.value.eventId;
  try {
    const result = await ctx.runMutation(internal.platform.ingest, {
      envelope: envelope.value,
    });
    if (result.status === "duplicate" || result.status === "processed") {
      return json({ ok: true, eventId, status: result.status });
    }
    return json(
      {
        ok: true,
        eventId,
        status: result.status,
        ...("error" in result ? { error: result.error } : {}),
      },
      202,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Platform event ${eventId} failed: ${message}`);
    await ctx.runMutation(internal.platform.park, {
      envelope: envelope.value,
      error: `processing failed: ${message}`,
    });
    return json({ ok: true, eventId, status: "parked" }, 202);
  }
});

/** Re-runs every parked or waiting event, e.g. after support for a new type ships. */
export const retryParked = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("platformEvents")
      .filter((q) => q.eq(q.field("processedAt"), undefined))
      .collect();
    const results = await retry(ctx, events);
    await syncActivation(ctx, events);
    return results.reduce<Record<string, number>>((counts, result) => {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      return counts;
    }, {});
  },
});

export const forAccount = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await requireAccount(ctx, accountId);
    const orgId = account.platformOrgId;
    if (!orgId) return { orgId: null };
    const events = await ctx.db
      .query("platformEvents")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(ORG_EVENT_LIMIT);
    const created = events.find(
      (event) => event.type === "organization.created" && event.processedAt,
    );
    const signup = created?.userId
      ? await signupEvent(ctx, created.userId)
      : null;
    return {
      orgId,
      ...platformMetrics(
        events,
        account.stage,
        signup?.processedAt ? signup.occurredAt : null,
      ),
    };
  },
});

function eventStatus(event: Doc<"platformEvents">) {
  if (event.processedAt) return "processed" as const;
  if (event.error) return "parked" as const;
  return "pending" as const;
}

/** The latest events with their processing status, for debugging the integration. */
export const recentEvents = adminQuery({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("platformEvents")
      .order("desc")
      .take(RECENT_LIMIT);
    return events.map((event) => ({
      _id: event._id,
      eventId: event.eventId,
      type: event.type,
      orgId: event.orgId ?? null,
      userId: event.userId ?? null,
      occurredAt: event.occurredAt,
      receivedAt: event._creationTime,
      status: eventStatus(event),
      error: event.error ?? null,
    }));
  },
});

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";
const DAY_MS = 24 * 60 * 60 * 1000;

function platformId(prefix: string) {
  let body = "";
  for (let index = 0; index < 26; index++) {
    body += CROCKFORD[Math.floor(Math.random() * CROCKFORD.length)];
  }
  return `${prefix}_${body}`;
}

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function demoGstin() {
  const letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const state = pick(["07", "09", "27", "29", "33", "36"]);
  const pan =
    Array.from({ length: 3 }, () => pick([...letters])).join("") +
    "C" +
    pick([...letters]) +
    String(1000 + Math.floor(Math.random() * 9000)) +
    pick([...letters]);
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckChar(first14);
}

const CAMPAIGN_TITLES = [
  "Launch reviews",
  "Festive push",
  "Bestseller ratings",
  "New SKU seeding",
];

type Draft = {
  [T in PlatformEventType]: { type: T; data: PlatformEventData[T] };
}[PlatformEventType];

/** Feeds the events that walk one account up to `until` through the webhook path, skipping steps it already has. */
export async function simulateAccount(
  ctx: Parameters<typeof receive>[0],
  account: Doc<"accounts">,
  until: LifecycleStage,
) {
  const target = (ACTIVATION_STAGES as readonly LifecycleStage[]).indexOf(
    until,
  );
  if (target < 0) fail("invalid", `${until} is not on the activation path`);

  const orgId = account.platformOrgId ?? platformId("org");
  const existing = account.platformOrgId
    ? await ctx.db
        .query("platformEvents")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    : [];
  const has = (type: PlatformEventType) =>
    existing.some((event) => event.type === type && event.processedAt);
  const creatorOrgEvent = existing.find(
    (event) => event.type === "organization.created",
  );

  const people = await ctx.db
    .query("people")
    .withIndex("by_account", (q) => q.eq("accountId", account._id))
    .collect();
  const person = people.find((item) => !item.archivedAt && item.email);
  const userId =
    creatorOrgEvent?.userId ?? person?.platformUserId ?? platformId("usr");

  const drafts: Draft[] = [];
  if (!(await signupEvent(ctx, userId)) && person?.email) {
    drafts.push({
      type: "user.signed_up",
      data: {
        user_id: userId,
        email: person.email,
        phone: person.phone,
        name: `${person.firstName} ${person.lastName}`.trim(),
        utm: { source: "google", medium: "cpc", campaign: "brand-search" },
      },
    });
  }
  if (target >= 1 && !has("organization.created")) {
    drafts.push({
      type: "organization.created",
      data: {
        org_id: orgId,
        created_by: userId,
        name: account.name,
        website: account.domain ? `https://${account.domain}` : undefined,
      },
    });
  }
  if (target >= 2 && !has("organization.gst_verified")) {
    drafts.push({
      type: "organization.gst_verified",
      data: {
        org_id: orgId,
        gstin: account.gstin ?? demoGstin(),
        legal_name: `${account.name} Private Limited`,
      },
    });
  }
  if (target >= 3 && !has("wallet.topup_succeeded")) {
    const topups = target >= 5 ? 3 : 1;
    for (let index = 0; index < topups; index++) {
      drafts.push({
        type: "wallet.topup_succeeded",
        data: {
          org_id: orgId,
          amount_paise: pick([10_000, 25_000, 50_000, 100_000]) * 100,
          method: pick(["upi", "va", "card"]),
          is_first: index === 0,
        },
      });
    }
  }
  if (target >= 4 && !has("campaign.live")) {
    const campaigns = target >= 5 ? 2 : 1;
    for (let index = 0; index < campaigns; index++) {
      const campaignId = platformId("cmp");
      const title = CAMPAIGN_TITLES[index % CAMPAIGN_TITLES.length];
      drafts.push(
        {
          type: "campaign.submitted",
          data: { org_id: orgId, campaign_id: campaignId, title },
        },
        {
          type: "campaign.live",
          data: { org_id: orgId, campaign_id: campaignId, title },
        },
      );
      if (target >= 5 && index === 0) {
        drafts.push({
          type: "enrollment.approved",
          data: {
            org_id: orgId,
            campaign_id: campaignId,
            platform_fee_paise: 4900,
            is_first_for_org: true,
          },
        });
      }
    }
  }

  // Advancing a brand that already has history lands its last step within the
  // hour, so it reads as having just moved on rather than as stuck again.
  const now = Date.now();
  const latest = Math.max(0, ...existing.map((event) => event.occurredAt));
  const from = latest || now - (drafts.length * 2 + 1) * DAY_MS;
  const end = latest
    ? Math.max(from, now - (5 + Math.random() * 50) * 60_000)
    : now - (now - from) / (drafts.length + 1);
  const step = (end - from) / Math.max(1, drafts.length);
  const results = [];
  for (const [index, draft] of drafts.entries()) {
    const jitter = latest ? 0 : Math.random() * step * 0.4;
    const envelope: Envelope = {
      eventId: platformId("evt"),
      type: draft.type,
      occurredAt: Math.round(from + (index + 1) * step - jitter),
      data: draft.data as Record<string, unknown>,
    };
    results.push({ type: draft.type, ...(await receive(ctx, envelope)) });
  }
  return { accountId: account._id, name: account.name, orgId, results };
}

/**
 * Local demo data: feeds realistic events through the same path as the webhook.
 * `npx convex run platform:simulate '{"accountId":"…","until":"funded"}'`, or no
 * args to walk every account on the activation path up to its current stage.
 */
export const simulate = internalMutation({
  args: {
    accountId: v.optional(v.id("accounts")),
    until: v.optional(literals(ACTIVATION_STAGES)),
  },
  handler: async (ctx, { accountId, until }) => {
    if (accountId) {
      const account = await ctx.db.get(accountId);
      if (!account) fail("not_found", "Account not found");
      const result = await simulateAccount(ctx, account, until ?? "activated");
      await syncAccountActivation(ctx, account._id, Date.now());
      return [result];
    }
    const accounts = await ctx.db.query("accounts").collect();
    const path = ACTIVATION_STAGES as readonly LifecycleStage[];
    const results = [];
    for (const account of accounts) {
      if (account.archivedAt) continue;
      const stage = account.stage === "expanding" ? "activated" : account.stage;
      if (!path.includes(stage)) continue;
      const fresh = (await ctx.db.get(account._id))!;
      results.push(await simulateAccount(ctx, fresh, until ?? stage));
      await syncAccountActivation(ctx, account._id, Date.now());
    }
    return results;
  },
});
