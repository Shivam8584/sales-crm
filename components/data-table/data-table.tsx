"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Kbd from "@/components/_ui/kbd";
import Skeleton from "@/components/_ui/skeleton";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { isEditableTarget } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import { useTableDensity } from "@/stores/table-density";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import DensityMenu from "./density-menu";
import {
  compareBy,
  type Column,
  type FooterStat,
  type Paging,
  type RowMenuItem,
  type SortState,
} from "./types";

const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";
const SKELETON_ROWS = 8;
const CHECKBOX_TRACK = "2.375rem";
const ACTION_TRACK = "3rem";

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
  /** Quick actions shown on a hovered or focused row; use `RowAction` buttons. */
  rowActions?: (row: T) => ReactNode;
  /** Extra entries for the row's "…" menu, after Open, Peek and Select. */
  rowMenu?: (row: T) => (RowMenuItem | false | null | undefined)[];
  /** The trailing "…" column with the row menu and the density toggle. */
  actionColumn?: boolean;
  /** Calculation bar under the table: equal cells of `{ label, value }`. */
  footer?: FooterStat[];
  /** Keep the first column (and the checkbox) visible while scrolling sideways. */
  stickyFirstColumn?: boolean;
  /**
   * Server-paged rows (from `usePagedList`): rows arrive sorted, more load as
   * the list scrolls, and "select all" selects the loaded rows.
   */
  paging?: Paging;
};

const SKELETON_WIDTHS = ["w-36", "w-28", "w-44", "w-32", "w-24", "w-40"];

const ROW_TINT =
  "bg-background group-hover/row:bg-row-hover group-data-[cursor=true]/row:bg-row-hover group-data-[selected=true]/row:bg-row-selected";

