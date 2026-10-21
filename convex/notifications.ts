import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { memberMutation, memberQuery } from "./lib/functions";
import { memberIndex } from "./lib/records";
import { siteUrl } from "./lib/http";
import { deliver, emailProvider } from "./lib/automations/delivery";
import {
  NOTIFICATION_GROUPS,
  deliversInApp,
  digestText,
  nextDigestAt,
  parseRecordKey,
  recordFromHref,
  snoozeUntil,
} from "../lib/domain/notifications";

const LIMIT = 50;
const MAX_PAGE = 500;
const MAX_UNREAD = 99;
const MAX_BULK = 200;
const DIGEST_ITEMS = 30;
const DAY = 24 * 60 * 60_000;

export type NotificationInput = {
  kind: string;
  title: string;
  body?: string;
  href?: string;
  record?: string;
  actorId?: Id<"members">;
  entryId?: Id<"timeline">;
  count?: number;
};

export async function prefsFor(ctx: QueryCtx, memberId: Id<"members">) {
  return await ctx.db
    .query("notificationPrefs")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .unique();
}

/** Inserts unless the recipient turned this kind off in-app; returns the id or null. */
export async function notify(
  ctx: MutationCtx,
  recipientId: Id<"members">,
  input: NotificationInput,
) {
  const prefs = await prefsFor(ctx, recipientId);
  if (!deliversInApp(input.kind, prefs?.muted ?? [])) return null;
  return await ctx.db.insert("notifications", {
    recipientId,
    ...input,
    record: input.record ?? recordFromHref(input.href),
  });
}

/** Notifies each distinct recipient once. */
export async function notifyMany(
  ctx: MutationCtx,
  recipientIds: Iterable<Id<"members"> | undefined | null>,
  input: NotificationInput,
) {
  const unique = new Set<Id<"members">>();
  for (const id of recipientIds) if (id) unique.add(id);
  for (const id of unique) await notify(ctx, id, input);
}

/** Active admins and managers, who hear about escalations and unowned leads. */
export async function leadershipIds(ctx: QueryCtx) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  return members
    .filter((member) => member.role === "admin" || member.role === "manager")
    .map((member) => member._id);
}

export const send = internalMutation({
  args: {
    recipientId: v.id("members"),
    kind: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
  },
  handler: async (ctx, { recipientId, ...input }) =>
    await notify(ctx, recipientId, input),
});

function unread(ctx: QueryCtx, recipientId: Id<"members">) {
  return ctx.db
    .query("notifications")
    .withIndex("by_recipient", (q) =>
      q.eq("recipientId", recipientId).eq("readAt", undefined),
    );
}

/** Not done and not snoozed, newest first. */
function active(ctx: QueryCtx, recipientId: Id<"members">) {
  return ctx.db
    .query("notifications")
    .withIndex("by_recipient_state", (q) =>
      q
        .eq("recipientId", recipientId)
        .eq("doneAt", undefined)
        .eq("snoozedUntil", undefined),
    )
    .order("desc");
}

type Members = Awaited<ReturnType<typeof memberIndex>>;

function toClient(item: Doc<"notifications">, members?: Members) {
  const actor = item.actorId ? members?.get(item.actorId) : undefined;
  return {
    _id: item._id,
    _creationTime: item._creationTime,
    kind: item.kind,
    title: item.title,
    body: item.body ?? null,
    href: item.href ?? null,
    read: item.readAt !== undefined,
    done: item.doneAt !== undefined,
    snoozedUntil: item.snoozedUntil ?? null,
    record: item.record ?? recordFromHref(item.href) ?? null,
    count: item.count ?? 1,
    actor: actor ? { _id: actor._id, name: actor.name } : null,
  };
}

/** The bell: the newest notifications still in the inbox. */
export const listMine = memberQuery({
  args: {},
  handler: async (ctx) => {
    const members = await memberIndex(ctx);
    return (await active(ctx, ctx.viewer._id).take(LIMIT)).map((item) =>
      toClient(item, members),
    );
  },
});

