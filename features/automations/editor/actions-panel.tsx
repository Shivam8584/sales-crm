"use client";

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  Ref,
} from "react";
import Button from "@/components/_ui/button";
import type { NodeKind } from "@/lib/domain/automations";
import { cn } from "@/lib/utils";
import DragIcon from "@/public/assets/icons/automations/drag.svg";
import ExpandIcon from "@/public/assets/icons/automations/expand.svg";
import { ACTION_GROUPS, NODE_META } from "../node-meta";

type ActionsPanelProps = {
  ref?: Ref<HTMLElement>;
  open: boolean;
  draggingKind: NodeKind | null;
  onToggle: () => void;
  onItemPointerDown: (kind: NodeKind, event: ReactPointerEvent) => void;
  onAdd: (kind: NodeKind) => void;
};

function ActionItem({
  kind,
  dragging,
  onPointerDown,
  onAdd,
}: {
  kind: NodeKind;
  dragging: boolean;
  onPointerDown: (kind: NodeKind, event: ReactPointerEvent) => void;
  onAdd: (kind: NodeKind) => void;
}) {
  const meta = NODE_META[kind];
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onAdd(kind);
  };
  return (
    <li
      role="button"
      tabIndex={0}
      aria-label={`Add ${meta.label}`}
      title={meta.hint}
      data-dragging={dragging || undefined}
      onPointerDown={(event) => onPointerDown(kind, event)}
      onKeyDown={onKeyDown}
      className="group/item hover:bg-overlay-2 focus-visible:bg-overlay-2 focus-visible:ring-ring duration-fast flex h-9 w-full cursor-grab touch-none items-center gap-2.5 rounded-lg px-2 transition-[background-color,opacity] outline-none select-none focus-visible:ring-2 active:cursor-grabbing data-dragging:opacity-50"
    >
      <meta.Icon aria-hidden className="text-fg-tertiary size-4 shrink-0" />
      <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
        {meta.label}
      </span>
      <DragIcon
        aria-hidden
        className="text-fg-tertiary duration-fast size-4 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-visible/item:opacity-100"
      />
    </li>
  );
}

/** The palette of steps: drag one onto the canvas, or click (Enter) to add it at the next open slot. */
export default function ActionsPanel({
  ref,
  open,
  draggingKind,
  onToggle,
  onItemPointerDown,
  onAdd,
}: ActionsPanelProps) {
  return (
    <aside
      ref={ref}
      aria-label="Steps"
      data-canvas-overlay
      onPointerDown={(event) => event.stopPropagation()}
      className="bg-popover shadow-overlay border-border absolute top-3 left-3 z-20 flex max-h-[calc(100%-24px)] w-[min(264px,calc(100%-24px))] flex-col overflow-clip rounded-xl border"
    >
      <div className="flex h-11 shrink-0 items-center justify-between pr-1.5 pl-4">
        <span className="text-sm font-medium">Steps</span>
        <Button
          variant="ghost"
          size="icon"
          aria-expanded={open}
          aria-controls="automation-steps-body"
          aria-label={open ? "Collapse steps" : "Expand steps"}
          onClick={onToggle}
        >
          <ExpandIcon
            aria-hidden
            className={cn("size-4", open && "rotate-180")}
          />
        </Button>
      </div>
      <div
        id="automation-steps-body"
        data-open={open || undefined}
        inert={!open}
        className="duration-slow ease-power3-out grid min-h-0 grid-rows-[0fr] transition-[grid-template-rows] data-open:grid-rows-[1fr] motion-reduce:transition-none"
      >
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 overflow-y-auto px-2 pb-3">
            {ACTION_GROUPS.map((group) => (
              <section
                key={group.label}
                aria-label={group.label}
                className="mt-1"
              >
                <h3 className="text-fg-tertiary px-2 py-1.5 text-xs">
                  {group.label}
                </h3>
                <ul className="flex flex-col gap-0.5">
                  {group.kinds.map((kind) => (
                    <ActionItem
                      key={kind}
                      kind={kind}
                      dragging={draggingKind === kind}
                      onPointerDown={onItemPointerDown}
                      onAdd={onAdd}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ActionGhost({
  kind,
  x,
  y,
  snapped,
}: {
  kind: NodeKind;
  x: number;
  y: number;
  snapped: boolean;
}) {
  const meta = NODE_META[kind];
  return (
    <div
      aria-hidden
      style={
        {
          "--ghost-x": `${x}px`,
          "--ghost-y": `${y}px`,
        } as CSSProperties
      }
      className="pointer-events-none fixed top-0 left-0 z-50 [translate:var(--ghost-x)_var(--ghost-y)]"
    >
      <div
        data-snapped={snapped || undefined}
        className="bg-popover shadow-overlay border-border duration-fast flex h-9 w-60 items-center gap-2.5 rounded-lg border px-2 transition-[opacity,scale] data-snapped:scale-[0.96] data-snapped:opacity-60 starting:scale-[0.96] starting:opacity-0"
      >
        <meta.Icon aria-hidden className="text-fg-tertiary size-4" />
        <span className="flex-1 text-sm font-medium">{meta.label}</span>
        <DragIcon aria-hidden className="text-fg-tertiary size-4" />
      </div>
    </div>
  );
}