/**
 * The list view used by every record type: sortable columns, row selection,
 * a "…" menu per row, keyboard navigation (J/K, Enter, Space, X, Esc), an
 * optional calculation footer and a card layout on phones. Rows are links, so
 * middle-click and Cmd-click open records in a new tab. With `paging` the
 * server sorts and the table loads further pages as it scrolls.
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
  rowMenu,
  actionColumn = true,
  footer,
  stickyFirstColumn = true,
  paging,
}: DataTableProps<T>) {
  const router = useRouter();
  const density = useTableDensity();
  const { width, belowSm } = useMobileBreakpoints();
  const [cursor, setCursor] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [scrollEnd, setScrollEnd] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
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
    if (!rows || paging || !column?.sortValue) return rows;
    return [...rows].sort(compareBy(column, sort.dir));
  }, [rows, columns, sort, paging]);
  const canLoadMore = paging?.status === "CanLoadMore";
  const partial =
    paging !== undefined &&
    (paging.status === "CanLoadMore" || paging.status === "LoadingMore");

  const loaded = sorted !== undefined;
  const ids = useMemo(() => sorted?.map(getId) ?? [], [sorted, getId]);
  const activeCursor = cursor !== null && cursor < ids.length ? cursor : null;
  const selectedVisible = selectable
    ? ids.filter((id) => selected.has(id))
    : [];
  const allSelected = ids.length > 0 && selectedVisible.length === ids.length;

  const template: CSSProperties = {
    gridTemplateColumns: [
      selectable ? CHECKBOX_TRACK : null,
      ...visibleColumns.map((column) => column.width),
      actionColumn ? ACTION_TRACK : null,
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

  function measure(element: HTMLElement) {
    setScrolled(element.scrollLeft > 0);
    setScrollEnd(
      element.scrollLeft + element.clientWidth >= element.scrollWidth - 1,
    );
  }

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => measure(element));
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [belowSm, loaded]);

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
        if (delta > 0 && activeCursor === rowsList.length - 1 && canLoadMore)
          paging?.loadMore();
        setCursor((current) =>
          current === null
            ? 0
            : Math.min(rowsList.length - 1, Math.max(0, current + delta)),
        );
      };
      const row = activeCursor !== null ? rowsList[activeCursor] : undefined;
      // Enter and Space belong to the focused button (pickers, checkboxes, menus).
      const onControl =
        event.target instanceof Element &&
        event.target.closest("button, [role=checkbox]") !== null;
      switch (event.key) {
        case "j":
        case "ArrowDown":
          return move(1);
        case "k":
        case "ArrowUp":
          return move(-1);
        case "Enter":
          if (!row || onControl) return;
          event.preventDefault();
          return router.push(getHref(row));
        case " ":
          if (!row || !onPeek || onControl) return;
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
    // React bubbles clicks from portaled menus and pickers through the row.
    if (!event.currentTarget.contains(event.target as Node)) return;
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

  function menuItems(row: T): RowMenuItem[][] {
    const id = getId(row);
    const href = getHref(row);
    const extra = (rowMenu?.(row) ?? []).filter((item): item is RowMenuItem =>
      Boolean(item),
    );
    const builtIn: RowMenuItem[] = [
      { label: "Open", shortcut: "↵", onSelect: () => router.push(href) },
      {
        label: "Open in new tab",
        onSelect: () => window.open(href, "_blank"),
      },
      ...(onPeek
        ? [{ label: "Peek", shortcut: "Space", onSelect: () => onPeek(row) }]
        : []),
      ...(selectable
        ? [
            {
              label: selected.has(id) ? "Deselect" : "Select",
              shortcut: "X",
              onSelect: () => toggle(id),
            },
          ]
        : []),
    ];
    return [builtIn, extra];
  }

  const firstSticky = (index: number) =>
    stickyFirstColumn && index === 0
      ? cn(
          "sticky z-sticky group-data-[scrolled=true]/table:shadow-[inset_-1px_0_0_var(--line-strong)]",
          selectable ? "left-(--checkbox-track)" : "left-0",
        )
      : null;
  const cursorBar =
    "relative before:bg-selected before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:opacity-0 group-data-[cursor=true]/row:before:opacity-100";
  const actionSticky =
    "sticky right-0 z-sticky group-data-[scroll-end=false]/table:shadow-[inset_1px_0_0_var(--line-strong)]";

  const footerBar = footer && footer.length > 0 && (
    <TableFooter stats={footer} loading={!sorted} />
  );
  const more = partial && (
    <LoadMore
      root={belowSm ? listRef : scrollRef}
      loading={paging.status === "LoadingMore"}
      onLoad={paging.loadMore}
      card={belowSm}
    />
  );

  if (sorted && sorted.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-auto pb-[8vh]">
        {empty}
      </div>
    );
  }

  if (belowSm) {
    return (
      <div
        data-slot="data-table"
        data-footer={footerBar ? "" : undefined}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ul
          ref={listRef}
          aria-label={label}
          aria-busy={!sorted || paging?.stale || undefined}
          className={cn(
            "duration-fast min-h-0 flex-1 overflow-y-auto transition-opacity",
            paging?.stale && "opacity-60",
          )}
        >
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
          {more && <li>{more}</li>}
        </ul>
        {footerBar}
      </div>
    );
  }

  return (
    <div
      data-slot="data-table"
      data-footer={footerBar ? "" : undefined}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        ref={scrollRef}
        role="table"
        aria-label={label}
        aria-rowcount={partial ? -1 : sorted ? sorted.length + 1 : undefined}
        aria-busy={!sorted || paging?.stale || undefined}
        data-scrolled={scrolled}
        data-scroll-end={scrollEnd}
        data-density={density}
        style={{ "--checkbox-track": CHECKBOX_TRACK } as CSSProperties}
        onScroll={(event) => measure(event.currentTarget)}
        className="group/table scrollbar-none relative mx-(--page-x) min-h-0 flex-1 overflow-auto [--row-height:48px] data-[density=compact]:[--row-height:36px]"
      >
        <div className="min-w-fit">
          <div
            role="row"
            style={template}
            className="border-border bg-background z-sticky-header sticky top-0 grid h-10 border-b"
          >
            {selectable && (
              <div
                role="columnheader"
                className={cn(
                  "bg-background flex items-center pl-2",
                  stickyFirstColumn && "z-sticky sticky left-0",
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
                  aria-label={
                    partial ? "Select all loaded rows" : "Select all rows"
                  }
                  title={
                    partial ? `Select the ${ids.length} loaded rows` : undefined
                  }
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
                className={cn("bg-background", firstSticky(index))}
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
            {actionColumn && (
              <div
                role="columnheader"
                className={cn(
                  "bg-background flex items-center justify-end pr-2.5",
                  actionSticky,
                )}
              >
                <span className="sr-only">Actions</span>
                <DensityMenu variant="ghost" />
              </div>
            )}
          </div>

          <div
            role="rowgroup"
            ref={bodyRef}
            className={cn(
              "duration-fast transition-opacity",
              paging?.stale && "opacity-60",
            )}
          >
            {!sorted &&
              Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <div
                  key={row}
                  role="row"
                  aria-hidden
                  style={template}
                  className="border-border h-row grid border-b"
                >
                  {selectable && (
                    <span className="flex items-center pl-4">
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
                      {index === 0 && (
                        <Skeleton className="size-5 rounded-md" />
                      )}
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
                  {actionColumn && <span />}
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
                  className="group/row border-border data-[cursor=true]:bg-row-hover data-[selected=true]:bg-row-selected h-row duration-base hover:bg-row-hover relative grid cursor-pointer scroll-mt-11 scroll-mb-12 border-b transition-colors hover:duration-[120ms]"
                >
                  {selectable && (
                    <div
                      role="cell"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (event.target === event.currentTarget) toggle(id);
                      }}
                      className={cn(
                        "flex items-center pl-2",
                        cursorBar,
                        stickyFirstColumn &&
                          cn(ROW_TINT, "z-sticky sticky left-0"),
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
                        index === 0 && !selectable && cn("pl-2", cursorBar),
                        stickyFirstColumn && index === 0 && ROW_TINT,
                        firstSticky(index),
                      )}
                    >
                      {index === 0 ? (
                        <Link
                          href={getHref(row)}
                          className="focus-visible:ring-ring text-body -mx-1 flex min-w-0 items-center gap-3 rounded-md px-1 py-1 font-medium outline-none focus-visible:ring-2"
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
                  {actionColumn && (
                    <div
                      role="cell"
                      className={cn(
                        "flex items-center justify-end pr-2.5",
                        ROW_TINT,
                        actionSticky,
                      )}
                    >
                      <RowMenu
                        label={getLabel(row)}
                        groups={() => menuItems(row)}
                        onOpen={() => setCursor(rowIndex)}
                      />
                    </div>
                  )}
                  {actions && (
                    <div
                      role="cell"
                      className={cn(
                        "z-sticky pointer-events-none absolute inset-y-0 flex items-center opacity-0 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-data-[cursor=true]/row:pointer-events-auto group-data-[cursor=true]/row:opacity-100",
                        actionColumn ? "right-12" : "right-3",
                      )}
                    >
                      <div className="bg-popover shadow-overlay flex items-center gap-0.5 rounded-full p-1">
                        {actions}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {more}
          </div>
        </div>
      </div>
      {footerBar}
    </div>
  );
}

/**
 * Loads the next page when it scrolls within reach of the viewport; also a
 * button, for keyboards and for when the observer can't fire.
 */
