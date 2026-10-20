import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";
export type SortState = { id: string; dir: SortDir };

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** CSS grid track, e.g. `minmax(14rem,2fr)` or `8rem`. */
  width: string;
  align?: "start" | "end";
  /** Value to sort by; columns without it are not sortable. */
  sortValue?: (row: T) => string | number | null;
  /** First sort direction when the header is clicked. */
  defaultDir?: SortDir;
  /** Hidden when the viewport is narrower than this many pixels. */
  minViewport?: number;
};

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
