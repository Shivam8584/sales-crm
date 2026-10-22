import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, memberMutation, memberQuery } from "./lib/functions";
import { memberIndex } from "./lib/records";
import { schedulePush } from "./push";
import {
  byPriority,
  isActionKind,
  parseRecordKey,
  recordFromHref,
} from "../lib/domain/notifications";

const LIMIT = 50;
const MAX_PAGE = 500;
const MAX_UNREAD = 99;
const MAX_BULK = 200;

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

export async function notify(
  ctx: MutationCtx,
  recipientId: Id<"members">,
  input: NotificationInput,
) {
  const id = await ctx.db.insert("notifications", {
    recipientId,
    ...input,
    record: input.record ?? recordFromHref(input.href),
  });
  if (isActionKind(input.kind)) {
    await schedulePush(ctx, recipientId, {
      title: input.title,
      body: input.body ?? "",
      href: input.href ?? "/inbox",
    });
  }
  return id;
}

/** Archives (and so reads) everyone's open notifications of these kinds about a record once the cause is gone. */
export async function resolveNotifications(
  ctx: MutationCtx,
  { record, kinds }: { record: string; kinds: string[] },
) {
  const now = Date.now();
  for (const kind of kinds) {
    const open = await ctx.db
      .query("notifications")
      .withIndex("by_record_kind", (q) =>
        q.eq("record", record).eq("kind", kind),
      )
      .filter((q) => q.eq(q.field("archivedAt"), undefined))
      .collect();
    for (const item of open) {
      await ctx.db.patch(item._id, {
        archivedAt: now,
        readAt: item.readAt ?? now,
      });
    }
  }
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

function inInbox(ctx: QueryCtx, recipientId: Id<"members">) {
  return ctx.db
    .query("notifications")
    .withIndex("by_recipient_archived", (q) =>
      q.eq("recipientId", recipientId).eq("archivedAt", undefined),
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
    archived: item.archivedAt !== undefined,
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
    return (await inInbox(ctx, ctx.viewer._id).take(LIMIT))
      .map((item) => toClient(item, members))
      .sort(byPriority);
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

/**
 * The inbox: unread action items first, then newest. `inbox` holds everything not archived, `mentions`
 * the @mentions among them, `archived` what was cleared. Grow `limit` to load
 * more; `records` names what each notification is about.
 */
export const inbox = memberQuery({
  args: {
    view: v.union(
      v.literal("inbox"),
      v.literal("mentions"),
      v.literal("archived"),
    ),
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { view, unreadOnly, limit: requested }) => {
    const me = ctx.viewer._id;
    const limit = Math.min(
      MAX_PAGE,
      Math.max(1, Math.floor(requested ?? LIMIT)),
    );
    let query =
      view === "archived"
        ? ctx.db
            .query("notifications")
            .withIndex("by_recipient_archived", (q) =>
              q.eq("recipientId", me).gt("archivedAt", 0),
            )
            .order("desc")
        : inInbox(ctx, me);
    if (view === "mentions") {
      query = query.filter((q) => q.eq(q.field("kind"), "mention"));
    }
    if (unreadOnly) {
      query = query.filter((q) => q.eq(q.field("readAt"), undefined));
    }
    const rows = await query.take(limit + 1);
    const members = await memberIndex(ctx);
    const items = rows
      .slice(0, limit)
      .map((item) => toClient(item, members))
      .sort(byPriority);
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

/** Unread counts for the Inbox and Mentions tabs. Archived is always read. */
export const counts = memberQuery({
  args: {},
  handler: async (ctx) => {
    const fresh = await unread(ctx, ctx.viewer._id).take(MAX_PAGE);
    return {
      inbox: fresh.length,
      mentions: fresh.filter((item) => item.kind === "mention").length,
    };
  },
});

export const unreadCount = memberQuery({
  args: {},
  handler: async (ctx) =>
    (await unread(ctx, ctx.viewer._id).take(MAX_UNREAD + 1)).length,
});

async function ownMany(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  ids: Id<"notifications">[],
) {
  const items: Doc<"notifications">[] = [];
  for (const id of new Set(ids.slice(0, MAX_BULK))) {
    const item = await ctx.db.get(id);
    if (item && item.recipientId === ctx.viewer._id) items.push(item);
  }
  return items;
}

const vState = v.object({
  id: v.id("notifications"),
  readAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
});

const stateOf = (item: Doc<"notifications">) => ({
  id: item._id,
  readAt: item.readAt,
  archivedAt: item.archivedAt,
});

/** Marking unread brings an archived notification back to the inbox. Returns the previous states for undo. */
export const setRead = memberMutation({
  args: { ids: v.array(v.id("notifications")), read: v.boolean() },
  handler: async (ctx, { ids, read }) => {
    const now = Date.now();
    const items = await ownMany(ctx, ids);
    for (const item of items) {
      await ctx.db.patch(
        item._id,
        read
          ? { readAt: item.readAt ?? now }
          : { readAt: undefined, archivedAt: undefined },
      );
    }
    return items.map(stateOf);
  },
});

export const markAllRead = memberMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const items = await unread(ctx, ctx.viewer._id).collect();
    for (const item of items) await ctx.db.patch(item._id, { readAt: now });
    return items.map(stateOf);
  },
});

/** Archiving clears notifications from the inbox and marks them read. Returns the previous states for undo. */
export const setArchived = memberMutation({
  args: { ids: v.array(v.id("notifications")), archived: v.boolean() },
  handler: async (ctx, { ids, archived }) => {
    const now = Date.now();
    const items = await ownMany(ctx, ids);
    for (const item of items) {
      await ctx.db.patch(
        item._id,
        archived
          ? { archivedAt: now, readAt: item.readAt ?? now }
          : { archivedAt: undefined },
      );
    }
    return items.map(stateOf);
  },
});

/** Puts notifications back as they were, to undo archive or read changes. */
export const restoreState = memberMutation({
  args: { items: v.array(vState) },
  handler: async (ctx, { items }) => {
    const owned = await ownMany(
      ctx,
      items.map((state) => state.id),
    );
    const mine = new Set(owned.map((item) => item._id));
    for (const state of items.slice(0, MAX_BULK)) {
      if (!mine.has(state.id)) continue;
      await ctx.db.patch(state.id, {
        readAt: state.readAt,
        archivedAt: state.archivedAt,
      });
    }
  },
});
