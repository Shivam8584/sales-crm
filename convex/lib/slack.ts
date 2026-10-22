import { internal } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import {
  clampText,
  redactBlocks,
  redactContacts,
  type SlackBlock,
  type SlackEventId,
  type SlackEventPayload,
} from "../../lib/domain/slack";
import { rateLimiter } from "./rateLimiter";
import { getSecret } from "./secrets";

export type SlackPost = {
  /** A channel ID or `#name`; defaults to the event's route, then the workspace default. */
  channel?: string;
  text: string;
  blocks?: SlackBlock[];
  /** Applies that event's on/off switch and channel. */
  event?: SlackEventId;
};

export type SlackResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_connected"
        | "disabled"
        | "no_channel"
        | "rate_limited"
        | "failed";
      error?: string;
    };

const API = "https://slack.com/api/chat.postMessage";
const ATTEMPTS = 3;
const BACKOFF_MS = 500;
const MAX_WAIT_MS = 10_000;
const TIMEOUT_MS = 8000;
const RETRYABLE = new Set([
  "ratelimited",
  "internal_error",
  "fatal_error",
  "service_unavailable",
  "request_timeout",
]);

type Attempt =
  | { ok: true }
  | { ok: false; error: string; retry: boolean; waitMs?: number };

const fromStatus = (response: Response, error: string): Attempt => {
  const seconds = Number(response.headers.get("Retry-After"));
  return {
    ok: false,
    error,
    retry: response.status === 429 || response.status >= 500,
    waitMs: seconds > 0 ? Math.min(seconds * 1000, MAX_WAIT_MS) : undefined,
  };
};

async function attemptBot(token: string, body: object): Promise<Attempt> {
  const response = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return fromStatus(response, `http_${response.status}`);
  const data = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
  } | null;
  if (data?.ok) return { ok: true };
  const error = typeof data?.error === "string" ? data.error : "bad_response";
  return { ok: false, error, retry: RETRYABLE.has(error) };
}

async function attemptWebhook(url: string, body: object): Promise<Attempt> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.ok
    ? { ok: true }
    : fromStatus(response, `http_${response.status}`);
}

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Posts to Slack through the bot token, else the webhook. Never throws and never puts the
 * token or webhook URL in an error; email addresses and phone numbers are masked first.
 */
export async function postToSlack(
  ctx: ActionCtx,
  post: SlackPost,
): Promise<SlackResult> {
  const [token, webhook] = await Promise.all([
    getSecret(ctx, "SLACK_BOT_TOKEN"),
    getSecret(ctx, "SLACK_WEBHOOK_URL"),
  ]);
  if (!token && !webhook) return { ok: false, reason: "not_connected" };
  if (!token && !webhook?.startsWith("https://")) {
    return { ok: false, reason: "failed", error: "webhook_must_be_https" };
  }

  const target = await ctx.runQuery(internal.slack.target, {
    event: post.event,
  });
  if (!target.enabled) return { ok: false, reason: "disabled" };
  const channel = post.channel ?? target.channel;
  if (token && !channel) return { ok: false, reason: "no_channel" };

  const { ok } = await rateLimiter.limit(ctx, "slack");
  if (!ok) return { ok: false, reason: "rate_limited" };

  const text = clampText(redactContacts(post.text));
  const blocks = post.blocks && redactBlocks(post.blocks);
  const body = token
    ? { channel, text, blocks, unfurl_links: false, unfurl_media: false }
    : { text, blocks };

  let last = "unknown";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let result: Attempt;
    try {
      result = token
        ? await attemptBot(token, body)
        : await attemptWebhook(webhook!, body);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.name : "network_error",
        retry: true,
      };
    }
    if (result.ok) {
      await ctx.runMutation(internal.slack.record, { ok: true });
      return { ok: true };
    }
    last = result.error;
    if (!result.retry || attempt === ATTEMPTS) break;
    await wait(result.waitMs ?? BACKOFF_MS * 2 ** (attempt - 1));
  }
  console.error("Slack post failed:", last);
  await ctx.runMutation(internal.slack.record, { ok: false, error: last });
  return { ok: false, reason: "failed", error: last };
}

/** Queues a Slack message for an event, but only when an admin has switched that event on. */
export async function slackEvent(
  ctx: MutationCtx,
  event: SlackEventId,
  payload: SlackEventPayload,
) {
  const route = await ctx.db
    .query("slackRoutes")
    .withIndex("by_event", (q) => q.eq("event", event))
    .unique();
  if (!route?.enabled) return;
  await ctx.scheduler.runAfter(0, internal.slack.deliver, {
    event,
    ...payload,
  });
}
