"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion } from "motion/react";
import Button from "@/components/_ui/button";
import type { TagTone } from "@/components/_ui/tag";
import type { BadgeTone } from "@/components/_common/status-badge";
import { toast } from "@/stores/toast-store";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";
import BoardColumn from "./board-column";
import { CardSurface } from "./board-card";
import {
  boardKeyboardCoordinates,
  markDragEnd,
  type Placement,
} from "./board-drag";
import type { BoardPrefs } from "./board-prefs";
import HiddenColumnsPanel from "./hidden-columns";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** A column shows a StatusBadge when it has an icon, a tone dot otherwise. */
export type BoardColumnDef = {
  id: string;
  name: string;
  /** Shown under the header, e.g. column totals. */
  summary?: ReactNode;
} & ({ icon: Icon; tone: BadgeTone } | { icon?: undefined; tone: TagTone });

export type BoardSort<T> = {
  id: string;
  label: string;
  compare: (a: T, b: T) => number;
};

type Point = { x: number; y: number };
type EdgeDirection = -1 | 0 | 1;

const EDGE_DWELL = 220;
const EDGE_ZONE_MAX = 64;
const EDGE_ZONE_RATIO = 0.16;
const LOCK_RADIUS = 28;
const REALIGN_DURATION = 400;

const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) {
    const card = within.find((hit) => String(hit.id).startsWith("card:"));
    return [card ?? within[0]];
  }
  return rectIntersection(args);
};

function eventPoint(event: Event | null): Point | null {
  if (!event) return null;
  if ("touches" in event) {
    const touch = event as TouchEvent;
    const point = touch.touches[0] ?? touch.changedTouches[0];
    return point ? { x: point.clientX, y: point.clientY } : null;
  }
  if ("clientX" in event) {
    const mouse = event as MouseEvent;
    return { x: mouse.clientX, y: mouse.clientY };
  }
  return null;
}

type BoardProps<T extends { id: string }> = {
  columns: BoardColumnDef[];
  items: T[];
  columnOf: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  getLabel: (item: T) => string;
  /** Return `false` when the move waits on the user (e.g. a reason dialog). */
  onMove: (
    id: string,
    columnId: string,
    beforeId: string | null,
  ) => void | boolean;
  /** Enter, or a click with ⌘/Ctrl held (plain click when there's no `onPeek`). */
  onOpen: (id: string) => void;
  /** Plain click; when set, the card opens a peek and ⌘/Ctrl-click or Enter opens the page. */
  onPeek?: (id: string) => void;
  onAdd?: (columnId: string) => void;
  /** Inline content above a column's cards, e.g. a composer; not counted. */
  renderColumnTop?: (columnId: string) => ReactNode;
  /** Column menu sorts; `onReorder` persists the new order. */
  sorts?: BoardSort<T>[];
  onReorder?: (columnId: string, ids: string[], sort: BoardSort<T>) => void;
  /** Hidden columns and panel state from `useBoardPrefs`. */
  prefs?: BoardPrefs;
  addLabel?: string;
  emptyLabel?: string;
  overlay?: ReactNode;
};