async function recordInfo(ctx: QueryCtx, key: string) {
  const parsed = parseRecordKey(key);
  if (!parsed) return null;
  const href = `/${parsed.type}/${parsed.id}`;
  if (parsed.type === "accounts") {
    const id = ctx.db.normalizeId("accounts", parsed.id);
    const doc = id ? await ctx.db.get(id) : null;
    return doc ? { type: parsed.type, name: doc.name, href } : null;
  }
  if (parsed.type === "deals") {
    const id = ctx.db.normalizeId("deals", parsed.id);
    const doc = id ? await ctx.db.get(id) : null;
    return doc ? { type: parsed.type, name: doc.title, href } : null;
  }
  if (parsed.type === "leads") {
    const id = ctx.db.normalizeId("leads", parsed.id);
    const doc = id ? await ctx.db.get(id) : null;
    return doc
      ? { type: parsed.type, name: doc.companyName || doc.name, href }
      : null;
  }
  const id = ctx.db.normalizeId("people", parsed.id);
  const doc = id ? await ctx.db.get(id) : null;
  return doc
    ? {
        type: parsed.type,
        name: `${doc.firstName} ${doc.lastName}`.trim(),
        href,
      }
    : null;
}

const vView = v.union(
  v.literal("inbox"),
  v.literal("mentions"),
  v.literal("snoozed"),
  v.literal("done"),
);

/**
 * The inbox. `inbox` and `mentions` hold what isn't done or snoozed, newest
 * first; `snoozed` is soonest to wake first; `done` most recently cleared first.
 * Grow `limit` to load more; `records` names what each notification is about.
 */
export const inbox = memberQuery({
  args: {
    view: vView,
    unreadOnly: v.optional(v.boolean()),
    group: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { view, unreadOnly, group, limit: requested }) => {
    const me = ctx.viewer._id;
    const limit = Math.min(
      MAX_PAGE,
      Math.max(1, Math.floor(requested ?? LIMIT)),
    );
    const base = ctx.db.query("notifications");
    let query =
      view === "snoozed"
        ? base
            .withIndex("by_recipient_state", (q) =>
              q
                .eq("recipientId", me)
                .eq("doneAt", undefined)
                .gt("snoozedUntil", 0),
            )
            .order("asc")
        : view === "done"
          ? base
              .withIndex("by_recipient_state", (q) =>
                q.eq("recipientId", me).gt("doneAt", 0),
              )
              .order("desc")
          : active(ctx, me);
    const kinds =
      view === "mentions"
        ? ["mention"]
        : (NOTIFICATION_GROUPS.find((item) => item.value === group)?.kinds ??
          null);
    if (kinds) {
      query = query.filter((q) =>
        q.or(...kinds.map((kind) => q.eq(q.field("kind"), kind))),
      );
    }
    if (unreadOnly) {
      query = query.filter((q) => q.eq(q.field("readAt"), undefined));
    }
    const rows = await query.take(limit + 1);
    const members = await memberIndex(ctx);
    const items = rows.slice(0, limit).map((item) => toClient(item, members));
    const records: Record<
      string,
      NonNullable<Awaited<ReturnType<typeof recordInfo>>>
    > = {};
    for (const key of new Set(items.map((item) => item.record))) {
      if (!key) continue;
      const info = await recordInfo(ctx, key);
      if (info) records[key] = info;
    }
    return { items, records, hasMore: rows.length > limit };
  },
});

/** Unread counts per inbox view, for the tabs. */
export const counts = memberQuery({
  args: {},
  handler: async (ctx) => {
    const me = ctx.viewer._id;
    const [fresh, snoozed] = await Promise.all([
      unread(ctx, me).take(MAX_PAGE),
      ctx.db
        .query("notifications")
        .withIndex("by_recipient_state", (q) =>
          q.eq("recipientId", me).eq("doneAt", undefined).gt("snoozedUntil", 0),
        )
        .take(MAX_PAGE),
    ]);
    const inInbox = fresh.filter(
      (item) => item.doneAt === undefined && item.snoozedUntil === undefined,
    );
    return {
      inbox: inInbox.length,
      mentions: inInbox.filter((item) => item.kind === "mention").length,
      snoozed: snoozed.length,
    };
  },
});

export const unreadCount = memberQuery({
  args: {},
  handler: async (ctx) =>
    (await unread(ctx, ctx.viewer._id).take(MAX_UNREAD + 1)).length,
});

async function own(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  id: Id<"notifications">,
) {
  const item = await ctx.db.get(id);
  return item && item.recipientId === ctx.viewer._id ? item : null;
}

