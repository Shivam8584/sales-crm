import { v } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { LifecycleStage } from "../lib/domain/enums";
import { gstinCheckChar } from "../lib/domain/gstin";
import { accountHealth } from "../lib/domain/health";
import {
  ACTIVATION_STAGES,
  eventStage,
  marketplaceLabel,
  pathIndex,
  type ActivationStage,
  type PlatformEventData,
  type PlatformEventType,
} from "../lib/domain/platform";
import { platformState } from "../lib/domain/platform-state";
import { syncAccountActivation } from "./lib/activation";
import { demoEmail } from "./lib/demo";
import { fail } from "./lib/errors";
import { adminQuery, internalMutation, memberQuery } from "./lib/functions";
import { json, parseJsonObject, readBody, verifyHmac } from "./lib/http";
import {
  accountForOrg,
  furthestStage,
  healthInput,
  latestSnapshot,
  parseEnvelope,
  platformMetrics,
  receive,
  retry,
  signupEvent,
  stateEvents,
  type Envelope,
} from "./lib/platform";
import { platformMode } from "./lib/platformClient";
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
  version: v.optional(v.number()),
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
    await ctx.db.insert("platformEvents", {
      eventId: envelope.eventId,
      type: envelope.type,
      ...refs(envelope.data),
      occurredAt: envelope.occurredAt,
      payload: JSON.stringify(envelope.data),
      ...(envelope.version === undefined ? {} : { v: envelope.version }),
      error: error.slice(0, 500),
    });
  },
});

/**
 * `POST /webhooks/platform`: signed events from the Hypedrive backend.
 * 200 processed, duplicate or ignored; 202 stored for later (unknown org, user
 * or type, bad payload, unsupported version).
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
    if (
      result.status === "duplicate" ||
      result.status === "processed" ||
      result.status === "ignored"
    ) {
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

const money = (amount: number) => ({ amount, currency: "INR" as const });

export const forAccount = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await requireAccount(ctx, accountId);
    const orgId = account.platformOrgId;
    if (!orgId) return { orgId: null };
    const now = Date.now();
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
    const metrics = platformMetrics(
      events,
      account.stage,
      signup?.processedAt ? signup.occurredAt : null,
      now,
    );
    const snapshot = await latestSnapshot(ctx, accountId);
    const input = healthInput(account, stateEvents(events), snapshot, now);
    const listings = snapshot?.listings ?? [];
    const markets = new Map(
      listings.map((item) => [item.marketplace, item.count]),
    );
    for (const item of metrics.state.listings) {
      if (!markets.has(item.slug)) markets.set(item.slug, 1);
    }
    return {
      steps: metrics.steps,
      deposits: metrics.deposits,
      topups: metrics.topups,
      campaignsLive: metrics.campaignsLive,
      lastEventAt: metrics.lastEventAt,
      orgId,
      health: accountHealth(input),
      wallet: {
        status: input.wallet,
        balance: input.balancePaise === null ? null : money(input.balancePaise),
        held:
          snapshot?.heldPaise === undefined ? null : money(snapshot.heldPaise),
        creditLimit:
          snapshot?.creditLimitPaise === undefined
            ? null
            : money(snapshot.creditLimitPaise),
      },
      campaigns: input.campaigns,
      deposits30d: money(input.deposits30dPaise),
      deposits90d: money(input.deposits90dPaise),
      reviews: {
        count: input.staleReviews,
        oldestDays: input.oldestReviewDays,
      },
      disputes: input.disputes,
      marketplaces: [...markets].map(([slug, count]) => ({
        slug,
        label: marketplaceLabel(slug),
        count,
      })),
      members: snapshot ? snapshot.members.length : null,
      snapshot: snapshot
        ? {
            fetchedAt: snapshot.fetchedAt,
            source: snapshot.source,
            error: snapshot.error ?? null,
            attemptedAt: snapshot.attemptedAt ?? null,
          }
        : null,
      syncMode: platformMode(process.env),
    };
  },
});

/** Health score and band for every linked account, keyed by account id; for list columns and badges. */
function eventStatus(event: Doc<"platformEvents">) {
  if (event.ignored) return "ignored" as const;
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
      error: event.error ?? event.ignored ?? null,
    }));
  },
});

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