export default function Board<T extends { id: string }>({
  columns,
  items,
  columnOf,
  renderCard,
  getLabel,
  onMove,
  onOpen,
  onPeek,
  onAdd,
  renderColumnTop,
  sorts = [],
  onReorder,
  prefs,
  addLabel = "Add",
  emptyLabel = "Nothing here yet",
  overlay,
}: BoardProps<T>) {
  const { belowLg } = useMobileBreakpoints();
  const mounted = useMounted();
  // dnd-kit's own id counter differs between server and client renders.
  const dndId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [settledId, setSettledId] = useState<string | null>(null);
  const [edgeDir, setEdgeDir] = useState<EdgeDirection>(0);
  const [snapping, setSnapping] = useState(true);
  const placementRef = useRef<Placement | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<Point | null>(null);
  const edgeRef = useRef<{ dir: EdgeDirection; timer: number | null }>({
    dir: 0,
    timer: null,
  });
  const lockRef = useRef<{ columnId: string; at: Point } | null>(null);
  const snapTimerRef = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const onTouchMove = (event: TouchEvent) => {
      const point = eventPoint(event);
      if (point) pointerRef.current = point;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    document.body.classList.add("cursor-grabbing", "select-none");
    return () => {
      document.body.classList.remove("cursor-grabbing", "select-none");
    };
  }, [activeId]);

  useEffect(
    () => () => {
      if (edgeRef.current.timer) window.clearTimeout(edgeRef.current.timer);
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    },
    [],
  );

  const byColumn = useMemo(() => {
    const map: Record<string, T[]> = {};
    for (const column of columns) map[column.id] = [];
    for (const item of items) map[columnOf(item)]?.push(item);
    return map;
  }, [columns, items, columnOf]);

  const activeItem = activeId
    ? (items.find((item) => item.id === activeId) ?? null)
    : null;

  const hiddenIds = prefs?.hidden;
  const visibleColumns = hiddenIds
    ? columns.filter((column) => !hiddenIds.has(column.id))
    : columns;
  const hiddenColumns = hiddenIds
    ? columns.filter((column) => hiddenIds.has(column.id))
    : [];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(byColumn).map(([id, list]) => [id, list.length]),
      ),
    [byColumn],
  );

  const hideColumn = (column: BoardColumnDef) => {
    if (!prefs) return;
    prefs.setHidden(column.id, true);
    toast(`${column.name} moved to hidden columns`, () =>
      prefs.setHidden(column.id, false),
    );
  };
  const showColumn = (column: BoardColumnDef) => {
    prefs?.setHidden(column.id, false);
  };
  const sortColumn = (column: BoardColumnDef, sort: BoardSort<T>) => {
    const ids = [...(byColumn[column.id] ?? [])]
      .sort(sort.compare)
      .map((item) => item.id);
    onReorder?.(column.id, ids, sort);
  };

  const updatePlacement = useCallback((next: Placement | null) => {
    placementRef.current = next;
    setPlacement(next);
  }, []);

  const columnOffsets = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return [];
    const base = scroller.getBoundingClientRect().left - scroller.scrollLeft;
    return Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-column-id]"),
    ).map((element) => ({
      id: element.dataset.columnId as string,
      left: element.getBoundingClientRect().left - base,
    }));
  };

  const nearestColumn = (
    offsets: { id: string; left: number }[],
    left: number,
  ) =>
    offsets.reduce(
      (best, item, index) =>
        Math.abs(item.left - left) < Math.abs(offsets[best].left - left)
          ? index
          : best,
      0,
    );

  const pageBoard = (dir: EdgeDirection) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const offsets = columnOffsets();
    if (offsets.length === 0) return;
    const current = nearestColumn(offsets, scroller.scrollLeft);
    const target =
      offsets[Math.min(offsets.length - 1, Math.max(0, current + dir))];
    if (!target || Math.abs(target.left - scroller.scrollLeft) < 1) return;
    scroller.scrollTo({ left: target.left, behavior: "smooth" });
    const pointer = pointerRef.current;
    lockRef.current = pointer ? { columnId: target.id, at: pointer } : null;
  };

  const clearEdge = () => {
    if (edgeRef.current.timer) window.clearTimeout(edgeRef.current.timer);
    edgeRef.current = { dir: 0, timer: null };
    setEdgeDir((dir) => (dir === 0 ? dir : 0));
  };

  const armEdge = (dir: EdgeDirection) => {
    if (edgeRef.current.dir === dir) return;
    if (edgeRef.current.timer) window.clearTimeout(edgeRef.current.timer);
    edgeRef.current = {
      dir,
      timer: window.setTimeout(() => {
        edgeRef.current.timer = null;
        pageBoard(dir);
      }, EDGE_DWELL),
    };
    setEdgeDir(dir);
  };

  const updateEdge = (pointer: Point, hit: Element | null) => {
    const scroller = scrollerRef.current;
    if (
      !scroller ||
      !hit ||
      !scroller.contains(hit) ||
      scroller.scrollWidth <= scroller.clientWidth + 1
    ) {
      clearEdge();
      return;
    }
    const rect = scroller.getBoundingClientRect();
    const zone = Math.min(EDGE_ZONE_MAX, rect.width * EDGE_ZONE_RATIO);
    const canRight =
      scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
    const canLeft = scroller.scrollLeft > 1;
    if (canRight && pointer.x >= rect.right - zone) armEdge(1);
    else if (canLeft && pointer.x <= rect.left + zone) armEdge(-1);
    else clearEdge();
  };

  const realignColumns = () => {
    const scroller = scrollerRef.current;
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    if (!scroller || !belowLg) {
      setSnapping(true);
      return;
    }
    const offsets = columnOffsets();
    if (offsets.length === 0) {
      setSnapping(true);
      return;
    }
    const target = offsets[nearestColumn(offsets, scroller.scrollLeft)];
    if (Math.abs(target.left - scroller.scrollLeft) < 1) {
      setSnapping(true);
      return;
    }
    scroller.scrollTo({ left: target.left, behavior: "smooth" });
    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null;
      setSnapping(true);
    }, REALIGN_DURATION);
  };

  const computePlacement = (pointer: Point, id: string): Placement | null => {
    const hit = document.elementFromPoint(pointer.x, pointer.y);
    updateEdge(pointer, hit);
    const hiddenRow = hit?.closest<HTMLElement>("[data-hidden-column]");
    if (hiddenRow?.dataset.hiddenColumn) {
      lockRef.current = null;
      return {
        columnId: hiddenRow.dataset.hiddenColumn,
        index: Number.MAX_SAFE_INTEGER,
        beforeId: null,
        hidden: true,
      };
    }
    const lock = lockRef.current;
    if (
      lock &&
      Math.hypot(pointer.x - lock.at.x, pointer.y - lock.at.y) > LOCK_RADIUS
    ) {
      lockRef.current = null;
    }
    const columnId =
      lockRef.current?.columnId ??
      hit?.closest<HTMLElement>("[data-column-id]")?.dataset.columnId;
    if (!columnId) return null;
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-column-id="${columnId}"] [data-board-card]`,
      ),
    ).filter((card) => card.dataset.boardCard !== id);
    let index = 0;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (pointer.y > rect.top + rect.height / 2) index += 1;
      else break;
    }
    return {
      columnId,
      index,
      beforeId: cards[index]?.dataset.boardCard ?? null,
      hidden: false,
    };
  };

  const samePlacement = (a: Placement | null, b: Placement | null) =>
    a === b ||
    (a !== null &&
      b !== null &&
      a.columnId === b.columnId &&
      a.index === b.index &&
      a.hidden === b.hidden);

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    pointerRef.current = eventPoint(activatorEvent);
    lockRef.current = null;
    setSnapping(false);
    setActiveId(String(active.id));
    updatePlacement(null);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const origin = eventPoint(event.activatorEvent);
    // Keyboard drags have no pointer; fall back to the dragged node's centre.
    const rect = event.active.rect.current.translated;
    const pointer =
      (origin ? pointerRef.current : null) ??
      (rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null);
    if (!pointer) return;
    const next = computePlacement(pointer, String(event.active.id));
    if (!samePlacement(placementRef.current, next)) updatePlacement(next);
  };

  const finish = () => {
    markDragEnd();
    clearEdge();
    lockRef.current = null;
    setActiveId(null);
    updatePlacement(null);
    realignColumns();
  };

  const onDragEnd = ({ active }: DragEndEvent) => {
    const id = String(active.id);
    const target = placementRef.current;
    const item = items.find((entry) => entry.id === id);
    if (item && target) {
      const column = byColumn[columnOf(item)] ?? [];
      const next = column[column.findIndex((entry) => entry.id === id) + 1];
      const unchanged =
        columnOf(item) === target.columnId &&
        target.beforeId === (next?.id ?? null);
      if (!unchanged) {
        setSettledId(id);
        window.setTimeout(() => setSettledId(null), 150);
        const moved = onMove(id, target.columnId, target.beforeId);
        if (
          moved !== false &&
          target.hidden &&
          columnOf(item) !== target.columnId
        ) {
          const name = columns.find((c) => c.id === target.columnId)?.name;
          toast(`Moved to ${name ?? "a hidden column"}`);
        }
      }
    }
    finish();
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={{ threshold: { x: 0, y: 0.2 } }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press Enter to open. Press Space to pick the card up, use the arrow keys to move it, and Space again to drop it.",
        },
      }}
    >
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <motion.div
            ref={scrollerRef}
            layoutScroll
            className={cn(
              "scrollbar-none flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-(--page-x) pb-4 lg:snap-none",
              !snapping && "snap-none",
            )}
          >
            {visibleColumns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                items={byColumn[column.id] ?? []}
                activeItem={activeItem}
                placement={placement}
                settledId={settledId}
                renderCard={renderCard}
                getLabel={getLabel}
                onOpen={onOpen}
                onPeek={onPeek}
                onAdd={onAdd}
                onHide={hideColumn}
                sorts={sorts}
                onSort={onReorder ? sortColumn : undefined}
                top={renderColumnTop?.(column.id)}
                addLabel={addLabel}
                emptyLabel={emptyLabel}
              />
            ))}
            {visibleColumns.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <h2 className="title-style">Every column is hidden</h2>
                <p className="caption-style text-fg-tertiary max-w-64 leading-snug">
                  Bring a column back from the hidden columns panel.
                </p>
                {prefs && (
                  <Button variant="secondary" size="sm" onClick={prefs.showAll}>
                    Show all columns
                  </Button>
                )}
              </div>
            )}
          </motion.div>
          <div
            aria-hidden
            className={cn(
              "from-foreground/[0.06] z-sticky-header duration-fast pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r to-transparent transition-opacity",
              edgeDir === -1 ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden
            className={cn(
              "from-foreground/[0.06] z-sticky-header duration-fast pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l to-transparent transition-opacity",
              edgeDir === 1 ? "opacity-100" : "opacity-0",
            )}
          />
          {overlay}
        </div>
        {prefs && (
          <HiddenColumnsPanel
            prefs={prefs}
            columns={hiddenColumns}
            counts={counts}
            overId={placement?.hidden ? placement.columnId : null}
            onShow={showColumn}
            onShowAll={prefs.showAll}
          />
        )}
      </div>
      {mounted &&
        createPortal(
          <DragOverlay
            dropAnimation={null}
            zIndex={80}
            className="pointer-events-none"
          >
            {activeItem && (
              <CardSurface lifted>{renderCard(activeItem)}</CardSurface>
            )}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}
