import { getAuthUserId } from "@convex-dev/auth/server";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ROLE_RANK, type Role } from "../../lib/domain/enums";
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

/** Any active member. Use for every app query. */
export const memberQuery = customQuery(query, withViewer("rep"));
/** Any active member. Use for every app mutation. */
export const memberMutation = customMutation(mutation, withViewer("rep"));
export const managerMutation = customMutation(mutation, withViewer("manager"));
export const adminQuery = customQuery(query, withViewer("admin"));
export const adminMutation = customMutation(mutation, withViewer("admin"));
