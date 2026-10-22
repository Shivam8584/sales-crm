"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion } from "motion/react";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Tooltip from "@/components/_ui/tooltip";
import BoardCard, { CardSurface } from "./board-card";
import ColumnBadge from "./column-badge";
import type { Placement } from "./board-drag";
import type { BoardColumnDef, BoardSort } from "./board";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import BarChartIcon from "@/public/assets/icons/kanban/bar-chart-12.svg";

type BoardColumnProps<T extends { id: string }> = {
  column: BoardColumnDef;
  items: T[];
  activeItem: T | null;
  placement: Placement | null;
  settledId: string | null;
  renderCard: (item: T) => ReactNode;
  getLabel: (item: T) => string;
  onOpen: (id: string) => void;
  onPeek?: (id: string) => void;
  onAdd?: (columnId: string) => void;
  onHide: (column: BoardColumnDef) => void;
  sorts: BoardSort<T>[];
  onSort?: (column: BoardColumnDef, sort: BoardSort<T>) => void;
  top?: ReactNode;
  addLabel: string;
  emptyLabel: string;
};

export default function BoardColumn<T extends { id: string }>({
  column,
  items,
  activeItem,
  placement,
  settledId,
  renderCard,
  getLabel,
  onOpen,
  onPeek,
  onAdd,
  onHide,
  sorts,
  onSort,
  top,
  addLabel,
  emptyLabel,
}: BoardColumnProps<T>) {
  const { setNodeRef } = useDroppable({
    id: `column:${column.id}`,
    data: { columnId: column.id },
  });
  const activeId = activeItem?.id ?? null;

  const originIndex = items.findIndex((item) => item.id === activeId);
  const inColumn =
    placement !== null && !placement.hidden && placement.columnId === column.id;
  const others = items.length - (originIndex >= 0 ? 1 : 0);
  const slotIndex = inColumn
    ? Math.min(placement.index, others)
    : originIndex >= 0 && (placement === null || placement.hidden)
      ? originIndex
      : -1;

  const slot = activeItem && (
    <motion.div
      key="drop-slot"
      aria-hidden
      layout="position"
      transition={{ layout: { type: "spring", duration: 0.3, bounce: 0 } }}
      className="bg-foreground/[0.04] ring-foreground/10 rounded-2xl ring-1 ring-inset"
    >
      <CardSurface invisible>{renderCard(activeItem)}</CardSurface>
    </motion.div>
  );

  const nodes: ReactNode[] = [];
  let visibleIndex = 0;
  items.forEach((item, index) => {
    if (item.id === activeId) {
      // Keep the dragged card mounted (dnd-kit needs its node) but out of the flow.
      nodes.push(
        <div
          key={item.id}
          className={index === 0 ? "relative -mb-3 h-0" : "relative -mt-3 h-0"}
        >
          <div className="invisible absolute inset-x-0 top-0">
            <BoardCard
              id={item.id}
              columnId={column.id}
              label={getLabel(item)}
              onOpen={onOpen}
              onPeek={onPeek}
              hidden
            >
              {renderCard(item)}
            </BoardCard>
          </div>
        </div>,
      );
      return;
    }
    if (visibleIndex === slotIndex) nodes.push(slot);
    nodes.push(
      <BoardCard
        key={item.id}
        id={item.id}
        columnId={column.id}
        label={getLabel(item)}
        onOpen={onOpen}
        onPeek={onPeek}
        animateLayout={item.id !== settledId}
      >
        {renderCard(item)}
      </BoardCard>,
    );
    visibleIndex += 1;
  });
  if (slotIndex >= visibleIndex && slotIndex >= 0) nodes.push(slot);

  return (
    <motion.section
      layoutScroll
      ref={setNodeRef}
      data-column-id={column.id}
      aria-label={column.name}
      className="scrollbar-none bg-well flex h-full w-[85vw] max-w-85 shrink-0 snap-start scroll-ml-(--page-x) flex-col overflow-y-auto overscroll-y-contain rounded-3xl sm:w-72 lg:w-auto lg:max-w-80 lg:min-w-68 lg:flex-1"
    >
      <header className="z-sticky bg-well sticky top-0 flex flex-col gap-0.5 rounded-t-3xl px-4.5 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ColumnBadge column={column} />
            <h2 className="truncate text-sm leading-5 font-semibold">
              {column.name}
            </h2>
            <span className="text-fg-tertiary text-sm tabular-nums">
              {items.length}
            </span>
          </div>
          <div className="-my-1 -mr-1.5 flex shrink-0 items-center gap-0.5">
            {onAdd && (
              <Tooltip content={`${addLabel} to ${column.name}`}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${addLabel} to ${column.name}`}
                  onClick={() => onAdd(column.id)}
                  className="hover:bg-background rounded-full"
                >
                  <PlusIcon aria-hidden className="size-3" />
                </Button>
              </Tooltip>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${column.name} options`}
                  className="hover:bg-background data-[state=open]:bg-background data-[state=open]:text-foreground rounded-full"
                >
                  <DotsIcon aria-hidden className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {onAdd && (
                  <>
                    <DropdownMenuItem onSelect={() => onAdd(column.id)}>
                      <PlusIcon
                        aria-hidden
                        className="text-fg-tertiary size-3"
                      />
                      {addLabel}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {onSort && sorts.length > 0 && (
                  <>
                    {sorts.map((sort) => (
                      <DropdownMenuItem
                        key={sort.id}
                        disabled={items.length < 2}
                        onSelect={() => onSort(column, sort)}
                      >
                        <BarChartIcon
                          aria-hidden
                          className="text-fg-tertiary size-3"
                        />
                        Sort by {sort.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onSelect={() => onHide(column)}>
                  <EyeIcon aria-hidden className="text-fg-tertiary size-3.5" />
                  Hide column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {column.summary && (
          <div className="text-fg-secondary pl-4 text-xs font-medium tabular-nums">
            {column.summary}
          </div>
        )}
      </header>
      <div className="flex flex-col gap-2 px-2">
        {top}
        {nodes}
        {items.length === 0 && slotIndex < 0 && !top && (
          <div className="bg-background/50 flex h-32 flex-col items-center justify-center gap-2 rounded-2xl text-center">
            <span className="text-fg-tertiary text-sm">{emptyLabel}</span>
            {onAdd && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onAdd(column.id)}
              >
                <PlusIcon aria-hidden className="size-2.5" />
                {addLabel}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="min-h-6 flex-1" />
    </motion.section>
  );
}