function LoadMore({
  root,
  loading,
  onLoad,
  card,
}: {
  root: RefObject<HTMLElement | null>;
  loading: boolean;
  onLoad: () => void;
  card: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const load = useRef(onLoad);
  useEffect(() => {
    load.current = onLoad;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load.current();
      },
      { root: root.current, rootMargin: "0px 0px 600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [root, loading]);

  const button = (
    <Button
      variant="ghost"
      size="xs"
      disabled={loading}
      onClick={onLoad}
      className="text-fg-secondary"
    >
      {loading ? "Loading more…" : "Load more"}
    </Button>
  );
  if (card) {
    return (
      <div ref={ref} className="flex justify-center py-4">
        {button}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      role="row"
      className="h-row border-border sticky left-0 flex items-center justify-center border-b"
    >
      <div role="cell">{button}</div>
    </div>
  );
}

function RowMenu({
  label,
  groups,
  onOpen,
}: {
  label: string;
  groups: () => RowMenuItem[][];
  onOpen: () => void;
}) {
  return (
    <DropdownMenu onOpenChange={(open) => open && onOpen()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${label}`}
          className="data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground group-data-[cursor=true]/row:text-foreground pointer-fine:opacity-0 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-data-[cursor=true]/row:opacity-100 pointer-fine:data-[state=open]:opacity-100"
        >
          <DotsIcon aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <RowMenuItems groups={groups} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Mounted only while the menu is open, so closed rows build no items. */
function RowMenuItems({ groups }: { groups: () => RowMenuItem[][] }) {
  return groups()
    .filter((group) => group.length > 0)
    .map((group, index) => (
      <Fragment key={index}>
        {index > 0 && <DropdownMenuSeparator />}
        {group.map((item) => (
          <MenuItem key={item.label} item={item} />
        ))}
      </Fragment>
    ));
}

function MenuItem({ item }: { item: RowMenuItem }) {
  return (
    <DropdownMenuItem
      disabled={item.disabled}
      onSelect={item.onSelect}
      className={cn(item.tone === "danger" && "text-danger")}
    >
      {item.icon && (
        <item.icon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0",
            item.tone === "danger" ? "text-danger" : "text-fg-tertiary",
          )}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.shortcut && <Kbd className="h-4 min-w-4 px-1">{item.shortcut}</Kbd>}
    </DropdownMenuItem>
  );
}

function TableFooter({
  stats,
  loading,
}: {
  stats: FooterStat[];
  loading: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Totals for this view"
      className="text-fg-tertiary flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 px-(--page-x) py-3.5 text-sm"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex min-w-0 items-center gap-2">
          {loading ? (
            <Skeleton className="h-3 w-10" />
          ) : (
            <span className="text-foreground flex shrink-0 items-center tabular-nums">
              {stat.value}
            </span>
          )}
          <span className="text-fg-tertiary truncate">{stat.label}</span>
        </div>
      ))}
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
        "text-fg-tertiary flex min-w-0 items-center px-3 text-xs",
        column.align === "end" && "justify-end",
        first && "pl-2",
        className,
      )}
    >
      {column.sortValue || column.sortable ? (
        <button
          type="button"
          onClick={onSort}
          data-active={active}
          className={cn(
            "group hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2",
            column.align === "end" && "flex-row-reverse",
            active && "text-foreground",
          )}
        >
          <span className="truncate">{column.header}</span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "duration-fast ease-power3-out size-2.5 shrink-0 transition-[opacity,rotate]",
              active ? "opacity-100" : "opacity-0 group-hover:opacity-60",
              active && sort.dir === "asc" && "rotate-180",
            )}
          />
        </button>
      ) : (
        <span className="truncate">{column.header}</span>
      )}
    </div>
  );
}
