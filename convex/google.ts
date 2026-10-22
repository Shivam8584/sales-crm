/**
 * Each member can connect their own Google account (read-only Gmail and
 * Calendar). A scheduled sync files mail and meetings with CRM people on their
 * timeline; nothing is stored beyond a subject, a short snippet and a link.
 *
 * Redirect URI to register in Google Cloud: `<CONVEX_SITE_URL>/google/callback`.
 */
import { v } from "convex/values";
import {
  httpAction,
  internalAction,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  CALENDAR_BACKFILL_DAYS,
  CALENDAR_OVERLAP_MS,
  MAIL_BACKFILL_DAYS,
  gmailLink,
  mailCounterparts,
  meetingGuests,
  parseCalendarEvent,
  parseExcludes,
  parseGmailMessage,
  type ParsedMail,
  type Skip,
} from "../lib/domain/mail-sync";
import { normalizeEmail } from "../lib/domain/normalize";
import { routes } from "../lib/routes";
import {
  GoogleError,
  accessToken,
  authUrl,
  eventsBetween,
  exchangeCode,
  gmailProfile,
  messagesAddedSince,
  messagesMetadata,
  recentMessageIds,
  revoke,
  type OAuthConfig,
} from "./lib/google/client";
import {
  decryptSecret,
  encryptSecret,
  encryptionConfigured,
} from "./lib/crypto";
import { canContact, canContactLead } from "./lib/consent";
import { fail } from "./lib/errors";
import {
  activeMemberEmails,
  logAddress,
  logEmail,
  ownDomains,
} from "./lib/emailLog";
import { internalMutation, memberMutation, memberQuery } from "./lib/functions";
import { hmacSha256Hex, siteUrl, timingSafeEqual } from "./lib/http";
import { rateLimiter } from "./lib/rateLimiter";
import { findContacts, groupContacts } from "./inbound";
import { notify } from "./notifications";
import { markFirstTouch, touch } from "./timeline";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const STATE_TTL = 10 * MINUTE;
const MAX_CONNECTIONS = 200;
const MAX_MESSAGES = 300;
const MAX_CUSTOMERS = 20;
const BATCH = 25;
const PURGE_BATCH = 100;
const STAGGER_MS = 2_000;

function oauthConfig(): OAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
  if (!clientId || !clientSecret || !site || !encryptionConfigured()) {
    return null;
  }
  return { clientId, clientSecret, redirectUri: `${site}/google/callback` };
}

const tokenContext = (memberId: string) => `google:${memberId}`;

async function signState(config: OAuthConfig, memberId: Id<"members">) {
  const payload = `${memberId}.${Date.now() + STATE_TTL}`;
  const sig = await hmacSha256Hex(
    config.clientSecret,
    `google-oauth:${payload}`,
  );
  return `${payload}.${sig}`;
}

async function verifyState(config: OAuthConfig, state: string | null) {
  const [memberId, expires, sig] = (state ?? "").split(".");
  if (!memberId || !sig || Number(expires) < Date.now()) return null;
  const expected = await hmacSha256Hex(
    config.clientSecret,
    `google-oauth:${memberId}.${expires}`,
  );
  return timingSafeEqual(expected, sig) ? (memberId as Id<"members">) : null;
}

async function connectionOf(
  ctx: { db: MutationCtx["db"] },
  memberId: Id<"members">,
) {
  return await ctx.db
    .query("googleConnections")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .unique();
}

/** Whether the feature is available, and the viewer's connection without anything secret. */
export const status = memberQuery({
  args: {},
  handler: async (ctx) => {
    if (!oauthConfig()) return { configured: false as const };
    const row = await ctx.db
      .query("googleConnections")
      .withIndex("by_member", (q) => q.eq("memberId", ctx.viewer._id))
      .unique();
    return {
      configured: true as const,
      connection: row && {
        email: row.email,
        status: row.status,
        mail: row.mail,
        calendar: row.calendar,
        excludes: row.excludes,
        syncedAt: row.syncedAt ?? null,
        lastError: row.lastError ?? null,
      },
    };
  },
});

/** The Google consent URL to send the viewer to. */
export const start = memberMutation({
  args: {},
  handler: async (ctx) => {
    const config = oauthConfig();
    if (!config) fail("unavailable", "Google isn't set up on this workspace");
    return authUrl(config, await signState(config, ctx.viewer._id));
  },
});

export const saveSettings = memberMutation({
  args: { mail: v.boolean(), calendar: v.boolean(), excludes: v.string() },
  handler: async (ctx, { mail, calendar, excludes }) => {
    const row = await connectionOf(ctx, ctx.viewer._id);
    if (!row) fail("not_found", "Connect Google first");
    await ctx.db.patch(row._id, {
      mail,
      calendar,
      excludes: parseExcludes(excludes),
    });
  },
});

