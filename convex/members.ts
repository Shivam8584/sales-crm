import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { Role } from "../lib/domain/enums";
import { normalizeEmail } from "../lib/domain/normalize";
import { sha256Hex } from "./lib/crypto";
import { fail, notFound } from "./lib/errors";
import { adminMutation, getViewer, memberQuery } from "./lib/functions";
import { vMemberStatus, vRole } from "./lib/validators";

/** Comma-separated domains such as "hypedrive.in"; empty allows any email. */
function domainAllowed(email: string) {
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(email.split("@")[1] ?? "");
}

/**
 * The signed-in user's membership. `null` when signed out; `{ member: null }`
 * when signed in but not yet admitted (the client then calls `join`).
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return { member: await getViewer(ctx) };
  },
});

/** Admits the signed-in user: first user is admin, then invites, then the domain allowlist. */
export const join = mutation({
  args: { inviteToken: v.optional(v.string()) },
  handler: async (ctx, { inviteToken }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) fail("unauthenticated", "Sign in to continue");
    const existing = await getViewer(ctx);
    if (existing) return existing._id;

    const user = await ctx.db.get(userId);
    const email = user?.email ? normalizeEmail(user.email) : null;
    if (!user || !email) fail("invalid", "Your account has no email address");

    const now = Date.now();
    const anyMember = await ctx.db.query("members").first();
    let role: Role | null = anyMember ? null : "admin";

    if (!role) {
      const hash = inviteToken ? await sha256Hex(inviteToken) : null;
      const invites = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      const invite = invites.find(
        (item) =>
          !item.acceptedAt &&
          !item.revokedAt &&
          item.expiresAt > now &&
          (hash === null || item.tokenHash === hash),
      );
      if (invite) {
        role = invite.role;
        await ctx.db.patch(invite._id, { acceptedAt: now });
      }
    }

    if (!role && domainAllowed(email)) role = "rep";
    if (!role)
      fail("forbidden", "Ask an admin to invite you to this workspace");

    return await ctx.db.insert("members", {
      userId,
      name: user.name?.trim() || email.split("@")[0],
      email,
      role,
      status: "active",
      joinedAt: now,
    });
  },
});

/** Active members, for owner and assignee pickers. */
export const list = memberQuery({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return members
      .map(({ _id, name, email, role }) => ({ _id, name, email, role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Everyone who has joined, including deactivated members, for the team page. */
export const team = memberQuery({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("members").collect();
    return members
      .map(({ _id, name, email, role, status, joinedAt }) => ({
        _id,
        name,
        email,
        role,
        status,
        joinedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

async function requireOtherMember(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  id: Doc<"members">["_id"],
  message: string,
) {
  if (id === ctx.viewer._id) fail("forbidden", message);
  const member = await ctx.db.get(id);
  if (!member) notFound("Member");
  return member;
}

async function assertAnotherAdmin(ctx: MutationCtx, member: Doc<"members">) {
  if (member.role !== "admin" || member.status !== "active") return;
  const admins = await ctx.db
    .query("members")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .filter((q) => q.eq(q.field("role"), "admin"))
    .collect();
  if (admins.length <= 1) {
    fail("conflict", "The workspace needs at least one active admin");
  }
}

/** Returns the previous role so the client can undo. */
export const setRole = adminMutation({
  args: { id: v.id("members"), role: vRole },
  handler: async (ctx, { id, role }) => {
    const member = await requireOtherMember(
      ctx,
      id,
      "You can't change your own role",
    );
    if (member.role !== role) {
      if (role !== "admin") await assertAnotherAdmin(ctx, member);
      await ctx.db.patch(id, { role });
    }
    return member.role;
  },
});

/** Returns the previous status so the client can undo. */
export const setStatus = adminMutation({
  args: { id: v.id("members"), status: vMemberStatus },
  handler: async (ctx, { id, status }) => {
    const member = await requireOtherMember(
      ctx,
      id,
      "You can't change your own access",
    );
    if (member.status !== status) {
      if (status === "deactivated") await assertAnotherAdmin(ctx, member);
      await ctx.db.patch(id, { status });
    }
    return member.status;
  },
});
