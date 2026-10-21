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
import type { Column } from "@/components/data-table/types";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { isEditableTarget } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";

const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";

export type RowGroup<T> = {
  id: string;
  label: string;
  rows: T[];
  /** Shown after the count, e.g. a dot or a one-line explanation. */
  icon?: ReactNode;
  description?: ReactNode;
  tone?: "danger";
  defaultCollapsed?: boolean;
};

type GroupedTableProps<T> = {
  label: string;
  columns: Column<T>[];
  groups: RowGroup<T>[] | undefined;
  getId: (row: T) => string;
  getLabel: (row: T) => string;
  /** Rows link here; without it, `onOpen` handles clicks and Enter. */
  getHref?: (row: T) => string;
  onOpen?: (row: T) => void;
  renderCard: (row: T) => ReactNode;
  /** Control before the first cell's link, e.g. a complete toggle. */
  leading?: (row: T) => ReactNode;
  selected?: Set<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  empty: ReactNode;
  /** Groups without rows are left out unless this is set. */
  showEmptyGroups?: boolean;
};

/**
 * A list split into collapsible groups, with the same row anatomy and keys as
 * DataTable: J/K to move, Enter to open, X to select, Esc to clear.
 */
export default function GroupedTable<T>({
  label,
  columns,
  groups,
  getId,
  getLabel,
  getHref,
  onOpen,
  renderCard,
  leading,
  selected,
  onSelectedChange,
  empty,
  showEmptyGroups = false,
}: GroupedTableProps<T>) {
  const router = useRouter();
  const { width, belowSm } = useMobileBreakpoints();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const selectable = selected !== undefined && onSelectedChange !== undefined;

  const visibleColumns = useMemo(
    () =>
      columns.filter(
        (column) => !column.minViewport || width >= column.minViewport,
      ),
    [columns, width],
  );

  const shown = useMemo(
    () => groups?.filter((group) => showEmptyGroups || group.rows.length > 0),
    [groups, showEmptyGroups],
  );
  const isCollapsed = (group: RowGroup<T>) =>
    collapsed[group.id] ?? group.defaultCollapsed ?? false;

  const flat = useMemo(
    () =>
      (shown ?? []).flatMap((group) =>
        (collapsed[group.id] ?? group.defaultCollapsed) ? [] : group.rows,
      ),
    [shown, collapsed],
  );
  const activeCursor =
    cursor !== null && flat.some((row) => getId(row) === cursor)
      ? cursor
      : null;

  const template: CSSProperties = {
    gridTemplateColumns: [
      selectable ? "2.75rem" : null,
      ...visibleColumns.map((column) => column.width),
    ]
      .filter(Boolean)
      .join(" "),
  };

  function open(row: T) {
    if (getHref) router.push(getHref(row));
    else onOpen?.(row);
  }

  function setMany(ids: string[], on: boolean) {
    if (!selectable) return;
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onSelectedChange(next);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY))
        return;
      const index = activeCursor
        ? flat.findIndex((row) => getId(row) === activeCursor)
        : -1;
      const row = index >= 0 ? flat[index] : undefined;
      const move = (delta: number) => {
        if (flat.length === 0) return;
        event.preventDefault();
        const next =
          index < 0 ? 0 : Math.min(flat.length - 1, Math.max(0, index + delta));
        setCursor(getId(flat[next]));
      };
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
          return open(row);
        case "x":
          if (!row || !selectable) return;
          event.preventDefault();
          return setMany([getId(row)], !selected.has(getId(row)));
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
    if (!activeCursor) return;
    bodyRef.current
      ?.querySelector<HTMLElement>(`[data-row-id="${activeCursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeCursor]);

  if (shown && shown.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{empty}</div>
    );
  }

  function opener(row: T, className: string, children: ReactNode) {
    return getHref ? (
      <Link href={getHref(row)} className={className}>
        {children}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => onOpen?.(row)}
        className={cn("cursor-pointer text-left", className)}
      >
        {children}
      </button>
    );
  }

  function groupHeader(group: RowGroup<T>, sticky: string) {
    const closed = isCollapsed(group);
    const ids = group.rows.map(getId);
    const picked = selectable ? ids.filter((id) => selected.has(id)) : [];
    const panelId = `group-${label}-${group.id}`.replace(/\s+/g, "-");
    return (
      <div
        className={cn(
          "border-border bg-muted z-sticky flex h-9 items-center gap-2 border-b pr-4",
          selectable && !belowSm ? "pl-0" : "pl-4",
          sticky,
        )}
      >
        {selectable && !belowSm && (
          <span className="flex w-11 shrink-0 justify-center">
            <Checkbox
              checked={
                picked.length === 0
                  ? false
                  : picked.length === ids.length
                    ? true
                    : "indeterminate"
              }
              disabled={ids.length === 0}
              onCheckedChange={() => setMany(ids, picked.length !== ids.length)}
              aria-label={`Select all in ${group.label}`}
            />
          </span>
        )}
        <button
          type="button"
          aria-expanded={!closed}
          aria-controls={panelId}
          onClick={() =>
            setCollapsed((current) => ({ ...current, [group.id]: !closed }))
          }
          className="group/head focus-visible:ring-ring -mx-1 flex min-w-0 cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2"
        >
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "text-fg-tertiary duration-fast size-2.5 shrink-0 transition-transform",
              closed && "-rotate-90",
            )}
          />
          {group.icon}
          <span
            className={cn(
              "lead-style truncate font-medium",
              group.tone === "danger" && "text-danger",
            )}
          >
            {group.label}
          </span>
          <span className="caption-style text-fg-tertiary tabular-nums">
            {group.rows.length}
          </span>
        </button>
        {group.description && (
          <span className="caption-style text-fg-tertiary min-w-0 flex-1 truncate max-md:hidden">
            {group.description}
          </span>
        )}
      </div>
    );
  }

  if (belowSm) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto" ref={bodyRef}>
        {!shown && <MobileSkeleton />}
        {shown?.map((group) => (
          <section key={group.id} aria-label={group.label}>
            {groupHeader(group, "sticky top-0")}
            {!isCollapsed(group) && (
              <ul
                id={`group-${label}-${group.id}`.replace(/\s+/g, "-")}
                aria-label={group.label}
              >
                {group.rows.map((row) => (
                  <li
                    key={getId(row)}
                    data-row-id={getId(row)}
                    className="border-border relative border-b"
                  >
                    {opener(
                      row,
                      "active:bg-overlay-1 focus-visible:ring-ring block w-full px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset",
                      renderCard(row),
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div
      aria-label={label}
      role="region"
      className="scrollbar-none relative min-h-0 flex-1 overflow-auto"
    >
      <div className="min-w-fit" ref={bodyRef}>
        <div
          aria-hidden
          style={template}
          className="border-border bg-background z-sticky-header caption-style text-fg-tertiary sticky top-0 grid h-9 items-center border-b"
        >
          {selectable && <span />}
          {visibleColumns.map((column, index) => (
            <span
              key={column.id}
              className={cn(
                "px-3",
                column.align === "end" && "text-right",
                index === 0 && !selectable && "pl-4",
              )}
            >
              {column.header}
            </span>
          ))}
        </div>
        {!shown && <DesktopSkeleton template={template} />}
        {shown?.map((group) => (
          <section key={group.id} aria-label={group.label}>
            {groupHeader(group, "sticky top-9")}
            {!isCollapsed(group) && (
              <ul id={`group-${label}-${group.id}`.replace(/\s+/g, "-")}>
                {group.rows.map((row) => {
                  const id = getId(row);
                  const isSelected = selectable && selected.has(id);
                  return (
                    <li
                      key={id}
                      data-row-id={id}
                      data-cursor={activeCursor === id}
                      data-selected={isSelected}
                      style={template}
                      onMouseMove={() => activeCursor !== id && setCursor(id)}
                      className="group/card border-border data-[cursor=true]:bg-row-hover data-[selected=true]:bg-row-selected relative grid h-11 scroll-mt-18 border-b"
                    >
                      {selectable && (
                        <div className="z-sticky relative flex items-center justify-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => setMany([id], !isSelected)}
                            aria-label={`Select ${getLabel(row)}`}
                          />
                        </div>
                      )}
                      {visibleColumns.map((column, index) => (
                        <div
                          key={column.id}
                          className={cn(
                            "lead-style flex min-w-0 items-center px-3",
                            column.align === "end" &&
                              "justify-end tabular-nums",
                            index === 0 && !selectable && "pl-4",
                          )}
                        >
                          {index === 0 ? (
                            <>
                              {leading && (
                                <span className="z-sticky relative mr-2.5 flex shrink-0">
                                  {leading(row)}
                                </span>
                              )}
                              {opener(
                                row,
                                "focus-visible:after:ring-ring flex min-w-0 items-center gap-2.5 font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset",
                                column.cell(row),
                              )}
                            </>
                          ) : (
                            <div className="z-sticky relative flex min-w-0 items-center [&:not(:has(a,button))]:pointer-events-none">
                              {column.cell(row)}
                            </div>
                          )}
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function DesktopSkeleton({ template }: { template: CSSProperties }) {
  return (
    <div aria-busy>
      <div className="border-border bg-muted flex h-9 items-center border-b px-4">
        <Skeleton className="h-3 w-20" />
      </div>
      {Array.from({ length: 6 }, (_, row) => (
        <div
          key={row}
          style={template}
          className="border-border grid h-11 items-center border-b px-4"
        >
          <Skeleton className="h-3 w-48" />
        </div>
      ))}
    </div>
  );
}

function MobileSkeleton() {
  return (
    <div aria-busy>
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="border-border flex gap-3 border-b px-4 py-3.5"
        >
          <Skeleton className="size-4 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-24" />
          </span>
        </div>
      ))}
    </div>
  );
}