/** Deletes the stored token at once; imported entries go too when asked. */
export const disconnect = memberMutation({
  args: { deleteImported: v.boolean() },
  handler: async (ctx, { deleteImported }) => {
    const row = await connectionOf(ctx, ctx.viewer._id);
    if (!row) return;
    await ctx.db.delete(row._id);
    await ctx.scheduler.runAfter(0, internal.google.revokeToken, {
      memberId: row.memberId,
      refreshToken: row.refreshToken,
    });
    await ctx.scheduler.runAfter(0, internal.google.purge, {
      memberId: row.memberId,
      deleteEntries: deleteImported,
    });
  },
});

export const revokeToken = internalAction({
  args: { memberId: v.id("members"), refreshToken: v.string() },
  handler: async (_ctx, { memberId, refreshToken }) => {
    try {
      await revoke(
        fetch,
        await decryptSecret(refreshToken, tokenContext(memberId)),
      );
    } catch {
      // The row is already gone; an undecryptable token can't be revoked.
    }
  },
});

export const purge = internalMutation({
  args: { memberId: v.id("members"), deleteEntries: v.boolean() },
  handler: async (ctx, { memberId, deleteEntries }) => {
    const rows = await ctx.db
      .query("googleImports")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .take(PURGE_BATCH);
    for (const row of rows) {
      if (deleteEntries) {
        for (const id of row.entryIds) {
          if (await ctx.db.get(id)) await ctx.db.delete(id);
        }
        await rateLimiter.reset(ctx, "inboundMessage", { key: row.dedupeKey });
      }
      await ctx.db.delete(row._id);
    }
    if (rows.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.google.purge, {
        memberId,
        deleteEntries,
      });
    }
  },
});

export const saveConnection = internalMutation({
  args: {
    memberId: v.id("members"),
    email: v.string(),
    refreshToken: v.string(),
  },
  handler: async (ctx, input) => {
    const member = await ctx.db.get(input.memberId);
    if (member?.status !== "active") return;
    const row = await connectionOf(ctx, input.memberId);
    const base = {
      email: input.email,
      refreshToken: input.refreshToken,
      status: "active" as const,
      lastError: undefined,
    };
    if (!row) {
      await ctx.db.insert("googleConnections", {
        ...base,
        memberId: input.memberId,
        mail: true,
        calendar: true,
        excludes: [],
        connectedAt: Date.now(),
      });
      return;
    }
    const sameAccount = row.email === input.email;
    await ctx.db.patch(row._id, {
      ...base,
      ...(sameAccount
        ? {}
        : { historyId: undefined, calendarCursor: undefined }),
    });
  },
});

/** Google sends the member back here after they approve or refuse. */
export const callback = httpAction(async (ctx, request) => {
  const back = (result: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `${siteUrl(routes.profile)}?google=${result}` },
    });
  const config = oauthConfig();
  if (!config) return back("unavailable");
  const params = new URL(request.url).searchParams;
  const memberId = await verifyState(config, params.get("state"));
  const code = params.get("code");
  if (!memberId) return back("failed");
  if (params.get("error") || !code) return back("denied");
  try {
    const tokens = await exchangeCode(fetch, config, code);
    if (!tokens.granted) return back("scope");
    if (!tokens.refreshToken) return back("failed");
    const profile = await gmailProfile(fetch, tokens.accessToken);
    const email = normalizeEmail(profile.emailAddress);
    if (!email) return back("failed");
    await ctx.runMutation(internal.google.saveConnection, {
      memberId,
      email,
      refreshToken: await encryptSecret(
        tokens.refreshToken,
        tokenContext(memberId),
      ),
    });
  } catch {
    return back("failed");
  }
  return back("connected");
});

export const syncAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!oauthConfig()) return;
    const rows = await ctx.db
      .query("googleConnections")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(MAX_CONNECTIONS);
    for (const [index, row] of rows.entries()) {
      if (!row.mail && !row.calendar) continue;
      await ctx.scheduler.runAfter(
        index * STAGGER_MS,
        internal.google.syncOne,
        {
          id: row._id,
        },
      );
    }
  },
});

export const loadConnection = internalQuery({
  args: { id: v.id("googleConnections") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    const member = row && (await ctx.db.get(row.memberId));
    return row?.status === "active" && member?.status === "active" ? row : null;
  },
});

const vMailbox = v.object({ email: v.string(), name: v.optional(v.string()) });

