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
import { NODE_META } from "../node-meta";
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
  fromColor: string;
  toColor: string;
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

export const accentOf = (node: GraphNode) =>
  `var(--tag-${NODE_META[node.kind].tone}-text)`;

const at = (point: Point) =>
  ({
    "--point-x": `${point.x}px`,
    "--point-y": `${point.y}px`,
  }) as CSSProperties;

function PortLabel({ point, port }: { point: Point; port: PortId }) {
  if (!PORT_LABEL[port]) return null;
  const positive = port === "yes" || port === "met";
  return (
    <span
      style={at(point)}
      className={cn(
        "pointer-events-none absolute [top:var(--point-y)] [left:var(--point-x)] flex h-5 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border px-2 text-[11px] leading-none font-semibold tracking-wide",
        positive
          ? "border-(--tag-teal-border) bg-(--tag-teal-bg) text-(--tag-teal-text)"
          : "border-(--tag-neutral-border) bg-(--tag-neutral-bg) text-(--tag-neutral-text)",
      )}
    >
      {PORT_LABEL[port]}
    </span>
  );
}

function GradientPath({
  id,
  from,
  to,
  fromColor,
  toColor,
  path,
  className,
}: {
  id: string;
  from: Point;
  to: Point;
  fromColor: string;
  toColor: string;
  path: string;
  className?: string;
}) {
  const flat = Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5;
  return (
    <>
      <defs>
        <linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1={from.x}
          y1={from.y}
          x2={flat ? from.x : to.x}
          y2={flat ? from.y + 1 : to.y}
        >
          <stop style={{ stopColor: fromColor }} />
          <stop offset="1" style={{ stopColor: toColor }} />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={2}
        strokeLinecap="round"
        className={className}
      />
    </>
  );
}

const svgId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

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
        {routed.map(({ edge, source, target, from, to, path }) => {
          const selected =
            selection?.type === "edge" && selection.id === edge.id;
          const lit = selected || traversed.includes(edge.id);
          return (
            <g key={edge.id} className="group/edge">
              <GradientPath
                id={`edge-${svgId(edge.id)}`}
                from={from}
                to={to}
                fromColor={accentOf(source)}
                toColor={accentOf(target)}
                path={path}
                className={cn(
                  "duration-fast transition-opacity",
                  lit
                    ? "opacity-100"
                    : "opacity-50 group-hover/edge:opacity-80",
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
            <GradientPath
              key={portKey(source.id, port)}
              id={`stub-${svgId(source.id)}-${port}`}
              from={from}
              to={point}
              fromColor={accentOf(source)}
              toColor="var(--fg-tertiary)"
              path={roundedPath(routePoints(from, point))}
              className="opacity-50"
            />
          );
        })}
        {preview && (
          <GradientPath
            id="edge-preview"
            from={preview.from}
            to={preview.to}
            fromColor={preview.fromColor}
            toColor={preview.toColor}
            path={roundedPath(routePoints(preview.from, preview.to))}
            className="opacity-80"
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
              className="bg-foreground text-background duration-fast absolute [top:var(--point-y)] [left:var(--point-x)] flex size-3 -translate-x-1/2 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full shadow-[0_0_0_3px_var(--overlay-4)] transition-[box-shadow] before:absolute before:-inset-2 before:rounded-full hover:shadow-[0_0_0_5px_var(--overlay-4)] data-snapped:shadow-[0_0_0_7px_var(--overlay-5)]"
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
