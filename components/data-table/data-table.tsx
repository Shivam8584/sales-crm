"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/_ui/checkbox";
import Skeleton from "@/components/_ui/skeleton";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { isEditableTarget } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import { compareBy, type Column, type SortState } from "./types";

const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";
const SKELETON_ROWS = 8;

type DataTableProps<T> = {
  label: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  getId: (row: T) => string;
  getHref: (row: T) => string;
  getLabel: (row: T) => string;
  /** Mobile (<640px) representation of a row. */
  renderCard: (row: T) => ReactNode;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  selected?: Set<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  onPeek?: (row: T) => void;
  empty: ReactNode;
  /** Page-wide J/K/Enter shortcuts; turn off for secondary tables on a page. */
  keyboard?: boolean;
};

/**
 * The list view used by every record type: sortable columns, row selection,
 * keyboard navigation (J/K, Enter, Space, X, Esc) and a card layout on phones.
 * Rows are links, so middle-click and Cmd-click open records in a new tab.
 */
export default function DataTable<T>({
  label,
  columns,
  rows,
  getId,
  getHref,
  getLabel,
  renderCard,
  sort,
  onSortChange,
  selected,
  onSelectedChange,
  onPeek,
  empty,
  keyboard = true,
}: DataTableProps<T>) {
  const router = useRouter();
  const { width, belowSm } = useMobileBreakpoints();
  const [cursor, setCursor] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const selectable = selected !== undefined && onSelectedChange !== undefined;

  const visibleColumns = useMemo(
    () =>
      columns.filter(
        (column) => !column.minViewport || width >= column.minViewport,
      ),
    [columns, width],
  );

  const sorted = useMemo(() => {
    const column = columns.find((item) => item.id === sort.id);
    if (!rows || !column?.sortValue) return rows;
    return [...rows].sort(compareBy(column, sort.dir));
  }, [rows, columns, sort]);

  const ids = useMemo(() => sorted?.map(getId) ?? [], [sorted, getId]);
  const activeCursor = cursor !== null && cursor < ids.length ? cursor : null;
  const selectedVisible = selectable
    ? ids.filter((id) => selected.has(id))
    : [];
  const allSelected = ids.length > 0 && selectedVisible.length === ids.length;

  const template: CSSProperties = {
    gridTemplateColumns: [
      selectable ? "2.75rem" : null,
      ...visibleColumns.map((column) => column.width),
    ]
      .filter(Boolean)
      .join(" "),
  };

  function toggle(id: string) {
    if (!selectable) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  }

  function toggleAll() {
    if (!selectable) return;
    onSelectedChange(allSelected ? new Set() : new Set(ids));
  }

  useEffect(() => {
    if (!sorted || !keyboard) return;
    const rowsList = sorted;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY))
        return;
      const move = (delta: number) => {
        if (rowsList.length === 0) return;
        event.preventDefault();
        setCursor((current) =>
          current === null
            ? 0
            : Math.min(rowsList.length - 1, Math.max(0, current + delta)),
        );
      };
      const row = activeCursor !== null ? rowsList[activeCursor] : undefined;
      switch (event.key) {
        case "j":
        case "ArrowDown":
          return move(1);
        case "k":
        case "ArrowUp":
          return move(-1);
        case "Enter":
          if (!row) return;
          event.preventDefault();
          return router.push(getHref(row));
        case " ":
          if (!row || !onPeek) return;
          event.preventDefault();
          return onPeek(row);
        case "x":
          if (!row) return;
          event.preventDefault();
          return toggle(getId(row));
        case "Escape":
          if (selectable && selected.size > 0)
            return onSelectedChange(new Set());
          return setCursor(null);
        case "/":
          event.preventDefault();
          document
            .querySelector<HTMLInputElement>("[data-list-search]")
            ?.focus();
          return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (activeCursor === null) return;
    bodyRef.current
      ?.querySelector<HTMLElement>(`[data-row-index="${activeCursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeCursor]);

  if (sorted && sorted.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{empty}</div>
    );
  }

  if (belowSm) {
    return (
      <ul aria-label={label} className="min-h-0 flex-1 overflow-y-auto">
        {!sorted &&
          Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li
              key={index}
              className="border-border flex gap-3 border-b px-4 py-3.5"
            >
              <Skeleton className="size-8 rounded-lg" />
              <span className="flex flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-48" />
              </span>
            </li>
          ))}
        {sorted?.map((row) => (
          <li key={getId(row)} className="border-border relative border-b">
            <Link
              href={getHref(row)}
              aria-label={getLabel(row)}
              className="active:bg-overlay-1 focus-visible:ring-ring block px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              {renderCard(row)}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      role="table"
      aria-label={label}
      aria-rowcount={sorted ? sorted.length + 1 : undefined}
      className="scrollbar-none relative min-h-0 flex-1 overflow-auto"
    >
      <div className="min-w-fit">
        <div
          role="row"
          style={template}
          className="border-border bg-background z-sticky-header sticky top-0 grid border-b"
        >
          {selectable && (
            <div
              role="columnheader"
              className="flex items-center justify-center"
            >
              <Checkbox
                checked={
                  allSelected
                    ? true
                    : selectedVisible.length > 0
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={toggleAll}
                aria-label="Select all rows"
                disabled={!sorted}
              />
            </div>
          )}
          {visibleColumns.map((column, index) => (
            <HeaderCell
              key={column.id}
              column={column}
              sort={sort}
              first={index === 0 && !selectable}
              onSort={() =>
                onSortChange(
                  sort.id === column.id
                    ? {
                        id: column.id,
                        dir: sort.dir === "asc" ? "desc" : "asc",
                      }
                    : { id: column.id, dir: column.defaultDir ?? "asc" },
                )
              }
            />
          ))}
        </div>

        <div role="rowgroup" ref={bodyRef}>
          {!sorted &&
            Array.from({ length: SKELETON_ROWS }, (_, row) => (
              <div
                key={row}
                role="row"
                style={template}
                className="border-border grid h-11 border-b"
              >
                {selectable && <span />}
                {visibleColumns.map((column, index) => (
                  <div
                    key={column.id}
                    role="cell"
                    className={cn(
                      "flex items-center px-3",
                      column.align === "end" && "justify-end",
                      index === 0 && !selectable && "pl-4",
                    )}
                  >
                    <Skeleton
                      className={cn("h-3", index === 0 ? "w-32" : "w-16")}
                    />
                  </div>
                ))}
              </div>
            ))}

          {sorted?.map((row, rowIndex) => {
            const id = getId(row);
            const isSelected = selectable && selected.has(id);
            return (
              <div
                key={id}
                role="row"
                aria-selected={selectable ? isSelected : undefined}
                data-row-index={rowIndex}
                data-cursor={activeCursor === rowIndex}
                data-selected={isSelected}
                style={template}
                onMouseMove={() =>
                  activeCursor !== rowIndex && setCursor(rowIndex)
                }
                className="group/row border-border data-[cursor=true]:bg-overlay-1 relative grid h-11 scroll-mt-10 border-b data-[selected=true]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--background))]"
              >
                {selectable && (
                  <div
                    role="cell"
                    className="z-sticky relative flex items-center justify-center"
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(id)}
                      aria-label={`Select ${getLabel(row)}`}
                    />
                  </div>
                )}
                {visibleColumns.map((column, index) => (
                  <div
                    key={column.id}
                    role="cell"
                    className={cn(
                      "lead-style flex min-w-0 items-center px-3",
                      column.align === "end" && "justify-end tabular-nums",
                      index === 0 && !selectable && "pl-4",
                    )}
                  >
                    {index === 0 ? (
                      <Link
                        href={getHref(row)}
                        className="focus-visible:after:ring-ring flex min-w-0 items-center gap-2.5 font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset"
                      >
                        {column.cell(row)}
                      </Link>
                    ) : (
                      <div className="z-sticky relative flex min-w-0 items-center [&:not(:has(a,button))]:pointer-events-none">
                        {column.cell(row)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeaderCell<T>({
  column,
  sort,
  first,
  onSort,
}: {
  column: Column<T>;
  sort: SortState;
  first: boolean;
  onSort: () => void;
}) {
  const active = sort.id === column.id;
  return (
    <div
      role="columnheader"
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(
        "caption-style text-fg-tertiary flex h-9 items-center px-3",
        column.align === "end" && "justify-end",
        first && "pl-4",
      )}
    >
      {column.sortValue ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "group hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2",
            column.align === "end" && "flex-row-reverse",
            active && "text-foreground",
          )}
        >
          {column.header}
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "duration-fast size-2.5 transition-[opacity,rotate]",
              active ? "opacity-100" : "opacity-0 group-hover:opacity-60",
              active && sort.dir === "asc" && "rotate-180",
            )}
          />
        </button>
      ) : (
        column.header
      )}
    </div>
  );
}
