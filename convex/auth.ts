import Logto from "@auth/core/providers/logto";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { query, type MutationCtx } from "./_generated/server";
import { normalizeEmail } from "../lib/domain/normalize";

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
        const profile: { email: string; name?: string } = { email };
        if (name) profile.name = name;
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

/** Which sign-in methods the sign-in screen offers. */
export const methods = query({
  args: {},
  handler: async () => ({
    logto: logtoEnabled(),
    password: passwordEnabled(),
  }),
});
