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
import { NODE_META, toneVars } from "../node-meta";
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
  "absolute left-1/2 size-2 -translate-x-1/2 rounded-full bg-(--accent) shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_30%,transparent)]";

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
          ...toneVars(meta.tone),
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
          "duration-fast ease-power3-out focus-visible:ring-ring relative flex flex-col gap-[3px] rounded-xl border border-(--accent-border) bg-(--accent-surface) px-[5px] pt-[5px] pb-[7px] transition-[border-color,box-shadow] outline-none focus-visible:ring-2",
          readOnly
            ? "cursor-pointer"
            : "cursor-grab group-data-dragging/node:cursor-grabbing",
          "group-data-dragging/node:shadow-overlay group-data-selected/node:border-(--accent) group-data-targeted/node:border-(--accent) group-data-targeted/node:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
          "group-data-[run=active]/node:border-(--accent) group-data-[run=active]/node:shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_28%,transparent)] group-data-[run=done]/node:border-(--accent)",
        )}
      >
        {runMark === "active" && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-px animate-pulse rounded-[inherit] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_55%,transparent)] motion-reduce:animate-none"
          />
        )}
        <div className="flex h-8 items-center gap-2 px-1.5">
          <meta.Icon aria-hidden className="size-4 shrink-0 text-(--accent)" />
          <span className="min-w-0 flex-1 truncate text-sm leading-5 font-medium text-(--accent)">
            {meta.label}
          </span>
          {issues.length > 0 && runMark === "idle" && (
            <span
              title={issues[0]}
              className="text-warning flex shrink-0 items-center gap-1 text-xs leading-none font-medium"
            >
              <AlertIcon aria-hidden className="size-3.5" />
              {issues.length > 1 ? issues.length : "Fix"}
            </span>
          )}
          {live > 0 && runMark === "idle" && (
            <span
              title={`${live} ${live === 1 ? "record is" : "records are"} on this step now`}
              className="flex h-5 shrink-0 items-center gap-1 rounded-full bg-(--accent)/12 px-2 text-xs leading-none font-medium text-(--accent) tabular-nums"
            >
              <span className="size-1.5 rounded-full bg-(--accent)" />
              {live}
            </span>
          )}
          {runMark !== "idle" ? (
            <span
              key={runMark}
              className="flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-(--accent)/12 px-2 text-xs leading-none font-medium text-(--accent)"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full bg-(--accent)",
                  runMark === "active" && "animate-pulse",
                  runMark === "skipped" &&
                    "bg-transparent ring-1 ring-(--accent)",
                )}
              />
              {RUN_LABEL[runMark]}
            </span>
          ) : (
            node.kind === "trigger" && (
              <span className="flex h-5 shrink-0 items-center rounded-full bg-(--accent)/15 px-2 text-xs leading-none font-semibold text-(--accent)">
                WHEN
              </span>
            )
          )}
          {!readOnly && runMark === "idle" && (
            <DragIcon
              aria-hidden
              className="text-fg-tertiary duration-fast size-4 shrink-0 opacity-0 transition-opacity group-hover/node:opacity-100"
            />
          )}
        </div>
        <div className="bg-card shadow-card flex flex-col gap-1 rounded-[9px] px-3.5 py-3 text-sm leading-5">
          <span className="text-foreground line-clamp-2 font-medium">
            {title}
          </span>
          {detail && (
            <span className="text-fg-tertiary line-clamp-2">{detail}</span>
          )}
        </div>
        {reached > 0 && runMark === "idle" && (
          <div className="flex h-5 items-center gap-1.5 px-1.5 pt-1 text-xs leading-4 font-medium text-(--accent) tabular-nums">
            <span title="Runs that reached this step">
              {reached.toLocaleString("en-IN")} reached
            </span>
            {node.kind !== "exit" && (
              <>
                <span aria-hidden className="opacity-50">
                  ·
                </span>
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
