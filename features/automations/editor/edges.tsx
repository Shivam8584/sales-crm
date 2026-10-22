"use client";

import { Fragment } from "react";
import { useReducedMotion } from "motion/react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import Button from "@/components/_ui/button";
import {
  PORT_LABEL,
  type GraphEdge,
  type GraphNode,
  type PortId,
} from "@/lib/domain/automations";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/automations/chevron-down.svg";
import type { Selection } from "./editor-store";
import {
  actionPoint,
  inputPoint,
  labelPoint,
  nodeHeight,
  openPorts,
  outputPoint,
  roundedPath,
  routePoints,
  type Point,
} from "./geometry";

export type EdgePreview = {
  from: Point;
  to: Point;
};

type EdgesProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sizes: Record<string, number>;
  selection: Selection;
  snapKey: string | null;
  preview: EdgePreview | null;
  activeEdgeId: string | null;
  traversed: string[];
  readOnly: boolean;
  onEdgePointerDown: (id: string, event: ReactPointerEvent) => void;
  onEndpointPointerDown: (
    source: string,
    port: PortId,
    event: ReactPointerEvent,
  ) => void;
  onDeleteEdge: () => void;
};

export const portKey = (source: string, port: PortId) => `${source}:${port}`;

const at = (point: Point) =>
  ({
    "--point-x": `${point.x}px`,
    "--point-y": `${point.y}px`,
  }) as CSSProperties;

function PortLabel({ point, port }: { point: Point; port: PortId }) {
  if (!PORT_LABEL[port]) return null;
  return (
    <span
      style={at(point)}
      className="bg-well text-fg-secondary pointer-events-none absolute [top:var(--point-y)] [left:var(--point-x)] flex h-5 -translate-x-1/2 -translate-y-1/2 items-center rounded-full px-2 text-xs leading-none"
    >
      {PORT_LABEL[port]}
    </span>
  );
}

function EdgePath({ path, className }: { path: string; className?: string }) {
  return (
    <path
      d={path}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      className={cn("stroke-line-strong", className)}
    />
  );
}

export default function Edges({
  nodes,
  edges,
  sizes,
  selection,
  snapKey,
  preview,
  activeEdgeId,
  traversed,
  readOnly,
  onEdgePointerDown,
  onEndpointPointerDown,
  onDeleteEdge,
}: EdgesProps) {
  const reduceMotion = useReducedMotion();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const routed = edges.flatMap((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return [];
    const from = outputPoint(source, nodeHeight(source, sizes));
    const to = inputPoint(target);
    const points = routePoints(from, to);
    return [
      { edge, source, target, from, to, points, path: roundedPath(points) },
    ];
  });
  const labels: { id: string; point: Point; port: PortId }[] = [];
  for (const { edge, points } of routed) {
    if (!PORT_LABEL[edge.port]) continue;
    const preferred = labelPoint(points);
    const taken = labels.some(
      (label) =>
        Math.abs(label.point.x - preferred.x) < 64 &&
        Math.abs(label.point.y - preferred.y) < 24,
    );
    labels.push({
      id: edge.id,
      port: edge.port,
      point: taken ? actionPoint(points) : preferred,
    });
  }
  const open = readOnly ? [] : openPorts(nodes, edges, sizes);
  const selectedEdge =
    selection?.type === "edge"
      ? routed.find((item) => item.edge.id === selection.id)
      : undefined;

  return (
    <>
      <svg
        aria-hidden
        width="1"
        height="1"
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
      >
        {routed.map(({ edge, path }) => {
          const selected =
            selection?.type === "edge" && selection.id === edge.id;
          const lit = selected || traversed.includes(edge.id);
          return (
            <g key={edge.id} className="group/edge">
              <EdgePath
                path={path}
                className={cn(
                  "duration-fast transition-[stroke]",
                  lit ? "stroke-ring" : "group-hover/edge:stroke-fg-tertiary",
                )}
              />
              {activeEdgeId === edge.id && (
                <path
                  d={path}
                  fill="none"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="4 8"
                  className="stroke-foreground"
                >
                  {!reduceMotion && (
                    <animate
                      attributeName="stroke-dashoffset"
                      from="12"
                      to="0"
                      dur="0.5s"
                      repeatCount="indefinite"
                    />
                  )}
                </path>
              )}
              {!readOnly && (
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  onPointerDown={(event) => onEdgePointerDown(edge.id, event)}
                  className="pointer-events-[stroke] cursor-pointer"
                />
              )}
            </g>
          );
        })}
        {open.map(({ source, port, point }) => {
          if (snapKey === portKey(source.id, port)) return null;
          const from = outputPoint(source, nodeHeight(source, sizes));
          return (
            <EdgePath
              key={portKey(source.id, port)}
              path={roundedPath(routePoints(from, point))}
              className="opacity-50"
            />
          );
        })}
        {preview && (
          <EdgePath
            path={roundedPath(routePoints(preview.from, preview.to))}
            className="stroke-ring"
          />
        )}
      </svg>

      {labels.map(({ id, point, port }) => (
        <PortLabel key={id} point={point} port={port} />
      ))}

      {open.map(({ source, port, point }) => {
        const key = portKey(source.id, port);
        const from = outputPoint(source, nodeHeight(source, sizes));
        return (
          <Fragment key={key}>
            <PortLabel
              point={labelPoint(routePoints(from, point))}
              port={port}
            />
            <span
              role="presentation"
              data-snapped={snapKey === key || undefined}
              style={at(point)}
              onPointerDown={(event) =>
                onEndpointPointerDown(source.id, port, event)
              }
              className="bg-foreground text-background duration-fast absolute [top:var(--point-y)] [left:var(--point-x)] flex size-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full transition-transform before:absolute before:-inset-2 before:rounded-full hover:scale-125 data-snapped:scale-150"
            >
              <ChevronDownIcon aria-hidden className="size-2.5" />
            </span>
          </Fragment>
        );
      })}

      {selectedEdge && !readOnly && (
        <div
          style={at(actionPoint(selectedEdge.points))}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute [top:var(--point-y)] [left:var(--point-x)] -translate-x-1/2 -translate-y-1/2 transition-opacity starting:opacity-0"
        >
          <Button variant="secondary" size="xs" onClick={onDeleteEdge}>
            Delete
          </Button>
        </div>
      )}
    </>
  );
}
