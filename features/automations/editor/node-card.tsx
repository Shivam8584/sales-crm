"use client";

import { memo, useEffect, useRef } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import Button from "@/components/_ui/button";
import { hasInput, type GraphNode } from "@/lib/domain/automations";
import { cn } from "@/lib/utils";
import DragIcon from "@/public/assets/icons/automations/drag.svg";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import { NODE_META } from "../node-meta";
import { NODE_WIDTH } from "./geometry";

export type RunMark = "active" | "done" | "skipped" | "idle";

export type StepCounts = { reached: number; passed: number; current: number };

type NodeCardProps = {
  node: GraphNode;
  title: string;
  detail: string | null;
  issues: string[];
  counts?: StepCounts;
  selected: boolean;
  targeted: boolean;
  dragging: boolean;
  editing: boolean;
  readOnly: boolean;
  runMark: RunMark;
  onMeasure: (id: string, height: number) => void;
  onNodePointerDown: (id: string, event: ReactPointerEvent) => void;
  onHandlePointerDown: (id: string, event: ReactPointerEvent) => void;
  onOpen: (id: string) => void;
};

const handle =
  "absolute left-1/2 size-2 -translate-x-1/2 rounded-full bg-fg-tertiary";

const RUN_LABEL: Record<Exclude<RunMark, "idle">, string> = {
  active: "Running",
  done: "Done",
  skipped: "Skipped",
};

function NodeCard({
  node,
  title,
  detail,
  issues,
  counts,
  selected,
  targeted,
  dragging,
  editing,
  readOnly,
  runMark,
  onMeasure,
  onNodePointerDown,
  onHandlePointerDown,
  onOpen,
}: NodeCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const meta = NODE_META[node.kind];
  const live = counts?.current ?? 0;
  const reached = counts?.reached ?? 0;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      onMeasure(node.id, element.offsetHeight),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [node.id, onMeasure]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(node.id);
    }
  };

  return (
    <div
      ref={ref}
      data-node={node.id}
      data-selected={selected || undefined}
      data-targeted={targeted || undefined}
      data-dragging={dragging || undefined}
      data-run={runMark === "idle" ? undefined : runMark}
      style={
        {
          "--node-x": `${node.x}px`,
          "--node-y": `${node.y}px`,
          width: NODE_WIDTH,
        } as CSSProperties
      }
      className="group/node absolute top-0 left-0 [translate:var(--node-x)_var(--node-y)] data-dragging:z-10"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`${meta.label}: ${title}${issues.length ? `, ${issues.length} to fix` : ""}${reached ? `, ${reached} reached, ${counts?.passed ?? 0} passed` : ""}`}
        onPointerDown={(event) => onNodePointerDown(node.id, event)}
        onDoubleClick={() => onOpen(node.id)}
        onKeyDown={onKeyDown}
        className={cn(
          "bg-card border-border duration-fast ease-power3-out focus-visible:ring-ring relative flex flex-col gap-1.5 rounded-xl border px-4 py-3 transition-[border-color,box-shadow] outline-none focus-visible:ring-2",
          readOnly
            ? "cursor-pointer"
            : "cursor-grab group-data-dragging/node:cursor-grabbing",
          "group-data-dragging/node:shadow-overlay group-data-selected/node:border-ring group-data-targeted/node:border-ring group-data-[run=active]/node:border-ring group-data-[run=done]/node:border-ring",
        )}
      >
        {runMark === "active" && (
          <span
            aria-hidden
            className="ring-ring/50 pointer-events-none absolute -inset-px animate-pulse rounded-[inherit] ring-2 motion-reduce:animate-none"
          />
        )}
        <div className="text-fg-tertiary flex h-5 items-center gap-2 text-xs">
          <meta.Icon aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{meta.label}</span>
          {issues.length > 0 && runMark === "idle" && (
            <span
              title={issues[0]}
              className="text-warning flex shrink-0 items-center gap-1"
            >
              <AlertIcon aria-hidden className="size-3.5" />
              {issues.length > 1 ? issues.length : "Fix"}
            </span>
          )}
          {live > 0 && runMark === "idle" && (
            <span
              title={`${live} ${live === 1 ? "record is" : "records are"} on this step now`}
              className="flex shrink-0 items-center gap-1 tabular-nums"
            >
              <span className="bg-ring size-1.5 rounded-full" />
              {live}
            </span>
          )}
          {runMark !== "idle" && (
            <span key={runMark} className="flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  "bg-ring size-1.5 rounded-full",
                  runMark === "active" && "animate-pulse",
                  runMark === "skipped" && "ring-ring bg-transparent ring-1",
                )}
              />
              {RUN_LABEL[runMark]}
            </span>
          )}
          {!readOnly && runMark === "idle" && (
            <DragIcon
              aria-hidden
              className="duration-fast size-4 shrink-0 opacity-0 transition-opacity group-hover/node:opacity-100"
            />
          )}
        </div>
        <div className="flex flex-col gap-0.5 text-sm leading-5">
          <span className="line-clamp-2 font-medium">{title}</span>
          {detail && (
            <span className="text-fg-tertiary line-clamp-2">{detail}</span>
          )}
        </div>
        {reached > 0 && runMark === "idle" && (
          <div className="text-fg-tertiary flex items-center gap-1.5 text-xs tabular-nums">
            <span title="Runs that reached this step">
              {reached.toLocaleString("en-IN")} reached
            </span>
            {node.kind !== "exit" && (
              <>
                <span aria-hidden>·</span>
                <span title="Runs that went on from this step">
                  {(counts?.passed ?? 0).toLocaleString("en-IN")} passed
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {hasInput(node) && <span aria-hidden className={cn(handle, "-top-1")} />}
      {node.kind !== "exit" && (
        <span
          role="presentation"
          onPointerDown={(event) => onHandlePointerDown(node.id, event)}
          className={cn(
            handle,
            "-bottom-1 before:absolute before:-inset-2 before:rounded-full",
            readOnly ? "pointer-events-none" : "cursor-crosshair",
          )}
        />
      )}

      {selected && !dragging && !editing && (
        <div
          onPointerDown={(event) => event.stopPropagation()}
          className="duration-fast ease-power3-out absolute -top-9 right-0 transition-[opacity,translate] starting:translate-y-1 starting:opacity-0"
        >
          <Button variant="secondary" size="xs" onClick={() => onOpen(node.id)}>
            {readOnly ? "View" : "Edit"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default memo(NodeCard);
