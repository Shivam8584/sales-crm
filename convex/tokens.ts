import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { MAX_LIVE_TOKENS, generateToken, tokenPrefix } from "../lib/domain/mcp";
import { cleanText } from "../lib/domain/normalize";
import { sha256Hex } from "./lib/crypto";
import { fail, invalid, notFound } from "./lib/errors";
import { getViewer, memberMutation, memberQuery } from "./lib/functions";
import { runUndo } from "./lib/mcpTools";
import { can } from "./lib/permissions";
import { literals } from "./lib/validators";

const DAY = 24 * 60 * 60_000;
const MAX_NAME = 60;
const SCAN = 100;

export const isLive = (token: Doc<"apiTokens">, now: number) =>
  !token.revokedAt && (!token.expiresAt || token.expiresAt > now);

/** Returns the raw token this once; only its hash is stored. */
export const create = memberMutation({
  args: {
    name: v.string(),
    access: literals(["read", "write"]),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const name = cleanText(args.name);
    if (!name) invalid("name", "Give the token a name");
    if (name.length > MAX_NAME) invalid("name", "Keep the name shorter");
    const days = args.expiresInDays;
    if (
      days !== undefined &&
      (!Number.isInteger(days) || days < 1 || days > 365)
    ) {
      invalid("expiresInDays", "Pick between 1 and 365 days");
    }
    const now = Date.now();
    const own = await ctx.db
      .query("apiTokens")
      .withIndex("by_member", (q) => q.eq("memberId", ctx.viewer._id))
      .order("desc")
      .take(SCAN);
    if (own.filter((token) => isLive(token, now)).length >= MAX_LIVE_TOKENS) {
      fail(
        "conflict",
        `You can have ${MAX_LIVE_TOKENS} active tokens. Revoke one first.`,
      );
    }
    const token = generateToken();
    const id = await ctx.db.insert("apiTokens", {
      memberId: ctx.viewer._id,
      name,
      tokenHash: await sha256Hex(token),
      prefix: tokenPrefix(token),
      access: args.access,
      createdAt: now,
      expiresAt: days ? now + days * DAY : undefined,
    });
    return { id, token };
  },
});

export const list = memberQuery({
  args: {},
  handler: async (ctx) => {
    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_member", (q) => q.eq("memberId", ctx.viewer._id))
      .order("desc")
      .take(SCAN);
    const now = Date.now();
    return tokens.map((token) => ({
      _id: token._id,
      name: token.name,
      prefix: token.prefix,
      access: token.access,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt ?? null,
      expiresAt: token.expiresAt ?? null,
      revokedAt: token.revokedAt ?? null,
      expired: token.expiresAt !== undefined && token.expiresAt <= now,
    }));
  },
});

/** Your own tokens, or any token for an admin. */
export const revoke = memberMutation({
  args: { id: v.id("apiTokens") },
  handler: async (ctx, { id }) => {
    const token = await ctx.db.get(id);
    if (!token) notFound("Token");
    if (
      token.memberId !== ctx.viewer._id &&
      !can(ctx.viewer, "member.manage")
    ) {
      fail("forbidden", "You can only revoke your own tokens");
    }
    if (!token.revokedAt) await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

const RECENT = 20;

/** What this member's write tokens changed lately. */
export const writes = memberQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("mcpWrites")
      .withIndex("by_member", (q) => q.eq("memberId", ctx.viewer._id))
      .order("desc")
      .take(RECENT);
    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        summary: row.summary,
        at: row.at,
        token: row.tokenId
          ? ((await ctx.db.get(row.tokenId))?.name ?? "Deleted token")
          : `Agent ${(row.agentId && (await ctx.db.get(row.agentId))?.name) || "(deleted)"}`,
        undoable: row.undo !== undefined && row.undoneAt === undefined,
        undone: row.undoneAt !== undefined,
      })),
    );
  },
});

/**
 * The raw builder on purpose, like `mcp.write`: the app mutation that takes the
 * change back wraps `ctx.db` with the count triggers itself.
 */
export const undo = mutation({
  args: { id: v.id("mcpWrites") },
  handler: async (ctx, { id }) => {
    const viewer = await getViewer(ctx);
    if (!viewer || viewer.status !== "active") {
      fail("unauthenticated", "Sign in to continue");
    }
    const row = await ctx.db.get(id);
    if (!row || row.memberId !== viewer._id) notFound("Change");
    if (!row.undo) fail("conflict", "That change can't be undone");
    if (row.undoneAt) fail("conflict", "Already undone");
    await runUndo(ctx, viewer, row.undo);
    await ctx.db.patch(id, { undoneAt: Date.now() });
  },
});
