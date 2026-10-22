import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  httpAction,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import type { CallOutcome } from "../lib/domain/enums";
import { callMinutes } from "../lib/domain/calls";
import { normalizePhone } from "../lib/domain/normalize";
import { fail } from "./lib/errors";
import { getViewer, internalMutation, memberQuery } from "./lib/functions";
import { json, readJson, timingSafeEqual } from "./lib/http";
import { resolveMerged } from "./lib/merged";
import { sha256Hex } from "./lib/crypto";
import { rateLimiter } from "./lib/rateLimiter";
import { getSecret, secretEnv } from "./lib/secrets";
import { touchRecords } from "./lib/tasks";
import { vCallOutcome } from "./lib/validators";

const vTarget = v.union(
  v.object({ personId: v.id("people") }),
  v.object({ leadId: v.id("leads") }),
);

const BODY_LIMIT = 64 * 1024;
const MAX_URL = 500;

async function exotel(ctx: QueryCtx | ActionCtx) {
  const secrets = await secretEnv(ctx);
  const env = (name: string) => secrets[name]?.trim() ?? "";
  const config = {
    sid: env("EXOTEL_SID"),
    key: env("EXOTEL_API_KEY"),
    token: env("EXOTEL_API_TOKEN"),
    host: env("EXOTEL_SUBDOMAIN"),
    callerId: env("EXOTEL_CALLER_ID"),
    secret: env("EXOTEL_WEBHOOK_SECRET"),
    site: (process.env.CONVEX_SITE_URL?.trim() ?? "").replace(/\/$/, ""),
  };
  const ready =
    Object.values(config).every(Boolean) &&
    /^[a-z0-9-]+(\.[a-z0-9-]+)*\.exotel\.com$/i.test(config.host);
  return ready ? config : null;
}

/** Whether the provider is set up on this server. */
export const configured = memberQuery({
  args: {},
  handler: async (ctx) => (await exotel(ctx)) !== null,
});

/** Whether the viewer can start a call from the CRM: provider set up and their own phone saved. */
export const enabled = memberQuery({
  args: {},
  handler: async (ctx) =>
    (await exotel(ctx)) !== null && Boolean(ctx.viewer.phone),
});

/** The numbers come from the database, never from the client. */
export const prepare = internalMutation({
  args: { target: vTarget },
  handler: async (ctx, { target }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) fail("unauthenticated", "Sign in to continue");
    if (viewer.status !== "active") {
      fail("forbidden", "Your access has been removed");
    }
    if (!viewer.phone) {
      fail("invalid", "Add your phone number in your profile first", "phone");
    }
    const { ok } = await rateLimiter.limit(ctx, "calls", { key: viewer._id });
    if (!ok) fail("rate_limited", "Too many calls. Try again in a minute.");

    const record =
      "personId" in target
        ? await ctx.db.get(target.personId)
        : await ctx.db.get(target.leadId);
    if (!record) fail("not_found", "That record no longer exists");
    if (record.erasedAt || ("archivedAt" in record && record.archivedAt)) {
      fail(
        "forbidden",
        "This record is erased or archived, so it can't be called",
      );
    }
    const to = record.phone ? normalizePhone(record.phone) : null;
    if (!to) fail("invalid", "There's no valid phone number to call", "phone");
    return { from: viewer.phone, to, memberId: viewer._id };
  },
});

export const begin = internalMutation({
  args: {
    sid: v.string(),
    memberId: v.id("members"),
    target: vTarget,
  },
  handler: async (ctx, { sid, memberId, target }) => {
    await ctx.db.insert("phoneCalls", {
      sid,
      memberId,
      ...target,
      startedAt: Date.now(),
    });
  },
});

/** Rings the rep's phone first, then connects the customer. The call is logged by the status callback. */
export const start = action({
  args: { target: vTarget },
  handler: async (ctx, { target }): Promise<void> => {
    const config = await exotel(ctx);
    if (!config || !(await ctx.runQuery(api.calls.enabled, {}))) {
      fail("unavailable", "Calling from the CRM isn't set up");
    }
    const call = await ctx.runMutation(internal.calls.prepare, { target });
    const response = await fetch(
      `https://${config.host}/v1/Accounts/${encodeURIComponent(config.sid)}/Calls/connect`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${config.key}:${config.token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: call.from,
          To: call.to,
          CallerId: config.callerId,
          StatusCallback: `${config.site}/webhooks/exotel?secret=${encodeURIComponent(config.secret)}`,
          "StatusCallbackEvents[0]": "terminal",
          StatusCallbackContentType: "application/json",
        }),
        signal: AbortSignal.timeout(15_000),
      },
    ).catch(() => null);
    if (!response?.ok) {
      console.error(
        "Exotel refused the call",
        response?.status ?? "no response",
      );
      fail("unavailable", "The call couldn't be started. Try again.");
    }
    const sid = (
      (await response.json().catch(() => null)) as {
        Call?: { Sid?: unknown };
      } | null
    )?.Call?.Sid;
    if (typeof sid !== "string" || !sid) {
      fail("unavailable", "The call couldn't be started. Try again.");
    }
    await ctx.runMutation(internal.calls.begin, {
      sid,
      memberId: call.memberId,
      target,
    });
  },
});

