import {
  hasInput,
  portsOf,
  type GraphEdge,
  type GraphNode,
  type PortId,
} from "@/lib/domain/automations";
import type { View } from "./editor-store";

export type Point = { x: number; y: number };
export type OpenPort = { source: GraphNode; port: PortId; point: Point };

export const NODE_WIDTH = 320;
export const NODE_HEIGHT = 108;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 1.25;
export const GRID_SIZE = 12;

const NODE_GAP = 80;
const BRANCH_SPREAD = 170;
const BRANCH_END = 80;
const OUT_END = 52;
const ELBOW = 36;
const CORNER = 8;
const STRAIGHT = 24;

export { hasInput, portsOf };

export const nodeHeight = (node: GraphNode, sizes: Record<string, number>) =>
  sizes[node.id] ?? NODE_HEIGHT;

export const inputPoint = (node: GraphNode): Point => ({
  x: node.x + NODE_WIDTH / 2,
  y: node.y,
});

export const outputPoint = (node: GraphNode, height: number): Point => ({
  x: node.x + NODE_WIDTH / 2,
  y: node.y + height,
});

/** First port branches left, second right; a single port goes straight down. */
export function portSide(node: GraphNode, port: PortId) {
  const ports = portsOf(node);
  if (ports.length < 2) return 0;
  return ports.indexOf(port) === 0 ? -1 : 1;
}

export function endpointPoint(
  node: GraphNode,
  height: number,
  port: PortId,
): Point {
  const origin = outputPoint(node, height);
  const side = portSide(node, port);
  if (side === 0) return { x: origin.x, y: origin.y + OUT_END };
  return { x: origin.x + side * BRANCH_SPREAD, y: origin.y + BRANCH_END };
}

export function openPorts(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sizes: Record<string, number>,
): OpenPort[] {
  return nodes.flatMap((node) =>
    portsOf(node)
      .filter(
        (port) =>
          !edges.some((edge) => edge.source === node.id && edge.port === port),
      )
      .map((port) => ({
        source: node,
        port,
        point: endpointPoint(node, nodeHeight(node, sizes), port),
      })),
  );
}

export function placementFor(
  source: GraphNode,
  port: PortId,
  sizes: Record<string, number>,
): Point {
  const origin = outputPoint(source, nodeHeight(source, sizes));
  const side = portSide(source, port);
  const drop = side === 0 ? NODE_GAP : NODE_GAP + ELBOW;
  return {
    x: origin.x + side * (BRANCH_SPREAD + 30) - NODE_WIDTH / 2,
    y: origin.y + drop,
  };
}

export function freePlacement(
  point: Point,
  nodes: GraphNode[],
  sizes: Record<string, number>,
): Point {
  const overlaps = (candidate: Point) =>
    nodes.some(
      (node) =>
        candidate.x < node.x + NODE_WIDTH + 24 &&
        candidate.x + NODE_WIDTH + 24 > node.x &&
        candidate.y < node.y + nodeHeight(node, sizes) + 24 &&
        candidate.y + NODE_HEIGHT > node.y,
    );
  let candidate = point;
  for (let step = 0; step < 24 && overlaps(candidate); step++) {
    candidate = { x: candidate.x + NODE_WIDTH + 40, y: candidate.y };
  }
  return candidate;
}

export function routePoints(source: Point, target: Point): Point[] {
  const drop = target.y - source.y;
  if (drop >= CORNER * 3) {
    if (Math.abs(target.x - source.x) < STRAIGHT) return [source, target];
    const elbow = source.y + Math.min(ELBOW, drop / 2);
    return [
      source,
      { x: source.x, y: elbow },
      { x: target.x, y: elbow },
      target,
    ];
  }
  const lane = Math.max(source.x, target.x) + NODE_WIDTH / 2 + ELBOW;
  const below = source.y + CORNER * 3;
  const above = target.y - CORNER * 3;
  return [
    source,
    { x: source.x, y: below },
    { x: lane, y: below },
    { x: lane, y: above },
    { x: target.x, y: above },
    target,
  ];
}

export function roundedPath(points: Point[]) {
  const [first, ...rest] = points;
  let path = `M${first.x} ${first.y}`;
  for (let index = 0; index < rest.length; index++) {
    const corner = rest[index];
    const next = rest[index + 1];
    if (!next) {
      path += ` L${corner.x} ${corner.y}`;
      break;
    }
    const previous = points[index];
    const inLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(CORNER, inLength / 2, outLength / 2);
    if (radius < 0.5) {
      path += ` L${corner.x} ${corner.y}`;
      continue;
    }
    const inX = (corner.x - previous.x) / inLength;
    const inY = (corner.y - previous.y) / inLength;
    const outX = (next.x - corner.x) / outLength;
    const outY = (next.y - corner.y) / outLength;
    const sweep = inX * outY - inY * outX > 0 ? 1 : 0;
    path += ` L${corner.x - inX * radius} ${corner.y - inY * radius}`;
    path += ` A${radius} ${radius} 0 0 ${sweep} ${corner.x + outX * radius} ${corner.y + outY * radius}`;
  }
  return path;
}

export function labelPoint(points: Point[]): Point {
  if (points.length === 4) {
    return {
      x: points[1].x + (points[2].x - points[1].x) * 0.55,
      y: points[1].y,
    };
  }
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }
  const middle = Math.floor((points.length - 1) / 2);
  return {
    x: (points[middle].x + points[middle + 1].x) / 2,
    y: (points[middle].y + points[middle + 1].y) / 2,
  };
}

export function actionPoint(points: Point[]): Point {
  const last = points.at(-1)!;
  const beforeLast = points.at(-2)!;
  return { x: last.x, y: (last.y + beforeLast.y) / 2 };
}

export type SnapBox = { x: number; y: number; width: number; height: number };

function alignAxis(
  moving: SnapBox,
  others: SnapBox[],
  tolerance: number,
  axis: "x" | "y",
) {
  const center =
    axis === "x" ? moving.x + moving.width / 2 : moving.y + moving.height / 2;
  let best = 0;
  let closest = tolerance;
  for (const other of others) {
    const otherCenter =
      axis === "x" ? other.x + other.width / 2 : other.y + other.height / 2;
    const delta = otherCenter - center;
    if (Math.abs(delta) > closest) continue;
    closest = Math.abs(delta);
    best = delta;
  }
  return best;
}

export function snapToNodes(
  moving: SnapBox,
  others: SnapBox[],
  tolerance: number,
): Point {
  return {
    x: moving.x + alignAxis(moving, others, tolerance, "x"),
    y: moving.y + alignAxis(moving, others, tolerance, "y"),
  };
}

export function toWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: View,
): Point {
  return {
    x: (clientX - rect.left - rect.width / 2 - view.x) / view.zoom,
    y: (clientY - rect.top - view.y) / view.zoom,
  };
}

export const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export function zoomAround(
  view: View,
  zoom: number,
  localX: number,
  localY: number,
  width: number,
): View {
  const next = clampZoom(zoom);
  const worldX = (localX - width / 2 - view.x) / view.zoom;
  const worldY = (localY - view.y) / view.zoom;
  return {
    zoom: next,
    x: localX - width / 2 - worldX * next,
    y: localY - worldY * next,
  };
}
