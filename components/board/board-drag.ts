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
