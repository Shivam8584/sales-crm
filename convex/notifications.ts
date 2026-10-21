import { v } from "convex/values";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { FilterBuilder, NamedTableInfo } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { memberMutation, memberQuery } from "./lib/functions";

const LIMIT = 50;
const MAX_PAGE = 500;
const MAX_UNREAD = 99;

export type NotificationInput = {
  kind: string;
  title: string;
  body?: string;
  href?: string;
};

export async function notify(
  ctx: MutationCtx,
  recipientId: Id<"members">,
  input: NotificationInput,
) {
  return await ctx.db.insert("notifications", { recipientId, ...input });
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

function toClient(item: Doc<"notifications">) {
  return {
    _id: item._id,
    _creationTime: item._creationTime,
    kind: item.kind,
    title: item.title,
    body: item.body ?? null,
    href: item.href ?? null,
    read: item.readAt !== undefined,
  };
}

function read(ctx: QueryCtx, recipientId: Id<"members">) {
  return ctx.db
    .query("notifications")
    .withIndex("by_recipient", (q) =>
      q.eq("recipientId", recipientId).gt("readAt", 0),
    );
}

/** The newest notifications for the signed-in member, unread first by recency. */
export const listMine = memberQuery({
  args: {},
  handler: async (ctx) => {
    const [fresh, seen] = await Promise.all([
      unread(ctx, ctx.viewer._id).order("desc").take(LIMIT),
      read(ctx, ctx.viewer._id).order("desc").take(LIMIT),
    ]);
    return [...fresh, ...seen]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, LIMIT)
      .map(toClient);
  },
});

/**
 * The inbox: newest first, optionally only unread and only some kinds. Grow
 * `limit` to load more; `hasMore` says whether another page exists.
 */
export const list = memberQuery({
  args: {
    filter: v.union(v.literal("unread"), v.literal("all")),
    kinds: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { filter, kinds, limit: requested }) => {
    const limit = Math.min(
      MAX_PAGE,
      Math.max(1, Math.floor(requested ?? LIMIT)),
    );
    const byKind =
      kinds && kinds.length > 0
        ? (q: FilterBuilder<NamedTableInfo<DataModel, "notifications">>) =>
            q.or(...kinds.map((kind) => q.eq(q.field("kind"), kind)))
        : null;
    let freshQuery = unread(ctx, ctx.viewer._id).order("desc");
    let seenQuery = read(ctx, ctx.viewer._id).order("desc");
    if (byKind) {
      freshQuery = freshQuery.filter(byKind);
      seenQuery = seenQuery.filter(byKind);
    }
    const [fresh, seen] = await Promise.all([
      freshQuery.take(limit + 1),
      filter === "all" ? seenQuery.take(limit + 1) : Promise.resolve([]),
    ]);
    const merged = [...fresh, ...seen].sort(
      (a, b) => b._creationTime - a._creationTime,
    );
    return {
      items: merged.slice(0, limit).map(toClient),
      hasMore: merged.length > limit,
    };
  },
});

export const unreadCount = memberQuery({
  args: {},
  handler: async (ctx) =>
    (await unread(ctx, ctx.viewer._id).take(MAX_UNREAD + 1)).length,
});

export const markRead = memberMutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (!item || item.recipientId !== ctx.viewer._id || item.readAt) return;
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

export const markUnread = memberMutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (!item || item.recipientId !== ctx.viewer._id || !item.readAt) return;
    await ctx.db.patch(id, { readAt: undefined });
  },
});