export const markRead = memberMutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const item = await own(ctx, id);
    if (!item || item.readAt) return;
    await ctx.db.patch(id, { readAt: Date.now() });
  },
});

export const markAllRead = memberMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const items = await unread(ctx, ctx.viewer._id).collect();
    for (const item of items) await ctx.db.patch(item._id, { readAt: now });
    return items.length;
  },
});

/** Unread puts it back in the inbox, out of done or snoozed. */
export const markUnread = memberMutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const item = await own(ctx, id);
    if (!item) return;
    await ctx.db.patch(id, {
      readAt: undefined,
      doneAt: undefined,
      snoozedUntil: undefined,
    });
  },
});

type State = {
  id: Id<"notifications">;
  readAt?: number;
  doneAt?: number;
  snoozedUntil?: number;
};

const vState = v.object({
  id: v.id("notifications"),
  readAt: v.optional(v.number()),
  doneAt: v.optional(v.number()),
  snoozedUntil: v.optional(v.number()),
});

const stateOf = (item: Doc<"notifications">): State => ({
  id: item._id,
  readAt: item.readAt,
  doneAt: item.doneAt,
  snoozedUntil: item.snoozedUntil,
});

async function ownMany(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  ids: Id<"notifications">[],
) {
  const items: Doc<"notifications">[] = [];
  for (const id of new Set(ids.slice(0, MAX_BULK))) {
    const item = await own(ctx, id);
    if (item) items.push(item);
  }
  return items;
}

/** Done clears a notification from the inbox and marks it read. Returns the previous states for undo. */
export const setDone = memberMutation({
  args: { ids: v.array(v.id("notifications")), done: v.boolean() },
  handler: async (ctx, { ids, done }) => {
    const now = Date.now();
    const items = await ownMany(ctx, ids);
    for (const item of items) {
      await ctx.db.patch(
        item._id,
        done
          ? { doneAt: now, readAt: item.readAt ?? now, snoozedUntil: undefined }
          : { doneAt: undefined },
      );
    }
    return items.map(stateOf);
  },
});

/** Hides until tomorrow or next Monday at 9:00 India time, then returns unread. */
export const snooze = memberMutation({
  args: {
    ids: v.array(v.id("notifications")),
    preset: v.union(v.literal("tomorrow"), v.literal("next_week")),
  },
  handler: async (ctx, { ids, preset }) => {
    const now = Date.now();
    const until = snoozeUntil(preset, now);
    const items = await ownMany(ctx, ids);
    for (const item of items) {
      await ctx.db.patch(item._id, {
        snoozedUntil: until,
        readAt: item.readAt ?? now,
        doneAt: undefined,
      });
      await ctx.scheduler.runAt(until, internal.notifications.wake, {
        id: item._id,
        until,
      });
    }
    return { until, previous: items.map(stateOf) };
  },
});

/** Puts notifications back as they were, e.g. to undo done or snooze. */
export const restoreState = memberMutation({
  args: { items: v.array(vState) },
  handler: async (ctx, { items }) => {
    for (const state of items.slice(0, MAX_BULK)) {
      const item = await own(ctx, state.id);
      if (!item) continue;
      await ctx.db.patch(item._id, {
        readAt: state.readAt,
        doneAt: state.doneAt,
        snoozedUntil: state.snoozedUntil,
      });
      if (state.snoozedUntil && state.snoozedUntil > Date.now()) {
        await ctx.scheduler.runAt(
          state.snoozedUntil,
          internal.notifications.wake,
          {
            id: item._id,
            until: state.snoozedUntil,
          },
        );
      }
    }
  },
});

/** A stale wake (the snooze was changed or cancelled) does nothing. */
export const wake = internalMutation({
  args: { id: v.id("notifications"), until: v.number() },
  handler: async (ctx, { id, until }) => {
    const item = await ctx.db.get(id);
    if (!item || item.snoozedUntil !== until) return;
    await ctx.db.patch(id, { snoozedUntil: undefined, readAt: undefined });
  },
});

