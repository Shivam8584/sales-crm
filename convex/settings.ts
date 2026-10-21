import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { invalid, notFound } from "./lib/errors";
import { adminMutation, adminQuery, memberQuery } from "./lib/functions";
import { retry } from "./lib/platform";
import { providerMode } from "./lib/enrichment";
import { literals } from "./lib/validators";
import {
  LEAD_SLA_MINUTES,
  PRICING_KEY_LIST,
  SETTING_KEYS,
  checkPricingSetting,
  defaultLeadSlaMinutes,
  roundRobinMemberIds,
  storedLeadSlaMinutes,
} from "./lib/settings";

const EVENT_SCAN = 2000;
const EVENT_LIST = 20;
const MAX_RETRY = 100;

/** Workspace settings with their defaults applied; `isDefault` marks values no admin has set. */
export const get = memberQuery({
  args: {},
  handler: async (ctx) => {
    const sla = await storedLeadSlaMinutes(ctx);
    const ids = await roundRobinMemberIds(ctx);
    const active = new Set(
      (
        await ctx.db
          .query("members")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .collect()
      ).map((member) => member._id),
    );
    return {
      [SETTING_KEYS.leadSlaMinutes]: sla ?? defaultLeadSlaMinutes(),
      [SETTING_KEYS.roundRobinMemberIds]: ids.filter((id) => active.has(id)),
      defaults: {
        [SETTING_KEYS.leadSlaMinutes]: defaultLeadSlaMinutes(),
      },
      isDefault: {
        [SETTING_KEYS.leadSlaMinutes]: sla === null,
        [SETTING_KEYS.roundRobinMemberIds]: ids.length === 0,
      },
    };
  },
});

async function write(ctx: MutationCtx, key: string, value: string | null) {
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
}

/**
 * Changes one whitelisted setting; `null` resets it to the default. Returns
 * the previous stored value (null when it was the default) for undo.
 */
export const set = adminMutation({
  args: {
    setting: v.union(
      v.object({
        key: v.literal(SETTING_KEYS.leadSlaMinutes),
        value: v.union(v.number(), v.null()),
      }),
      v.object({
        key: v.literal(SETTING_KEYS.roundRobinMemberIds),
        value: v.union(v.array(v.id("members")), v.null()),
      }),
      v.object({
        key: literals(PRICING_KEY_LIST),
        value: v.union(v.number(), v.null()),
      }),
    ),
  },
  handler: async (ctx, { setting }) => {
    if (
      setting.key !== SETTING_KEYS.leadSlaMinutes &&
      setting.key !== SETTING_KEYS.roundRobinMemberIds
    ) {
      const { key, value } = setting;
      const previous = await checkPricingSetting(ctx, key, value);
      await write(ctx, key, value === null ? null : String(value));
      return { key, previous };
    }

    if (setting.key === SETTING_KEYS.leadSlaMinutes) {
      const previous = await storedLeadSlaMinutes(ctx);
      const { value } = setting;
      if (
        value !== null &&
        (!Number.isInteger(value) ||
          value < LEAD_SLA_MINUTES.min ||
          value > LEAD_SLA_MINUTES.max)
      ) {
        invalid(
          "slaMinutes",
          `Enter whole minutes between ${LEAD_SLA_MINUTES.min} and ${LEAD_SLA_MINUTES.max}`,
        );
      }
      await write(ctx, setting.key, value === null ? null : String(value));
      return { key: setting.key, previous };
    }

    const stored = await roundRobinMemberIds(ctx);
    const previous = stored.length > 0 ? stored : null;
    let ids: Id<"members">[] | null = null;
    if (setting.value !== null && setting.value.length > 0) {
      ids = [...new Set(setting.value)];
      for (const id of ids) {
        const member = await ctx.db.get(id);
        if (!member || member.status !== "active") {
          invalid("roundRobinMemberIds", "Pick active teammates only");
        }
      }
    }
    await write(ctx, setting.key, ids ? JSON.stringify(ids) : null);
    return { key: setting.key, previous };
  },
});

function allowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

/** Read-only workspace facts that come from the deployment's environment. */
export const environment = adminQuery({
  args: {},
  handler: async () => ({
    allowedDomains: allowedDomains(),
    slaFromEnv: Boolean(process.env.LEAD_SLA_SECONDS),
  }),
});

function eventStatus(event: Doc<"platformEvents">) {
  if (event.processedAt) return "processed" as const;
  return event.error ? ("parked" as const) : ("pending" as const);
}

/** Integration health as booleans and public URLs only; secret values never leave the server. */
export const integrations = adminQuery({
  args: {},
  handler: async (ctx) => {
    const site = (process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "");
    const recent = await ctx.db
      .query("platformEvents")
      .order("desc")
      .take(EVENT_SCAN);
    const waiting = recent.filter((event) => !event.processedAt);
    const kyc = providerMode(process.env);
    return {
      platform: {
        secretSet: Boolean(process.env.PLATFORM_WEBHOOK_SECRET),
        endpoint: site ? `${site}/webhooks/platform` : null,
        lastReceivedAt: recent[0]?._creationTime ?? null,
        parked: waiting.filter((event) => event.error).length,
        pending: waiting.filter((event) => !event.error).length,
        capped: recent.length === EVENT_SCAN,
        waiting: waiting.slice(0, EVENT_LIST).map((event) => ({
          _id: event._id,
          eventId: event.eventId,
          type: event.type,
          orgId: event.orgId ?? null,
          occurredAt: event.occurredAt,
          receivedAt: event._creationTime,
          status: eventStatus(event),
          error: event.error ?? null,
        })),
      },
      kyc: {
        mode: kyc,
        signatureCheck: Boolean(process.env.KYC_HMAC_SECRET),
      },
      alerts: {
        slack: Boolean(process.env.ALERT_SLACK_WEBHOOK_URL),
        webhook: Boolean(process.env.ALERT_WEBHOOK_URL),
      },
      calcom: {
        secretSet: Boolean(process.env.CALCOM_WEBHOOK_SECRET),
        endpoint: site ? `${site}/webhooks/calcom` : null,
      },
      leadForm: {
        endpoint: site ? `${site}/leads` : null,
      },
    };
  },
});

/** Re-runs parked or waiting platform events: the given ones, or the latest unprocessed when none are given. */
export const retryPlatformEvents = adminMutation({
  args: { ids: v.optional(v.array(v.id("platformEvents"))) },
  handler: async (ctx, { ids }) => {
    let events: Doc<"platformEvents">[];
    if (ids) {
      events = [];
      for (const id of ids.slice(0, MAX_RETRY)) {
        const event = await ctx.db.get(id);
        if (!event) notFound("Event");
        events.push(event);
      }
    } else {
      events = (
        await ctx.db.query("platformEvents").order("desc").take(EVENT_SCAN)
      )
        .filter((event) => !event.processedAt)
        .slice(0, MAX_RETRY);
    }
    events.sort((a, b) => a.occurredAt - b.occurredAt);
    const results = await retry(ctx, events);
    const counts = { processed: 0, pending: 0, parked: 0, duplicate: 0 };
    for (const result of results) counts[result.status] += 1;
    return counts;
  },
});