export const logMail = internalMutation({
  args: {
    id: v.id("googleConnections"),
    mails: v.array(
      v.object({
        messageId: v.string(),
        threadId: v.string(),
        at: v.number(),
        subject: v.string(),
        snippet: v.string(),
        from: v.union(vMailbox, v.null()),
        to: v.array(vMailbox),
        cc: v.array(vMailbox),
        sent: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, { id, mails }) => {
    const conn = await ctx.db.get(id);
    if (!conn?.mail) return 0;
    const skip = await skipRules(ctx, conn);
    let logged = 0;
    for (const mail of mails) {
      logged += await logOneMail(ctx, conn, mail, skip);
    }
    return logged;
  },
});

async function skipRules(
  ctx: MutationCtx,
  conn: Doc<"googleConnections">,
): Promise<Skip> {
  return {
    memberEmails: await activeMemberEmails(ctx),
    logAddress: logAddress(),
    ownDomains: ownDomains(),
    excludes: conn.excludes,
  };
}

type Group = ReturnType<typeof groupContacts>[number];

/** Erased people and anyone who withdrew consent or asked for erasure are never logged. */
async function mayLog(ctx: MutationCtx, group: Group) {
  const decision = group.person
    ? await canContact(ctx, group.person._id, "email", "sales_outreach")
    : group.lead
      ? await canContactLead(ctx, group.lead._id, "email", "sales_outreach")
      : null;
  return (
    !decision ||
    !["erased", "erasure_requested", "withdrawn"].includes(decision.reason)
  );
}

async function record(
  ctx: MutationCtx,
  memberId: Id<"members">,
  dedupeKey: string,
  entryIds: Id<"timeline">[],
) {
  if (!entryIds.length) return 0;
  await rateLimiter.limit(ctx, "inboundMessage", { key: dedupeKey });
  await ctx.db.insert("googleImports", { memberId, dedupeKey, entryIds });
  return 1;
}

async function logOneMail(
  ctx: MutationCtx,
  conn: Doc<"googleConnections">,
  mail: ParsedMail,
  skip: Skip,
) {
  const dedupeKey = `email-log:${mail.messageId}`;
  if (
    !(await rateLimiter.check(ctx, "inboundMessage", { key: dedupeKey })).ok
  ) {
    return 0;
  }
  const { direction, people } = mailCounterparts(mail, [conn.email], skip);
  const at = Math.min(mail.at, Date.now());
  const entryIds: Id<"timeline">[] = [];
  const seen = new Set<string>();
  for (const person of people.slice(0, MAX_CUSTOMERS)) {
    const groups = groupContacts(
      await findContacts(ctx, { email: person.email }, undefined),
    ).filter((group) => !seen.has(group.href));
    for (const group of groups) {
      seen.add(group.href);
      if (!(await mayLog(ctx, group))) continue;
      entryIds.push(
        await logEmail(ctx, {
          refs: group.refs,
          lead: group.lead,
          actorId: direction === "outbound" ? conn.memberId : undefined,
          direction,
          subject:
            mail.subject ||
            (direction === "outbound"
              ? `Email to ${group.name}`
              : `Email from ${person.name ?? group.name}`),
          body: [mail.subject, mail.snippet].filter(Boolean).join("\n"),
          at,
          link: gmailLink(conn.email, mail.threadId),
          quiet: true,
        }),
      );
    }
  }
  return await record(ctx, conn.memberId, dedupeKey, entryIds);
}

export const logMeetings = internalMutation({
  args: {
    id: v.id("googleConnections"),
    meetings: v.array(
      v.object({
        key: v.string(),
        at: v.number(),
        durationMin: v.number(),
        subject: v.string(),
        link: v.optional(v.string()),
        attendees: v.array(vMailbox),
      }),
    ),
  },
  handler: async (ctx, { id, meetings }) => {
    const conn = await ctx.db.get(id);
    if (!conn?.calendar) return 0;
    const skip = await skipRules(ctx, conn);
    let logged = 0;
    for (const meeting of meetings) {
      const dedupeKey = `gcal:${meeting.key}`;
      if (
        !(await rateLimiter.check(ctx, "inboundMessage", { key: dedupeKey })).ok
      ) {
        continue;
      }
      const entryIds: Id<"timeline">[] = [];
      const seen = new Set<string>();
      for (const guest of meetingGuests(meeting, skip).slice(
        0,
        MAX_CUSTOMERS,
      )) {
        const groups = groupContacts(
          await findContacts(ctx, { email: guest.email }, undefined),
        ).filter((group) => !seen.has(group.href));
        for (const group of groups) {
          seen.add(group.href);
          if (!(await mayLog(ctx, group))) continue;
          entryIds.push(
            await ctx.db.insert("timeline", {
              ...group.refs,
              kind: "meeting",
              actorId: conn.memberId,
              occurredAt: meeting.at,
              subject: meeting.subject,
              body: meeting.subject,
              durationMin: meeting.durationMin,
              link: meeting.link,
            }),
          );
          await touch(ctx, group.refs, meeting.at);
          await markFirstTouch(
            ctx,
            group.lead,
            conn.memberId,
            "meeting",
            meeting.at,
          );
        }
      }
      logged += await record(ctx, conn.memberId, dedupeKey, entryIds);
    }
    return logged;
  },
});

export const saveProgress = internalMutation({
  args: {
    id: v.id("googleConnections"),
    historyId: v.optional(v.string()),
    calendarCursor: v.optional(v.number()),
    error: v.optional(v.string()),
    reconnect: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, historyId, calendarCursor, error, reconnect }) => {
    const conn = await ctx.db.get(id);
    if (!conn) return;
    await ctx.db.patch(id, {
      ...(historyId ? { historyId } : {}),
      ...(calendarCursor ? { calendarCursor } : {}),
      ...(reconnect ? { status: "reconnect" as const } : {}),
      syncedAt: Date.now(),
      lastError: error,
    });
    if (reconnect && conn.status === "active") {
      await notify(ctx, conn.memberId, {
        kind: "email_log",
        title: "Reconnect your Google account",
        body: "Google stopped sharing mail and meetings with the CRM.",
        href: routes.profile,
      });
    }
  },
});

async function syncMail(
  ctx: ActionCtx,
  conn: Doc<"googleConnections">,
  token: string,
) {
  const since = conn.historyId
    ? await messagesAddedSince(fetch, token, conn.historyId)
    : null;
  let ids: string[];
  let historyId: string;
  if (since) {
    ({ ids, historyId } = since);
  } else {
    historyId = (await gmailProfile(fetch, token)).historyId;
    ids = await recentMessageIds(fetch, token, MAIL_BACKFILL_DAYS);
  }
  const mails = (
    await messagesMetadata(fetch, token, ids.slice(0, MAX_MESSAGES))
  )
    .map(parseGmailMessage)
    .filter((mail) => mail !== null);
  for (let i = 0; i < mails.length; i += BATCH) {
    await ctx.runMutation(internal.google.logMail, {
      id: conn._id,
      mails: mails.slice(i, i + BATCH),
    });
  }
  return historyId;
}

async function syncCalendar(
  ctx: ActionCtx,
  conn: Doc<"googleConnections">,
  token: string,
) {
  const now = Date.now();
  const from = Math.max(
    (conn.calendarCursor ?? 0) - CALENDAR_OVERLAP_MS,
    now - CALENDAR_BACKFILL_DAYS * DAY,
  );
  const meetings = (await eventsBetween(fetch, token, from, now))
    .map((event) => parseCalendarEvent(event, now))
    .filter((meeting) => meeting !== null);
  for (let i = 0; i < meetings.length; i += BATCH) {
    await ctx.runMutation(internal.google.logMeetings, {
      id: conn._id,
      meetings: meetings.slice(i, i + BATCH),
    });
  }
  return now;
}

export const syncOne = internalAction({
  args: { id: v.id("googleConnections") },
  handler: async (ctx, { id }) => {
    const config = oauthConfig();
    const conn =
      config && (await ctx.runQuery(internal.google.loadConnection, { id }));
    if (!config || !conn) return;

    let token: string;
    try {
      token = await accessToken(
        fetch,
        config,
        await decryptSecret(conn.refreshToken, tokenContext(conn.memberId)),
      );
    } catch (error) {
      await ctx.runMutation(internal.google.saveProgress, {
        id,
        error: "Google access needs to be reconnected",
        reconnect: !(error instanceof GoogleError) || error.needsReconnect,
      });
      return;
    }

    const progress: {
      historyId?: string;
      calendarCursor?: number;
      error?: string;
      reconnect?: boolean;
    } = {};
    const attempt = async (run: () => Promise<void>) => {
      try {
        await run();
      } catch (error) {
        progress.error =
          error instanceof GoogleError ? error.message : "Sync failed";
        if (error instanceof GoogleError && error.needsReconnect) {
          progress.reconnect = true;
        }
      }
    };
    if (conn.mail) {
      await attempt(async () => {
        progress.historyId = await syncMail(ctx, conn, token);
      });
    }
    if (conn.calendar) {
      await attempt(async () => {
        progress.calendarCursor = await syncCalendar(ctx, conn, token);
      });
    }
    await ctx.runMutation(internal.google.saveProgress, { id, ...progress });
  },
});
