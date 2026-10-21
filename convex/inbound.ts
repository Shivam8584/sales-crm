/**
 * Replies from contacts, logged on their records and fed to automations.
 *
 * `POST /webhooks/email-inbound`: any inbound-email relay. Signed like
 * Chatwoot: `X-Inbound-Timestamp` (unix seconds) and `X-Inbound-Signature:
 * sha256=<hex HMAC-SHA256(INBOUND_EMAIL_SECRET, "<timestamp>.<raw body>")>`.
 * Body: `{ messageId, from: "Name <a@b.in>" | {email, name}, subject?, text?,
 * html?, receivedAt? }`.
 *
 * `POST /webhooks/chatwoot`: Chatwoot `message_created` webhooks, verified with
 * the webhook's signing secret (INBOUND_CHATWOOT_SECRET) or, for Chatwoot
 * versions that don't sign, a shared INBOUND_CHATWOOT_TOKEN passed as
 * `?token=` or `X-Chatwoot-Token`.
 */
import { v } from "convex/values";
import { httpAction, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  htmlToText,
  parseAddress,
  parseChatwoot,
  parseTimestamp,
  stripQuoted,
  REPLY_CHANNEL_LABEL,
} from "../lib/domain/automations";
import { normalizeEmail, normalizePhone } from "../lib/domain/normalize";
import { personName } from "../lib/domain/labels";
import { recordReply } from "./lib/automations/engine";
import {
  hmacSha256Hex,
  json,
  parseJsonObject,
  readBody,
  timingSafeEqual,
} from "./lib/http";
import { isOpen } from "./lib/leads";
import { rateLimiter } from "./lib/rateLimiter";
import type { RecordRefs } from "./lib/timeline";
import { notify } from "./notifications";
import { internalMutation } from "./lib/functions";

const BODY_LIMIT = 512 * 1024;
const MAX_TEXT = 10_000;
const MAX_SUBJECT = 300;
const MAX_ID = 300;
const SKEW_MS = 5 * 60_000;
const MATCH_LIMIT = 20;

const vChannel = v.union(v.literal("email"), v.literal("whatsapp"));

type Contact = { email?: string; phone?: string; name?: string };

async function findContacts(
  ctx: MutationCtx,
  contact: Contact,
  orgId: string | undefined,
) {
  const people = new Map<Id<"people">, Doc<"people">>();
  const leads = new Map<Id<"leads">, Doc<"leads">>();
  const add = <T extends { _id: string; erasedAt?: number }>(
    map: Map<string, T>,
    rows: T[],
  ) => {
    for (const row of rows) if (!row.erasedAt) map.set(row._id, row);
  };
  if (contact.email) {
    const email = contact.email;
    add(
      people,
      await ctx.db
        .query("people")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(MATCH_LIMIT),
    );
    add(
      leads,
      await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", email))
        .order("desc")
        .take(MATCH_LIMIT),
    );
  }
  if (contact.phone) {
    const phone = contact.phone;
    add(
      people,
      await ctx.db
        .query("people")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .take(MATCH_LIMIT),
    );
    add(
      leads,
      await ctx.db
        .query("leads")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .order("desc")
        .take(MATCH_LIMIT),
    );
  }
  let account: Doc<"accounts"> | null = null;
  if (!people.size && !leads.size && orgId) {
    account =
      (
        await ctx.db
          .query("accounts")
          .withIndex("by_platform_org", (q) => q.eq("platformOrgId", orgId))
          .take(5)
      ).find((row) => !row.archivedAt) ?? null;
  }
  return { people: [...people.values()], leads: [...leads.values()], account };
}

type Group = {
  refs: RecordRefs;
  name: string;
  ownerId: Id<"members"> | null;
  href: string;
  lead: Doc<"leads"> | null;
  person: Doc<"people"> | null;
};

