import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { normalizeEmail } from "../lib/domain/normalize";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
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
});
