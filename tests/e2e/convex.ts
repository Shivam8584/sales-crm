import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { USERS } from "./helpers";

/** A signed-in API client, for cleaning up data the UI can't delete. */
export async function clientFor(who: keyof typeof USERS) {
  const client = new ConvexHttpClient(
    process.env.E2E_CONVEX_URL ?? "http://127.0.0.1:3210",
  );
  const { tokens } = await client.action(api.auth.signIn, {
    provider: "password",
    params: { ...USERS[who], flow: "signIn" },
  });
  client.setAuth(tokens!.token);
  return client;
}