export const record = internalMutation({
  args: {
    sid: v.string(),
    outcome: v.optional(vCallOutcome),
    seconds: v.number(),
    recordingUrl: v.optional(v.string()),
  },
  handler: async (ctx, { sid, outcome, seconds, recordingUrl }) => {
    const call = await ctx.db
      .query("phoneCalls")
      .withIndex("by_sid", (q) => q.eq("sid", sid))
      .unique();
    if (!call) return "unknown" as const;
    if (call.loggedAt) return "duplicate" as const;
    await ctx.db.patch(call._id, { loggedAt: Date.now() });
    if (!outcome) return "ignored" as const;

    const person = await resolveMerged(
      call.personId ? await ctx.db.get(call.personId) : null,
      (id) => ctx.db.get(id),
    );
    const lead = call.leadId ? await ctx.db.get(call.leadId) : null;
    const subject = person ?? lead;
    if (!subject || subject.erasedAt) return "ignored" as const;

    const refs = lead
      ? {
          leadId: lead._id,
          accountId: lead.accountId,
          personId: lead.personId,
        }
      : { personId: person?._id, accountId: person?.accountId };
    await ctx.db.insert("timeline", {
      ...refs,
      kind: "call",
      actorId: call.memberId,
      occurredAt: call.startedAt,
      outcome,
      durationMin: callMinutes(seconds) || undefined,
      body: recordingUrl ? `Recording: ${recordingUrl}` : undefined,
    });
    await touchRecords(ctx, refs);
    return "logged" as const;
  },
});

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const count = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0
    ? Math.round(number)
    : undefined;
};

type Leg = { status?: string; seconds?: number; answeredBy?: string };

function legOf(value: unknown): Leg | undefined {
  if (!value || typeof value !== "object") return undefined;
  const leg = value as Record<string, unknown>;
  return {
    status: text(leg.Status),
    seconds: count(leg.OnCallDuration),
    answeredBy: text(leg.AnsweredBy),
  };
}

/** The first leg is the rep, the second the customer; no outcome when the rep never picked up. */
function outcomeOf(
  status: string | undefined,
  seconds: number,
  [agent, customer]: (Leg | undefined)[],
): CallOutcome | undefined {
  if (agent?.status && agent.status !== "completed") return undefined;
  const state = customer?.status ?? status;
  if (state === "busy") return "busy";
  if (state === "completed" && (customer || seconds > 0)) {
    return customer?.answeredBy?.toLowerCase() === "machine"
      ? "voicemail"
      : "connected";
  }
  return "no_answer";
}

/** `POST /webhooks/exotel?secret=…`: Exotel's terminal status callback (JSON). */
export const exotelWebhook = httpAction(async (ctx, request) => {
  const secret = await getSecret(ctx, "EXOTEL_WEBHOOK_SECRET");
  if (!secret) {
    console.error(
      "EXOTEL_WEBHOOK_SECRET must be set; rejecting Exotel webhook",
    );
    return json({ ok: false, error: "Webhook not configured" }, 503);
  }
  const given = new URL(request.url).searchParams.get("secret");
  const valid =
    given !== null &&
    timingSafeEqual(await sha256Hex(secret), await sha256Hex(given));
  if (!valid) return json({ ok: false, error: "Unauthorised" }, 401);

  const body = await readJson(request, BODY_LIMIT);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const payload = body.value;
  const sid = text(payload.CallSid);
  if (!sid) return json({ ok: false, error: "Missing CallSid" }, 400);
  const event = text(payload.EventType);
  if (event && event !== "terminal")
    return json({ ok: true, status: "ignored" });

  const legs = Array.isArray(payload.Legs) ? payload.Legs.map(legOf) : [];
  const seconds = count(payload.ConversationDuration) ?? legs[1]?.seconds ?? 0;
  const recording = text(payload.RecordingUrl);
  const status = await ctx.runMutation(internal.calls.record, {
    sid,
    outcome: outcomeOf(text(payload.Status), seconds, legs),
    seconds,
    recordingUrl:
      recording && recording.length <= MAX_URL && /^https:\/\//i.test(recording)
        ? recording
        : undefined,
  });
  return json({ ok: true, status });
});