/** Situations the simulator can put a brand in, each one a v2 stall rule or expansion signal. */
export const SCENARIOS = [
  "gst_failed",
  "paused_no_funds",
  "low_balance",
  "negative_balance",
  "review_backlog",
  "review_escalation",
  "changes_requested",
  "renewal",
  "expansion",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** The furthest step a scenario needs the brand to have reached first. */
const SCENARIO_STAGE: Record<Scenario, ActivationStage> = {
  gst_failed: "signed_up",
  paused_no_funds: "live",
  low_balance: "live",
  negative_balance: "live",
  review_backlog: "live",
  review_escalation: "live",
  changes_requested: "funded",
  renewal: "activated",
  expansion: "activated",
};

type Draft = {
  [T in PlatformEventType]: { type: T; data: PlatformEventData[T] };
}[PlatformEventType];
type Timed = Draft & { ago: number };

type ScenarioContext = {
  orgId: string;
  userId: string;
  campaigns: { id: string; title: string }[];
  domain?: string;
};

function scenarioDrafts(scenario: Scenario, context: ScenarioContext): Timed[] {
  const { orgId, userId } = context;
  const [first, second] = context.campaigns;
  const campaign = (
    target: { id: string; title: string },
    from: PlatformEventData["campaign.status_changed"]["from"],
    to: PlatformEventData["campaign.status_changed"]["to"],
    ago: number,
    extra: Partial<PlatformEventData["campaign.status_changed"]> = {},
  ): Timed => ({
    type: "campaign.status_changed",
    data: {
      org_id: orgId,
      campaign_id: target.id,
      title: target.title,
      from,
      to,
      ...extra,
    },
    ago,
  });
  switch (scenario) {
    case "gst_failed":
      return [
        {
          type: "organization.gst_failed",
          data: {
            user_id: userId,
            gstin: demoGstin(),
            reason: "GSTIN is cancelled on the GST portal",
          },
          ago: 20 * HOUR,
        },
      ];
    case "paused_no_funds":
      return [
        {
          type: "wallet.low_balance",
          data: { org_id: orgId, balance_paise: 310_000 },
          ago: 30 * HOUR,
        },
        campaign(first, "live", "paused", 9 * HOUR, {
          pause_reason: "insufficient_funds",
        }),
        {
          type: "wallet.topup_succeeded",
          data: {
            org_id: orgId,
            amount_paise: 2_500_000,
            method: "upi",
            is_first: false,
          },
          ago: 3 * HOUR,
        },
      ];
    case "low_balance":
      return [
        {
          type: "wallet.low_balance",
          data: { org_id: orgId, balance_paise: 320_000 },
          ago: 6 * HOUR,
        },
      ];
    case "negative_balance":
      return [
        {
          type: "wallet.negative",
          data: { org_id: orgId, balance_paise: -125_000 },
          ago: 5 * HOUR,
        },
      ];
    case "review_backlog":
    case "review_escalation":
      return [
        {
          type: "enrollment.review_overdue",
          data: {
            org_id: orgId,
            campaign_id: first.id,
            title: first.title,
            count: scenario === "review_backlog" ? 4 : 9,
            oldest_days: scenario === "review_backlog" ? 5 : 16,
          },
          ago: 2 * HOUR,
        },
      ];
    case "changes_requested": {
      const target = { id: platformId("cmp"), title: "Festive push" };
      return [
        campaign(target, "draft", "pending_review", 5 * DAY),
        campaign(target, "pending_review", "changes_requested", 3 * DAY),
      ];
    }
    case "renewal":
      return context.campaigns.map((item, index) =>
        campaign(item, "live", "ended", (9 + index) * DAY),
      );
    case "expansion":
      return [
        {
          type: "listing.created",
          data: {
            org_id: orgId,
            listing_id: platformId("lst"),
            platform_slug: "flipkart",
            name: "Bestseller combo pack",
          },
          ago: 4 * DAY,
        },
        {
          type: "member.joined",
          data: {
            org_id: orgId,
            user_id: platformId("usr"),
            role: "campaign_manager",
            name: "Rhea Kapoor",
            email: context.domain
              ? demoEmail("rhea", context.domain)
              : undefined,
          },
          ago: 2 * DAY,
        },
        {
          type: "campaign.slots_filled",
          data: {
            org_id: orgId,
            campaign_id: (second ?? first).id,
            title: (second ?? first).title,
            max_enrollments: 40,
            waiting: 12,
          },
          ago: 20 * HOUR,
        },
      ];
  }
}

/**
 * Feeds the events that walk one account up to `until` through the webhook
 * path, skipping steps it already has, then the events of a `scenario`.
 */
export async function simulateAccount(
  ctx: Parameters<typeof receive>[0],
  account: Doc<"accounts">,
  until: ActivationStage,
  scenario?: Scenario,
) {
  const need = scenario ? SCENARIO_STAGE[scenario] : until;
  const target = Math.max(pathIndex(until), pathIndex(need));
  if (target < 0) fail("invalid", `${until} is not on the activation path`);

  const orgId = account.platformOrgId ?? platformId("org");
  const existing = account.platformOrgId
    ? await ctx.db
        .query("platformEvents")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()
    : [];
  const processed = stateEvents(existing);
  const reached = pathIndex(
    furthestStage(processed.map((event) => eventStage(event.type, event.data))),
  );
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
  const now = Date.now();
  const campaigns = platformState(processed, now).campaigns.map((item) => ({
    id: item.id,
    title: item.title ?? "Campaign",
  }));

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
  const orgStep = scenario === "gst_failed" ? Infinity : 1;
  if (target >= orgStep && reached < 1) {
    drafts.push({
      type: "organization.created",
      data: {
        org_id: orgId,
        created_by: userId,
        name: account.name,
        website: account.domain ? `https://${account.domain}` : undefined,
        gstin: account.gstin ?? demoGstin(),
        legal_name: `${account.name} Private Limited`,
        is_demo: false,
      },
    });
  }
  if (target >= 2 && reached < 2) {
    const count = target >= 4 ? 3 : 1;
    for (let index = 0; index < count; index++) {
      const amount = pick([10_000, 25_000, 50_000, 100_000]) * 100;
      drafts.push(
        index % 2 === 0
          ? {
              type: "wallet.topup_succeeded",
              data: {
                org_id: orgId,
                amount_paise: amount,
                method: pick(["upi", "card", "netbanking"]),
                is_first: index === 0,
              },
            }
          : {
              type: "wallet.deposit_received",
              data: {
                org_id: orgId,
                amount_paise: amount,
                utr: `UTIB${Math.floor(1e11 + Math.random() * 9e11)}`,
                is_first: false,
              },
            },
      );
    }
  }
  if (target >= 3 && reached < 3) {
    const count = target >= 4 ? 2 : 1;
    for (let index = 0; index < count; index++) {
      const item = {
        id: platformId("cmp"),
        title:
          CAMPAIGN_TITLES[(campaigns.length + index) % CAMPAIGN_TITLES.length],
      };
      campaigns.push(item);
      const base = { org_id: orgId, campaign_id: item.id, title: item.title };
      drafts.push(
        {
          type: "campaign.status_changed",
          data: { ...base, from: "draft", to: "pending_review" },
        },
        {
          type: "campaign.status_changed",
          data: { ...base, from: "pending_review", to: "live" },
        },
      );
      if (target >= 4 && index === 0) {
        drafts.push({
          type: "enrollment.approved",
          data: {
            ...base,
            platform_fee_paise: 4900,
            is_first_for_org: true,
          },
        });
      }
    }
  }

  const extra = scenario
    ? scenarioDrafts(scenario, {
        orgId,
        userId,
        campaigns,
        domain: account.domain,
      })
    : [];

  // Scenario events land at fixed ages; the path before them is spread over the
  // days just before. Without one, advancing a brand that already has history
  // lands its last step within the hour, so it reads as having just moved on.
  const latest = Math.max(0, ...existing.map((event) => event.occurredAt));
  const floor = extra.length
    ? now - Math.max(...extra.map((item) => item.ago)) - HOUR
    : null;
  const from = floor
    ? Math.max(latest, floor - (drafts.length * 2 + 1) * DAY)
    : latest || now - (drafts.length * 2 + 1) * DAY;
  const end = floor
    ? floor
    : latest
      ? Math.max(from, now - (5 + Math.random() * 50) * 60_000)
      : now - (now - from) / (drafts.length + 1);
  const step = (end - from) / Math.max(1, drafts.length);
  const timed = [
    ...drafts.map((draft, index) => ({
      draft,
      at: Math.round(
        from +
          (index + 1) * step -
          (latest || floor ? 0 : Math.random() * step * 0.4),
      ),
    })),
    ...extra.map(({ ago, ...draft }) => ({
      draft: draft as Draft,
      at: now - ago,
    })),
  ];

  const results = [];
  for (const { draft, at } of timed) {
    const envelope: Envelope = {
      eventId: platformId("evt"),
      type: draft.type,
      occurredAt: at,
      data: draft.data as Record<string, unknown>,
    };
    results.push({ type: draft.type, ...(await receive(ctx, envelope)) });
  }
  return { accountId: account._id, name: account.name, orgId, results };
}

/**
 * Local demo data: feeds realistic events through the same path as the webhook.
 * `npx convex run platform:simulate '{"accountId":"…","until":"funded"}'`, add
 * `"scenario":"paused_no_funds"` (see SCENARIOS) to stage a stall or expansion
 * signal, or no args to walk every account on the path up to its current stage.
 */
export const simulate = internalMutation({
  args: {
    accountId: v.optional(v.id("accounts")),
    until: v.optional(literals(ACTIVATION_STAGES)),
    scenario: v.optional(literals(SCENARIOS)),
  },
  handler: async (ctx, { accountId, until, scenario }) => {
    if (accountId) {
      const account = await ctx.db.get(accountId);
      if (!account) fail("not_found", "Account not found");
      const result = await simulateAccount(
        ctx,
        account,
        until ?? (scenario ? SCENARIO_STAGE[scenario] : "activated"),
        scenario,
      );
      await syncAccountActivation(ctx, account._id, Date.now());
      return [result];
    }
    const accounts = await ctx.db.query("accounts").collect();
    const results = [];
    for (const account of accounts) {
      if (account.archivedAt) continue;
      const stage: LifecycleStage =
        account.stage === "expanding" ? "activated" : account.stage;
      if (pathIndex(stage) < 0) continue;
      const fresh = (await ctx.db.get(account._id))!;
      results.push(
        await simulateAccount(
          ctx,
          fresh,
          until ?? ACTIVATION_STAGES[pathIndex(stage)],
        ),
      );
      await syncAccountActivation(ctx, account._id, Date.now());
    }
    return results;
  },
});