/** The signed-in member's notification preferences and what delivery is configured. */
export const prefs = memberQuery({
  args: {},
  handler: async (ctx) => {
    const prefs = await prefsFor(ctx, ctx.viewer._id);
    const email = emailProvider();
    return {
      muted: prefs?.muted ?? [],
      emailDigest: prefs?.emailDigest ?? false,
      lastDigest: prefs?.lastDigest ?? null,
      nextDigestAt: nextDigestAt(Date.now()),
      emailProvider: email.provider,
      emailProblem: email.problem ?? null,
      slackConfigured: Boolean(process.env.ALERT_SLACK_WEBHOOK_URL?.trim()),
    };
  },
});

/** Returns the previous values for undo. */
export const setPrefs = memberMutation({
  args: {
    muted: v.optional(v.array(v.string())),
    emailDigest: v.optional(v.boolean()),
  },
  handler: async (ctx, { muted, emailDigest }) => {
    const existing = await prefsFor(ctx, ctx.viewer._id);
    const previous = {
      muted: existing?.muted ?? [],
      emailDigest: existing?.emailDigest ?? false,
    };
    const known = new Set<string>(
      NOTIFICATION_GROUPS.filter((group) => !("required" in group)).map(
        (group) => group.value,
      ),
    );
    const next = {
      muted:
        muted === undefined
          ? previous.muted
          : [...new Set(muted)].filter((value) => known.has(value)),
      emailDigest: emailDigest ?? previous.emailDigest,
    };
    if (existing) await ctx.db.patch(existing._id, next);
    else {
      await ctx.db.insert("notificationPrefs", {
        memberId: ctx.viewer._id,
        ...next,
      });
    }
    return previous;
  },
});

type DigestEntry = {
  memberId: Id<"members">;
  name: string;
  email: string;
  items: { title: string; body?: string; href?: string }[];
};

export const digestQueue = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }): Promise<DigestEntry[]> => {
    const subscribed = (
      await ctx.db.query("notificationPrefs").collect()
    ).filter((prefs) => prefs.emailDigest);
    const queue: DigestEntry[] = [];
    for (const prefs of subscribed) {
      const member = await ctx.db.get(prefs.memberId);
      if (!member || member.status !== "active") continue;
      const since = Math.max(prefs.lastDigest?.at ?? 0, now - DAY);
      const items = (await unread(ctx, member._id).order("desc").take(MAX_PAGE))
        .filter(
          (item) =>
            item._creationTime > since &&
            item.doneAt === undefined &&
            item.snoozedUntil === undefined,
        )
        .slice(0, DIGEST_ITEMS);
      if (items.length === 0) continue;
      queue.push({
        memberId: member._id,
        name: member.name,
        email: member.email,
        items: items.map((item) => ({
          title: item.title,
          body: item.body,
          href: item.href,
        })),
      });
    }
    return queue;
  },
});

export const recordDigest = internalMutation({
  args: {
    memberId: v.id("members"),
    digest: v.object({
      at: v.number(),
      count: v.number(),
      status: v.union(
        v.literal("sent"),
        v.literal("queued"),
        v.literal("failed"),
      ),
      provider: v.string(),
      error: v.optional(v.string()),
      subject: v.string(),
      body: v.string(),
    }),
  },
  handler: async (ctx, { memberId, digest }) => {
    const prefs = await prefsFor(ctx, memberId);
    if (prefs) await ctx.db.patch(prefs._id, { lastDigest: digest });
  },
});

/**
 * The 9:00 India-time email of unread notifications since the last one. With
 * no email provider configured it is composed and kept as "queued", not sent.
 */
export const sendDigests = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const queue: DigestEntry[] = await ctx.runQuery(
      internal.notifications.digestQueue,
      { now },
    );
    const { provider } = emailProvider();
    const day = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
    for (const entry of queue) {
      const { subject, body } = digestText(entry.name, entry.items, siteUrl());
      const result =
        provider === "outbox"
          ? null
          : await deliver(ctx, {
              channel: "email",
              provider,
              stepKey: `digest:${entry.memberId}:${day}`,
              recipientId: entry.memberId,
              to: entry.email,
              subject,
              body,
            });
      await ctx.runMutation(internal.notifications.recordDigest, {
        memberId: entry.memberId,
        digest: {
          at: now,
          count: entry.items.length,
          status: !result ? "queued" : result.ok ? "sent" : "failed",
          provider,
          error: result && !result.ok ? result.error : undefined,
          subject,
          body,
        },
      });
    }
    return queue.length;
  },
});
