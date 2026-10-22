"use client";

import { Fragment, type RefObject, useEffect, useRef } from "react";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Kbd from "@/components/_ui/kbd";
import Skeleton from "@/components/_ui/skeleton";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import type { Column, FooterStat, RowMenuItem, SortState } from "./types";

/**
 * Loads the next page when it scrolls within reach of the viewport; also a
 * button, for keyboards and for when the observer can't fire.
 */
export function LoadMore({
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

export function RowMenu({
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

export function TableFooter({
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

export function HeaderCell<T>({
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
            "group hover:text-foreground focus-visible:ring-ring relative -mx-1 inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3 pointer-coarse:after:content-['']",
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
