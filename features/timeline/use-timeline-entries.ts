"use client";

import { useEffect } from "react";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { ENTRY_ANCHOR } from "@/lib/domain/notifications";
import type { TimelineTarget } from "./kinds";

export type TimelineEntry = FunctionReturnType<
  typeof api.timeline.page
>["page"][number];

const PAGE = 30;
/** How far back a `#entry-<id>` link may page before giving up on a deleted entry. */
const ANCHOR_LIMIT = 600;

/**
 * A record's timeline, newest first, a page at a time. Follows a
 * `#entry-<id>` link to an older entry by loading pages until it's there.
 */
export function useTimelineEntries(target: TimelineTarget) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.timeline.page,
    { target },
    { initialNumItems: PAGE },
  );

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith(ENTRY_ANCHOR) || status !== "CanLoadMore") return;
    if (results.length >= ANCHOR_LIMIT) return;
    const id = hash.slice(ENTRY_ANCHOR.length);
    if (!results.some((entry) => entry._id === id)) loadMore(PAGE);
  }, [results, status, loadMore]);

  return {
    entries: status === "LoadingFirstPage" ? undefined : results,
    more: status === "CanLoadMore" || status === "LoadingMore",
    loadingMore: status === "LoadingMore",
    loadMore: () => loadMore(PAGE),
  };
}
