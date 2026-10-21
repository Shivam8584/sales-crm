import type { PaginationOptions, PaginationResult } from "convex/server";
import { v } from "convex/values";
import { literals } from "./validators";

export const vDir = literals(["asc", "desc"]);
export type Dir = typeof vDir.type;

export const DAY = 24 * 60 * 60_000;

export const vActivity = literals(["7", "30", "90", "stale"]);
export type ActivityWindow = typeof vActivity.type;

/** `lastActivityAt` bounds for a "Last activity" filter: active since, or quiet since. */
export function activityBounds(
  window: ActivityWindow | undefined,
  now: number,
) {
  if (!window) return null;
  if (window === "stale") return { before: now - 30 * DAY };
  return { since: now - Number(window) * DAY };
}

export const vSearch = v.optional(v.string());

/** Trimmed search text, or null when there's nothing to search for. */
export function searchText(search: string | undefined) {
  const text = search?.trim();
  return text ? text.slice(0, 100) : null;
}

/** Applies `map` to each document of a page, keeping the cursor fields. */
export async function mapPage<T, U>(
  result: PaginationResult<T>,
  map: (items: T[]) => Promise<U[]> | U[],
): Promise<PaginationResult<U>> {
  return { ...result, page: await map(result.page) };
}

type Pager<T> = (opts: PaginationOptions) => Promise<PaginationResult<T>>;

/**
 * Ascending order with empty values last. Indexes sort a missing field first,
 * so this pages through the filled range, then the empty one, tagging cursors
 * with the phase they belong to.
 */
export async function paginateEmptyLast<T>(
  opts: PaginationOptions,
  filled: Pager<T>,
  empty: Pager<T>,
): Promise<PaginationResult<T>> {
  const [phase, cursor] = untag(opts.cursor);
  const [endPhase, endCursor] = untag(opts.endCursor ?? null);
  const run = async (which: "1" | "2", from: string | null) => {
    const result = await (which === "1" ? filled : empty)({
      ...opts,
      cursor: from,
      endCursor: opts.endCursor && endPhase === which ? endCursor : undefined,
    });
    return {
      ...result,
      continueCursor: `${which}:${result.continueCursor}`,
      splitCursor: result.splitCursor && `${which}:${result.splitCursor}`,
    };
  };
  if (phase === "2") return await run("2", cursor);
  const first = await run("1", cursor);
  if (!first.isDone || (opts.endCursor && endPhase === "1")) return first;
  // Convex allows one paginated query per function, so the empty range always
  // starts on the next call, even when this page came back empty.
  return { ...first, isDone: false, continueCursor: "2:" };
}

function untag(cursor: string | null): ["1" | "2", string | null] {
  if (!cursor) return ["1", null];
  return [cursor.startsWith("2:") ? "2" : "1", cursor.slice(2) || null];
}

/** Drops repeated documents, keeping the first of each. */
export function uniqueById<T extends { _id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item._id)) return false;
    seen.add(item._id);
    return true;
  });
}
