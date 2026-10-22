import Logto from "@auth/core/providers/logto";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { query, type MutationCtx } from "./_generated/server";
import { normalizeEmail } from "../lib/domain/normalize";
import { sha256Hex } from "./lib/crypto";

const logtoEnabled = () =>
  !!(process.env.AUTH_LOGTO_ID && process.env.AUTH_LOGTO_ISSUER);
const passwordEnabled = () => process.env.AUTH_PASSWORD_ENABLED !== "0";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ...(logtoEnabled()
      ? [
          Logto({
            issuer: process.env.AUTH_LOGTO_ISSUER,
            authorization: { params: { scope: "openid profile email" } },
            profile(claims) {
              return {
                id: claims.sub,
                name: claims.name ?? claims.username ?? undefined,
                email: claims.email,
                emailVerified: claims.email_verified === true,
              };
            },
          }),
        ]
      : []),
    Password({
      profile(params) {
        if (!passwordEnabled()) {
          throw new ConvexError("Password sign-in is turned off");
        }
        const email = normalizeEmail(String(params.email ?? ""));
        if (!email) throw new ConvexError("Enter a valid email address");
        const name = String(params.name ?? "").trim();
        if (params.flow === "signUp" && !name) {
          throw new ConvexError("Enter your name");
        }
        const profile: { email: string; name?: string; invite?: string } = {
          email,
        };
        if (name) profile.name = name;
        const invite = String(params.invite ?? "").trim();
        if (invite) profile.invite = invite;
        return profile as { email: string };
      },
    }),
  ],
  callbacks: {
    /**
     * A Logto sign-in with a verified email joins the existing user with that
     * email, so people who started on a password keep their membership.
     */
    async createOrUpdateUser(anyCtx, { existingUserId, profile, provider }) {
      if (existingUserId) return existingUserId;
      const ctx = anyCtx as unknown as MutationCtx;
      const email = normalizeEmail(String(profile.email ?? "")) ?? undefined;
      const verified =
        provider.id === "logto" && profile.emailVerified === true;
      if (provider.id === "logto" && !verified) {
        throw new ConvexError("Verify your email in Hypedrive SSO first");
      }
      if (provider.id === "password" && email) {
        await requireInviteToSignUp(
          ctx,
          email,
          (profile as { invite?: string }).invite,
        );
      }
      if (verified && email) {
        const existing = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            emailVerificationTime: Date.now(),
          });
          return existing._id;
        }
      }
      return await ctx.db.insert("users", {
        email,
        name: typeof profile.name === "string" ? profile.name : undefined,
        ...(verified ? { emailVerificationTime: Date.now() } : {}),
      });
    },
  },
});

/**
 * A password sign-up never proves the address is the person's, so an account
 * row for someone's email must not exist before they ask for it: new password
 * accounts need that email's invite token (the first member of a fresh
 * deployment is the exception).
 */
async function requireInviteToSignUp(
  ctx: MutationCtx,
  email: string,
  token: string | undefined,
) {
  if (!(await ctx.db.query("members").first())) return;
  const hash = token ? await sha256Hex(token) : null;
  const invites = hash
    ? await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect()
    : [];
  const now = Date.now();
  const open = invites.some(
    (item) =>
      !item.acceptedAt &&
      !item.revokedAt &&
      item.expiresAt > now &&
      item.tokenHash === hash,
  );
  if (!open) {
    throw new ConvexError(
      "Accounts are created by invitation. Ask an admin to invite you, or sign in with Hypedrive SSO.",
    );
  }
}

/** Which sign-in methods the sign-in screen offers. */
export const methods = query({
  args: {},
  handler: async () => ({
    logto: logtoEnabled(),
    password: passwordEnabled(),
  }),
});
