import { v } from "convex/values";
import { api } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  SLACK_EVENTS,
  isSlackEvent,
  normalizeChannel,
  slackEventMessage,
} from "../lib/domain/slack";
import { invalid } from "./lib/errors";
import { adminMutation, adminQuery } from "./lib/functions";
import { siteUrl } from "./lib/http";
import { postToSlack, type SlackResult } from "./lib/slack";
import { getSecret } from "./lib/secrets";

const DEFAULT_CHANNEL = "slack.defaultChannel";
const LAST_POST = "slack.lastPost";

async function read(ctx: QueryCtx, key: string) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.value ?? null;
}

async function write(ctx: MutationCtx, key: string, value: string | null) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (value === null) {
    if (row) await ctx.db.delete(row._id);
  } else if (row) {
    await ctx.db.patch(row._id, { value });
  } else {
    await ctx.db.insert("settings", { key, value });
  }
}

function routeFor(ctx: QueryCtx, event: string) {
  return ctx.db
    .query("slackRoutes")
    .withIndex("by_event", (q) => q.eq("event", event))
    .unique();
}

/** Where a post goes: the event's switch and channel, else the workspace default. */
export const target = internalQuery({
  args: { event: v.optional(v.string()) },
  handler: async (ctx, { event }) => {
    const route = event ? await routeFor(ctx, event) : null;
    return {
      enabled: !event || route?.enabled === true,
      channel:
        route?.channel ?? (await read(ctx, DEFAULT_CHANNEL)) ?? undefined,
    };
  },
});

export const record = internalMutation({
  args: { ok: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, { ok, error }) =>
    await write(ctx, LAST_POST, JSON.stringify({ at: Date.now(), ok, error })),
});

export const deliver = internalAction({
  args: {
    event: v.string(),
    name: v.string(),
    detail: v.optional(v.string()),
    path: v.optional(v.string()),
  },
  handler: async (ctx, { event, ...payload }): Promise<void> => {
    if (!isSlackEvent(event)) return;
    await postToSlack(ctx, {
      event,
      ...slackEventMessage(event, payload, siteUrl()),
    });
  },
});

export const status = adminQuery({
  args: {},
  handler: async (ctx) => {
    const [bot, webhook, channel, last] = await Promise.all([
      getSecret(ctx, "SLACK_BOT_TOKEN"),
      getSecret(ctx, "SLACK_WEBHOOK_URL"),
      read(ctx, DEFAULT_CHANNEL),
      read(ctx, LAST_POST),
    ]);
    const routes = await ctx.db.query("slackRoutes").take(SLACK_EVENTS.length);
    return {
      mode: bot ? ("bot" as const) : webhook ? ("webhook" as const) : null,
      defaultChannel: channel,
      routes: SLACK_EVENTS.map((event) => {
        const route = routes.find((row) => row.event === event.id);
        return {
          ...event,
          enabled: route?.enabled ?? false,
          channel: route?.channel ?? null,
        };
      }),
      last: last
        ? (JSON.parse(last) as { at: number; ok: boolean; error?: string })
        : null,
    };
  },
});

function channelOrNull(raw: string | undefined) {
  if (!raw?.trim()) return null;
  const checked = normalizeChannel(raw);
  if (!checked.ok) invalid("channel", checked.error);
  return checked.value;
}

export const setDefaultChannel = adminMutation({
  args: { channel: v.string() },
  handler: async (ctx, { channel }) =>
    await write(ctx, DEFAULT_CHANNEL, channelOrNull(channel)),
});

export const setRoute = adminMutation({
  args: {
    event: v.string(),
    enabled: v.boolean(),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, { event, enabled, channel }) => {
    if (!isSlackEvent(event)) invalid("event", "Unknown event");
    const fields = { enabled, channel: channelOrNull(channel) ?? undefined };
    const row = await routeFor(ctx, event);
    if (row) await ctx.db.replace(row._id, { event, ...fields });
    else await ctx.db.insert("slackRoutes", { event, ...fields });
  },
});

export const sendTest = action({
  args: {},
  handler: async (ctx): Promise<SlackResult> => {
    await ctx.runQuery(api.slack.status, {});
    return await postToSlack(ctx, {
      text: "Test message from the CRM. Slack is connected.",
    });
  },
});
