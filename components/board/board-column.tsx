"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { motion } from "motion/react";
import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import BoardCard, { CardSurface } from "./board-card";
import ToneDot from "./tone-dot";
import type { Placement } from "./board-drag";
import type { BoardColumnDef } from "./board";
import PlusIcon from "@/public/assets/icons/plus.svg";

type BoardColumnProps<T extends { id: string }> = {
  column: BoardColumnDef;
  items: T[];
  activeItem: T | null;
  placement: Placement | null;
  settledId: string | null;
  renderCard: (item: T) => ReactNode;
  getLabel: (item: T) => string;
  onOpen: (id: string) => void;
  onAdd?: (columnId: string) => void;
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
  onAdd,
  addLabel,
  emptyLabel,
}: BoardColumnProps<T>) {
  const { setNodeRef } = useDroppable({
    id: `column:${column.id}`,
    data: { columnId: column.id },
  });
  const activeId = activeItem?.id ?? null;

  const originIndex = items.findIndex((item) => item.id === activeId);
  const inColumn = placement !== null && placement.columnId === column.id;
  const others = items.length - (originIndex >= 0 ? 1 : 0);
  const slotIndex = inColumn
    ? Math.min(placement.index, others)
    : originIndex >= 0 && placement === null
      ? originIndex
      : -1;

  const slot = activeItem && (
    <motion.div
      key="drop-slot"
      aria-hidden
      layout="position"
      transition={{ layout: { type: "spring", duration: 0.3, bounce: 0 } }}
      className="border-line-strong bg-overlay-1 rounded-xl border border-dashed"
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
          className={
            index === 0 ? "relative -mb-2.5 h-0" : "relative -mt-2.5 h-0"
          }
        >
          <div className="invisible absolute inset-x-0 top-0">
            <BoardCard
              id={item.id}
              columnId={column.id}
              label={getLabel(item)}
              onOpen={onOpen}
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
      className="scrollbar-none border-border flex h-full w-[85vw] max-w-80 shrink-0 snap-start flex-col overflow-y-auto overscroll-y-contain border-r sm:w-72 lg:w-auto lg:max-w-none lg:min-w-64 lg:flex-1"
    >
      <header className="bg-background/95 z-sticky sticky top-0 flex flex-col gap-1.5 px-3 pt-3 pb-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ToneDot tone={column.tone} />
            <h2 className="lead-style truncate font-medium">{column.name}</h2>
            <span className="caption-style text-fg-tertiary tabular-nums">
              {items.length}
            </span>
          </div>
          {onAdd && (
            <Tooltip content={`${addLabel} to ${column.name}`}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${addLabel} to ${column.name}`}
                onClick={() => onAdd(column.id)}
                className="-mr-1"
              >
                <PlusIcon aria-hidden className="size-3" />
              </Button>
            </Tooltip>
          )}
        </div>
        {column.summary && (
          <div className="caption-style text-fg-secondary tabular-nums">
            {column.summary}
          </div>
        )}
      </header>
      <div className="flex flex-col gap-2.5 px-3">
        {nodes}
        {items.length === 0 && slotIndex < 0 && (
          <div className="border-line-strong flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-center">
            <span className="caption-style text-fg-tertiary">{emptyLabel}</span>
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
      <div className="min-h-14 flex-1" />
    </motion.section>
  );
}
