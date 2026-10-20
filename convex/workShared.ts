import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";

const MAX_TITLE = 200;

export function checkTitle(title: string | undefined) {
  if (title === undefined) return;
  const trimmed = title.trim();
  if (!trimmed) throw new ConvexError("Title is required");
  if (trimmed.length > MAX_TITLE) throw new ConvexError("Title is too long");
}

export function checkOneOf(
  value: string | undefined,
  allowed: readonly { id: string }[],
) {
  if (value !== undefined && !allowed.some((item) => item.id === value)) {
    throw new ConvexError(`Unknown value: ${value}`);
  }
}

export async function lastRank(
  ctx: MutationCtx,
  table: "deals" | "tasks",
  column: string,
) {
  const docs =
    table === "deals"
      ? (await ctx.db.query("deals").collect()).filter(
          (doc) => doc.stage === column,
        )
      : (await ctx.db.query("tasks").collect()).filter(
          (doc) => doc.status === column,
        );
  return docs.reduce((max, doc) => Math.max(max, doc.rank), 0) + 1;
}

export function dayFromNow(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}
