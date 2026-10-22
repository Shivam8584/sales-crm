import type { Auth, RegisteredMutation, RegisteredQuery } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { fail } from "./errors";

/**
 * The token and the active member behind it, or null once it is revoked,
 * expired or its member deactivated. Tools re-check it in their own
 * transaction so a revoke takes effect at once.
 */
export async function validToken(ctx: QueryCtx, tokenId: Id<"apiTokens">) {
  const token = await ctx.db.get(tokenId);
  if (!token || token.revokedAt) return null;
  if (token.expiresAt !== undefined && token.expiresAt <= Date.now())
    return null;
  const member = await ctx.db.get(token.memberId);
  return member?.status === "active" ? { token, member } : null;
}

export async function requireToken(ctx: QueryCtx, tokenId: Id<"apiTokens">) {
  const live = await validToken(ctx, tokenId);
  if (!live) fail("unauthenticated", "This token is no longer valid");
  return live;
}

/**
 * Runs an app function's own handler as `member`. The handler's wrapper resolves
 * its viewer from `ctx.auth`, so every role, ownership and erasure rule of the
 * app applies unchanged and a token can never do more than its member can.
 * The handler is called without argument validation: pass typed values only.
 */
type Registered =
  | RegisteredQuery<"public", never, unknown>
  | RegisteredMutation<"public", never, unknown>;

export type ArgsOf<F> =
  F extends RegisteredQuery<"public", infer A, unknown>
    ? A
    : F extends RegisteredMutation<"public", infer A, unknown>
      ? A
      : never;

export type ResultOf<F> =
  F extends RegisteredQuery<"public", never, infer R>
    ? Awaited<R>
    : F extends RegisteredMutation<"public", never, infer R>
      ? Awaited<R>
      : never;

export function runAs<F extends Registered>(
  fn: F,
  ctx: { auth: Auth },
  member: Doc<"members">,
  args: ArgsOf<F>,
): Promise<ResultOf<F>> {
  const identity = {
    subject: `${member.userId}|mcp`,
    issuer: "mcp",
    tokenIdentifier: `mcp|${member.userId}`,
  };
  const actingCtx = { ...ctx, auth: { getUserIdentity: async () => identity } };
  const { _handler: handler } = fn as unknown as {
    _handler: (c: unknown, a: unknown) => Promise<ResultOf<F>>;
  };
  return handler(actingCtx, args);
}

/**
 * The context with every timeline entry it inserts marked as written through
 * the named token, however deep in the app's helpers the insert happens.
 */
export function viaToken(ctx: MutationCtx, via: string): MutationCtx {
  const db = new Proxy(ctx.db, {
    get(target, prop) {
      if (prop === "insert") {
        return (table: string, doc: object) =>
          target.insert(
            table as "timeline",
            (table === "timeline" ? { ...doc, via } : doc) as never,
          );
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ...ctx, db };
}
