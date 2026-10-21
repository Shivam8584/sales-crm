import type { ComponentType, ReactNode, SVGProps } from "react";

export type SortDir = "asc" | "desc";
export type SortState = { id: string; dir: SortDir };

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** CSS grid track, e.g. `minmax(14rem,2fr)` or `8rem`. */
  width: string;
  align?: "start" | "end";
  /** Value to sort loaded rows by; columns without it or `sortable` are not sortable. */
  sortValue?: (row: T) => string | number | null;
  /** The server sorts by this column (paged lists, whose rows arrive sorted). */
  sortable?: boolean;
  /** First sort direction when the header is clicked. */
  defaultDir?: SortDir;
  /** Hidden when the viewport is narrower than this many pixels. */
  minViewport?: number;
};

/** An entry in a row's "…" menu, after the built-in Open / Peek / Select items. */
export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  shortcut?: string;
  tone?: "danger";
  disabled?: boolean;
};

/** One cell of the calculation bar under a table, e.g. `{ label: "Pipeline", value: "₹4.3L" }`. */
export type FooterStat = { label: string; value: ReactNode };

export function compareBy<T>(column: Column<T>, dir: SortDir) {
  const factor = dir === "asc" ? 1 : -1;
  return (a: T, b: T) => {
    const left = column.sortValue!(a);
    const right = column.sortValue!(b);
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "string" && typeof right === "string") {
      return (
        left.localeCompare(right, undefined, { sensitivity: "base" }) * factor
      );
    }
    return (left < right ? -1 : 1) * factor;
  };
}

/** Server pagination state from `usePagedList`; the table loads more as it scrolls. */
export type Paging = {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: () => void;
  /** Showing the previous results while new filters load. */
  stale?: boolean;
};