/** One timeline entry per contact: a person (with their newest lead), a lead on its own, or the org's account. */
function groupContacts(found: Awaited<ReturnType<typeof findContacts>>) {
  const groups: Group[] = [];
  const used = new Set<Id<"leads">>();
  const newestFirst = [...found.leads].sort(
    (a, b) => b._creationTime - a._creationTime,
  );
  for (const person of found.people) {
    const lead =
      newestFirst.find(
        (item) => item.personId === person._id && isOpen(item),
      ) ??
      newestFirst.find((item) => item.personId === person._id) ??
      null;
    for (const item of newestFirst) {
      if (item.personId === person._id) used.add(item._id);
    }
    groups.push({
      refs: {
        personId: person._id,
        accountId: person.accountId,
        leadId: lead?._id,
      },
      name: personName(person),
      ownerId: person.ownerId,
      href: `/people/${person._id}`,
      lead,
      person,
    });
  }
  for (const lead of newestFirst) {
    if (used.has(lead._id)) continue;
    used.add(lead._id);
    groups.push({
      refs: {
        leadId: lead._id,
        personId: lead.personId,
        accountId: lead.accountId,
      },
      name: lead.name,
      ownerId: lead.ownerId ?? null,
      href: `/leads/${lead._id}`,
      lead,
      person: null,
    });
  }
  if (!groups.length && found.account) {
    groups.push({
      refs: { accountId: found.account._id },
      name: found.account.name,
      ownerId: found.account.ownerId,
      href: `/accounts/${found.account._id}`,
      lead: null,
      person: null,
    });
  }
  return groups;
}

async function openDealIds(ctx: MutationCtx, person: Doc<"people"> | null) {
  if (!person?.accountId) return [];
  const accountId = person.accountId;
  const deals = await ctx.db
    .query("deals")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  return deals
    .filter(
      (deal) =>
        deal.personIds.includes(person._id) &&
        deal.stage !== "won" &&
        deal.stage !== "lost",
    )
    .map((deal) => deal._id);
}

async function touch(ctx: MutationCtx, refs: RecordRefs, at: number) {
  for (const id of [refs.accountId, refs.personId]) {
    if (!id) continue;
    const doc = await ctx.db.get(id);
    if (doc && (doc.lastActivityAt ?? 0) < at) {
      await ctx.db.patch(id, { lastActivityAt: at });
    }
  }
}

/** Logs one inbound message on every record it matches; idempotent per source and message id. */
export const receive = internalMutation({
  args: {
    source: v.union(v.literal("email"), v.literal("chatwoot")),
    externalId: v.string(),
    channel: vChannel,
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    name: v.optional(v.string()),
    orgId: v.optional(v.string()),
    subject: v.optional(v.string()),
    text: v.string(),
    receivedAt: v.number(),
  },
  handler: async (ctx, input) => {
    const dedupe = { key: `${input.source}:${input.externalId}` };
    if (!(await rateLimiter.check(ctx, "inboundMessage", dedupe)).ok) {
      return { status: "duplicate" as const, matched: 0, exited: 0 };
    }

    const contact: Contact = {
      email: input.email
        ? (normalizeEmail(input.email) ?? undefined)
        : undefined,
      phone: input.phone
        ? (normalizePhone(input.phone) ?? undefined)
        : undefined,
    };
    const groups = groupContacts(await findContacts(ctx, contact, input.orgId));
    if (!groups.length) {
      return { status: "unmatched" as const, matched: 0, exited: 0 };
    }

    const now = Date.now();
    const at = Math.min(input.receivedAt, now);
    await rateLimiter.limit(ctx, "inboundMessage", dedupe);

    const channelLabel = REPLY_CHANNEL_LABEL[input.channel];
    let exited = 0;
    for (const group of groups) {
      const sender = input.name?.trim() || group.name;
      await ctx.db.insert("timeline", {
        ...group.refs,
        kind: input.channel,
        direction: "inbound",
        occurredAt: at,
        subject:
          input.subject?.trim() || `${channelLabel} reply from ${sender}`,
        body: input.text || undefined,
      });
      await touch(ctx, group.refs, at);
      const lead = group.lead;
      if (lead && isOpen(lead) && !lead.firstTouchedAt) {
        await ctx.db.patch(lead._id, {
          firstTouchedAt: Math.max(lead._creationTime, at),
          ...(lead.status === "new" ? { status: "contacted" as const } : {}),
        });
      }
      if (group.ownerId) {
        await notify(ctx, group.ownerId, {
          kind: "automation",
          title: `${sender} replied by ${channelLabel === "Email" ? "email" : "WhatsApp"}`,
          body: (input.subject?.trim() || input.text).slice(0, 140),
          href: group.href,
        });
      }
      const result = await recordReply(ctx, {
        refs: group.refs,
        channel: input.channel,
        at,
        dealIds: await openDealIds(ctx, group.person),
      });
      exited += result.exited;
    }
    return { status: "logged" as const, matched: groups.length, exited };
  },
});

