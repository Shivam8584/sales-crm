"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
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
  /** Quick actions shown on the right of a hovered or focused row; use `RowAction` buttons. */
  rowActions?: (row: T) => ReactNode;
  /** Keep the first column (and the checkbox) visible while scrolling sideways. */
  stickyFirstColumn?: boolean;
};

const SKELETON_WIDTHS = ["w-36", "w-28", "w-44", "w-32", "w-24", "w-40"];

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
  rowActions,
  stickyFirstColumn = true,
}: DataTableProps<T>) {
  const router = useRouter();
  const { width, belowSm } = useMobileBreakpoints();
  const [cursor, setCursor] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
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

  function openRow(row: T, event: MouseEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest("a, button, input, [role=checkbox], [role=menu]")
    )
      return;
    if (window.getSelection()?.toString()) return;
    const href = getHref(row);
    if (event.metaKey || event.ctrlKey) window.open(href, "_blank");
    else router.push(href);
  }

  const stickyCell = (index: number) =>
    stickyFirstColumn && index === 0
      ? cn(
          "bg-background group-data-[cursor=true]/row:bg-row-hover group-data-[selected=true]/row:bg-row-selected sticky z-sticky",
          selectable ? "left-11" : "left-0",
          "group-data-[scrolled=true]/table:shadow-[inset_-1px_0_0_var(--border)]",
        )
      : null;
  const stickyCheckbox =
    stickyFirstColumn &&
    "bg-background group-data-[cursor=true]/row:bg-row-hover group-data-[selected=true]/row:bg-row-selected sticky left-0 z-sticky";

  if (sorted && sorted.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-auto pb-[8vh]">
        {empty}
      </div>
    );
  }

  if (belowSm) {
    return (
      <ul aria-label={label} className="min-h-0 flex-1 overflow-y-auto">
        {!sorted &&
          Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li
              key={index}
              aria-hidden
              className="border-border flex gap-3 border-b px-4 py-3.5"
            >
              <Skeleton className="size-8 rounded-lg" />
              <span className="flex flex-1 flex-col gap-2 pt-1">
                <Skeleton
                  className={cn(
                    "h-3",
                    SKELETON_WIDTHS[index % SKELETON_WIDTHS.length],
                  )}
                />
                <Skeleton className="h-2.5 w-48" />
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
      aria-busy={!sorted || undefined}
      data-scrolled={scrolled}
      onScroll={(event) => {
        const next = event.currentTarget.scrollLeft > 0;
        if (next !== scrolled) setScrolled(next);
      }}
      className="group/table scrollbar-none relative min-h-0 flex-1 overflow-auto"
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
              className={cn(
                "flex items-center justify-center",
                stickyFirstColumn && "bg-background z-sticky sticky left-0",
              )}
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
              className={cn(
                stickyFirstColumn &&
                  index === 0 &&
                  cn(
                    "bg-background z-sticky sticky group-data-[scrolled=true]/table:shadow-[inset_-1px_0_0_var(--border)]",
                    selectable ? "left-11" : "left-0",
                  ),
              )}
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
                aria-hidden
                style={template}
                className="border-border grid h-11 border-b"
              >
                {selectable && (
                  <span className="flex items-center justify-center">
                    <Skeleton className="size-3.5 rounded-sm" />
                  </span>
                )}
                {visibleColumns.map((column, index) => (
                  <div
                    key={column.id}
                    role="cell"
                    className={cn(
                      "flex items-center gap-2.5 px-3",
                      column.align === "end" && "justify-end",
                      index === 0 && !selectable && "pl-4",
                    )}
                  >
                    {index === 0 && <Skeleton className="size-5 rounded-md" />}
                    <Skeleton
                      className={cn(
                        "h-3",
                        index === 0
                          ? SKELETON_WIDTHS[row % SKELETON_WIDTHS.length]
                          : column.align === "end"
                            ? "w-10"
                            : "w-16",
                      )}
                    />
                  </div>
                ))}
              </div>
            ))}

          {sorted?.map((row, rowIndex) => {
            const id = getId(row);
            const isSelected = selectable && selected.has(id);
            const actions = rowActions?.(row);
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
                onClick={(event) => openRow(row, event)}
                className="group/row border-border data-[cursor=true]:bg-row-hover data-[selected=true]:bg-row-selected relative grid h-11 cursor-pointer scroll-mt-10 border-b"
              >
                {selectable && (
                  <div
                    role="cell"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (event.target === event.currentTarget) toggle(id);
                    }}
                    className={cn(
                      "flex items-center justify-center",
                      stickyCheckbox,
                    )}
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
                      stickyCell(index),
                    )}
                  >
                    {index === 0 ? (
                      <Link
                        href={getHref(row)}
                        className="focus-visible:ring-ring -mx-1 flex min-w-0 items-center gap-2.5 rounded-sm px-1 py-1 font-medium outline-none focus-visible:ring-2"
                      >
                        {column.cell(row)}
                      </Link>
                    ) : (
                      <div className="flex min-w-0 items-center">
                        {column.cell(row)}
                      </div>
                    )}
                  </div>
                ))}
                {actions && (
                  <div
                    role="cell"
                    className="z-sticky pointer-events-none absolute inset-y-0 right-3 flex items-center opacity-0 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-data-[cursor=true]/row:pointer-events-auto group-data-[cursor=true]/row:opacity-100"
                  >
                    <div className="bg-popover shadow-raised flex items-center gap-0.5 rounded-lg p-0.5">
                      {actions}
                    </div>
                  </div>
                )}
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
  className,
  onSort,
}: {
  column: Column<T>;
  sort: SortState;
  first: boolean;
  className?: string;
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
        className,
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
