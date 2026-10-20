import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { normalizeEmail } from "../lib/domain/normalize";
import { randomToken, sha256Hex } from "./lib/crypto";
import { fail, invalid, notFound } from "./lib/errors";
import { adminMutation, adminQuery } from "./lib/functions";
import { memberIndex } from "./lib/records";
import { vRole } from "./lib/validators";

const DAY = 24 * 60 * 60_000;
const INVITE_TTL = 7 * DAY;
const HISTORY_WINDOW = 14 * DAY;

type InviteStatus = "pending" | "expired" | "accepted" | "revoked";

function statusOf(invite: Doc<"invites">, now: number): InviteStatus {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  return invite.expiresAt > now ? "pending" : "expired";
}

async function assertInvitable(
  ctx: QueryCtx,
  email: string,
  except?: Id<"invites">,
) {
  const member = await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (member?.status === "active") {
    fail("conflict", `${member.name} is already on the team`, "email");
  }
  if (member) {
    fail(
      "conflict",
      `${member.name} was deactivated. Reactivate them from the members list.`,
      "email",
    );
  }
  const now = Date.now();
  const invites = await ctx.db
    .query("invites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();
  if (
    invites.some(
      (invite) => invite._id !== except && statusOf(invite, now) === "pending",
    )
  ) {
    fail("conflict", "This email already has a pending invite", "email");
  }
}

async function issueToken() {
  const token = randomToken();
  return {
    token,
    tokenHash: await sha256Hex(token),
    expiresAt: Date.now() + INVITE_TTL,
  };
}

async function requireOpenInvite(ctx: QueryCtx, id: Id<"invites">) {
  const invite = await ctx.db.get(id);
  if (!invite) notFound("Invite");
  if (invite.acceptedAt) fail("conflict", "This invite was already accepted");
  return invite;
}

/** Creates an invite and returns its raw token; only the hash is stored. */
export const create = adminMutation({
  args: { email: v.string(), role: vRole },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email) invalid("email", "Enter a valid email address");
    await assertInvitable(ctx, email);
    const { token, tokenHash, expiresAt } = await issueToken();
    const id = await ctx.db.insert("invites", {
      email,
      role: args.role,
      tokenHash,
      invitedById: ctx.viewer._id,
      expiresAt,
    });
    return { id, token, email, expiresAt };
  },
});

/** Open invites plus those accepted or revoked in the last two weeks. */
export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const members = await memberIndex(ctx);
    const invites = await ctx.db.query("invites").order("desc").collect();
    return invites
      .map((invite) => ({ invite, status: statusOf(invite, now) }))
      .filter(
        ({ invite, status }) =>
          status === "pending" ||
          status === "expired" ||
          (invite.acceptedAt ?? invite.revokedAt ?? 0) > now - HISTORY_WINDOW,
      )
      .map(({ invite, status }) => ({
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        status,
        expiresAt: invite.expiresAt,
        acceptedAt: invite.acceptedAt,
        revokedAt: invite.revokedAt,
        createdAt: invite._creationTime,
        invitedBy: members.get(invite.invitedById)?.name ?? null,
      }));
  },
});

/** Issues a fresh link and expiry; the old link stops working. */
export const resend = adminMutation({
  args: { id: v.id("invites") },
  handler: async (ctx, { id }) => {
    const invite = await requireOpenInvite(ctx, id);
    await assertInvitable(ctx, invite.email, id);
    const { token, tokenHash, expiresAt } = await issueToken();
    await ctx.db.patch(id, { tokenHash, expiresAt, revokedAt: undefined });
    return { id, token, email: invite.email, expiresAt };
  },
});

export const revoke = adminMutation({
  args: { id: v.id("invites") },
  handler: async (ctx, { id }) => {
    const invite = await requireOpenInvite(ctx, id);
    if (!invite.revokedAt) await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

/** Undoes a revoke; the original link works again until it expires. */
export const restore = adminMutation({
  args: { id: v.id("invites") },
  handler: async (ctx, { id }) => {
    const invite = await requireOpenInvite(ctx, id);
    if (!invite.revokedAt) return;
    await assertInvitable(ctx, invite.email, id);
    await ctx.db.patch(id, { revokedAt: undefined });
  },
});

/** Public: what a signed-out visitor needs to accept an invite link. */
export const lookup = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token || token.length > 128) return null;
    const tokenHash = await sha256Hex(token);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!invite || statusOf(invite, Date.now()) !== "pending") return null;
    return { email: invite.email, role: invite.role };
  },
});