async function signed(
  secret: string,
  timestamp: string | null,
  raw: string,
  signature: string | null,
) {
  if (!timestamp || !signature || !/^\d{9,11}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > SKEW_MS) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${raw}`);
  const given = signature
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  return timingSafeEqual(expected, given);
}

type Received = {
  status: "duplicate" | "unmatched" | "logged";
  matched: number;
  exited: number;
};

function respond(result: Received) {
  return json(
    { ok: true, ...result },
    result.status === "unmatched" ? 202 : 200,
  );
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;

export const emailInbound = httpAction(async (ctx, request) => {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    console.error("INBOUND_EMAIL_SECRET is not set; rejecting inbound email");
    return json({ ok: false, error: "Webhook not configured" }, 503);
  }
  const body = await readBody(request, BODY_LIMIT);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const valid = await signed(
    secret,
    request.headers.get("X-Inbound-Timestamp"),
    body.raw,
    request.headers.get("X-Inbound-Signature"),
  );
  if (!valid) {
    return json({ ok: false, error: "Invalid or expired signature" }, 401);
  }
  const parsed = parseJsonObject(body.raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
  const payload = parsed.value;
  const messageId = text(payload.messageId, MAX_ID);
  if (!messageId)
    return json({ ok: false, error: "messageId is required" }, 400);
  const from = parseAddress(payload.from);
  const email = from.email ? normalizeEmail(from.email) : null;
  if (!email) {
    return json({ ok: false, error: "from must be an email address" }, 400);
  }
  const raw =
    text(payload.text, BODY_LIMIT) ||
    htmlToText(text(payload.html, BODY_LIMIT) ?? "");
  const result = await ctx.runMutation(internal.inbound.receive, {
    source: "email",
    externalId: messageId,
    channel: "email",
    email,
    name: from.name ?? undefined,
    subject: text(payload.subject, MAX_SUBJECT),
    text: stripQuoted(raw).slice(0, MAX_TEXT),
    receivedAt: parseTimestamp(payload.receivedAt) ?? Date.now(),
  });
  return respond(result);
});

export const chatwootWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.INBOUND_CHATWOOT_SECRET;
  const token = process.env.INBOUND_CHATWOOT_TOKEN;
  if (!secret && !token) {
    console.error(
      "INBOUND_CHATWOOT_SECRET or INBOUND_CHATWOOT_TOKEN must be set; rejecting Chatwoot webhook",
    );
    return json({ ok: false, error: "Webhook not configured" }, 503);
  }
  const body = await readBody(request, BODY_LIMIT);
  if (!body.ok) return json({ ok: false, error: body.error }, body.status);
  const signature = request.headers.get("X-Chatwoot-Signature");
  const given =
    new URL(request.url).searchParams.get("token") ??
    request.headers.get("X-Chatwoot-Token");
  const valid =
    (secret &&
      (await signed(
        secret,
        request.headers.get("X-Chatwoot-Timestamp"),
        body.raw,
        signature,
      ))) ||
    (token && given && timingSafeEqual(token, given));
  if (!valid) return json({ ok: false, error: "Unauthorised" }, 401);
  const parsed = parseJsonObject(body.raw);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
  const message = parseChatwoot(parsed.value);
  if (!message.ok) {
    return json({ ok: true, status: "ignored", reason: message.ignored });
  }
  const { id, channel, content, at, email, phone, name, orgId } =
    message.message;
  if (!email && !phone && !orgId) {
    return json({ ok: true, status: "ignored", reason: "no contact details" });
  }
  const result = await ctx.runMutation(internal.inbound.receive, {
    source: "chatwoot",
    externalId: id,
    channel,
    email: email ?? undefined,
    phone: phone ?? undefined,
    name: name ?? undefined,
    orgId: orgId ?? undefined,
    text: (channel === "email" ? stripQuoted(content) : content).slice(
      0,
      MAX_TEXT,
    ),
    receivedAt: at ?? Date.now(),
  });
  return respond(result);
});
