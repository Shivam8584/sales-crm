"use client";

import { useState } from "react";
import {
  usePaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryReference,
} from "convex/react";
import type { Paging } from "@/components/data-table/types";

const PAGE_SIZE = 50;

/**
 * A server-filtered, server-sorted list a page at a time, for `DataTable`'s
 * `paging`. While new filters load it keeps showing the previous rows
 * (`paging.stale`) instead of flashing back to skeletons.
 */
export function usePagedList<Query extends PaginatedQueryReference>(
  query: Query,
  args: PaginatedQueryArgs<Query> | "skip",
  pageSize = PAGE_SIZE,
) {
  const { results, status, loadMore } = usePaginatedQuery(query, args, {
    initialNumItems: pageSize,
  });
  const settled = status !== "LoadingFirstPage";
  const [shown, setShown] = useState<typeof results | undefined>(undefined);
  if (settled && shown !== results) setShown(results);
  const rows = settled ? results : shown;
  const paging: Paging = {
    status,
    loadMore: () => loadMore(pageSize),
    stale: !settled && rows !== undefined,
  };
  return { rows, paging };
}

/** True when the list may have rows beyond those loaded. */
export function isPartial(paging: Paging) {
  return paging.status === "CanLoadMore" || paging.status === "LoadingMore";
}

/** Rows to total in a footer: only once every page is loaded, so sums are never partial. */
export function allRows<T>(rows: T[] | undefined, paging: Paging) {
  return paging.status === "Exhausted" ? rows : undefined;
}

/** "1,234" when the server could count the view, else the loaded rows, with "+" while more remain. */
export function viewCount(
  total: number | null | undefined,
  loaded: number | undefined,
  paging: Paging,
) {
  if (typeof total === "number") return total.toLocaleString("en-IN");
  if (loaded === undefined) return "–";
  return isPartial(paging)
    ? `${loaded.toLocaleString("en-IN")}+`
    : loaded.toLocaleString("en-IN");
}
