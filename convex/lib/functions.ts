import { getAuthUserId } from "@convex-dev/auth/server";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ROLE_RANK, type Role } from "../../lib/domain/enums";
import { triggers } from "./counts";
import { fail } from "./errors";

export type Viewer = Doc<"members">;

export async function getViewer(ctx: QueryCtx): Promise<Viewer | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function requireViewer(ctx: QueryCtx, minRole: Role): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (!viewer) fail("unauthenticated", "Sign in to continue");
  if (viewer.status !== "active") {
    fail("forbidden", "Your access has been removed");
  }
  if (ROLE_RANK[viewer.role] < ROLE_RANK[minRole]) {
    fail("forbidden", "You don't have permission to do that");
  }
  return viewer;
}

const withViewer = (minRole: Role) =>
  customCtx(async (ctx: QueryCtx) => ({
    viewer: await requireViewer(ctx, minRole),
  }));

/** Writes go through `triggers`, which keep the list counts in `./counts` exact. */
const withViewerWrites = (minRole: Role) =>
  customCtx(async (ctx: MutationCtx) => ({
    db: triggers.wrapDB(ctx).db,
    viewer: await requireViewer(ctx, minRole),
  }));

/** Any active member. Use for every app query. */
export const memberQuery = customQuery(query, withViewer("rep"));
/** Any active member. Use for every app mutation. */
export const memberMutation = customMutation(
  rawMutation,
  withViewerWrites("rep"),
);
export const managerQuery = customQuery(query, withViewer("manager"));
export const managerMutation = customMutation(
  rawMutation,
  withViewerWrites("manager"),
);
export const adminQuery = customQuery(query, withViewer("admin"));
export const adminMutation = customMutation(
  rawMutation,
  withViewerWrites("admin"),
);
/** Use instead of the raw builders from `_generated/server` for every mutation. */
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);
