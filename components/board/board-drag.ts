import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

export type Placement = {
  columnId: string;
  index: number;
  beforeId: string | null;
};

let lastDragEndedAt = 0;

export function markDragEnd() {
  lastDragEndedAt = Date.now();
}

// A drag ends with a click on the card underneath; ignore that click.
export function wasJustDragged() {
  return Date.now() - lastDragEndedAt < 250;
}

/** Arrow keys jump a whole column sideways and one card up or down. */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { active, currentCoordinates, context },
) => {
  const rect = context.collisionRect;
  if (!rect) return;
  const centerX = currentCoordinates.x + rect.width / 2;
  const centerY = currentCoordinates.y + rect.height / 2;
  const columns = Array.from(
    document.querySelectorAll<HTMLElement>("[data-column-id]"),
  ).map((element) => element.getBoundingClientRect());
  const current = columns.findIndex(
    (column) => centerX >= column.left && centerX < column.right,
  );

  if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
    event.preventDefault();
    const step = event.code === "ArrowRight" ? 1 : -1;
    const target = current === -1 ? undefined : columns[current + step];
    if (!target) return currentCoordinates;
    return {
      ...currentCoordinates,
      x: target.left + (target.width - rect.width) / 2,
    };
  }

  if (event.code === "ArrowDown" || event.code === "ArrowUp") {
    event.preventDefault();
    const column =
      document.querySelectorAll<HTMLElement>("[data-column-id]")[current];
    const middles = Array.from(
      column?.querySelectorAll<HTMLElement>("[data-board-card]") ?? [],
    )
      .filter((card) => card.dataset.boardCard !== String(active))
      .map((card) => {
        const box = card.getBoundingClientRect();
        return box.top + box.height / 2;
      });
    const index = middles.filter((middle) => centerY > middle).length;
    const next = index + (event.code === "ArrowDown" ? 1 : -1);
    if (next < 0 || next > middles.length) return currentCoordinates;
    const y = next === 0 ? middles[0] - 1 : middles[next - 1] + 1;
    return { ...currentCoordinates, y: y - rect.height / 2 };
  }
};
