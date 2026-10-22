"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { animate, type AnimationPlaybackControls } from "motion";
import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import {
  type GraphNode,
  type NodeKind,
  type PortId,
  type SubjectKind,
} from "@/lib/domain/automations";
import { cn } from "@/lib/utils";
import FitIcon from "@/public/assets/icons/automations/fit-view.svg";
import ZoomInIcon from "@/public/assets/icons/automations/zoom-in.svg";
import ZoomOutIcon from "@/public/assets/icons/automations/zoom-out.svg";
import ActionsPanel, { ActionGhost } from "./actions-panel";
import { newNode } from "./defaults";
import Edges, { portKey, type EdgePreview } from "./edges";
import { useEditorStore, type View } from "./editor-store";
import {
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_HEIGHT,
  NODE_WIDTH,
  clampZoom,
  freePlacement,
  hasInput,
  inputPoint,
  nodeHeight,
  openPorts,
  outputPoint,
  placementFor,
  portsOf,
  snapToNodes,
  toWorld,
  zoomAround,
  type OpenPort,
  type Point,
} from "./geometry";
import NodeCard, { type RunMark, type StepCounts } from "./node-card";

type PaletteDrag = {
  kind: NodeKind;
  clientX: number;
  clientY: number;
  grabX: number;
  grabY: number;
  snap: OpenPort | null;
  placement: Point | null;
};

type LinkDrag = {
  source: string;
  port: PortId | null;
  pointer: Point;
  target: string | null;
};
type PointerEnd = (event: PointerEvent, cancelled: boolean) => void;

const SNAP_RADIUS = 48;
const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 1.25;
const PANEL_INSET = 280;
const INSPECTOR_INSET = 460;
const SNAP_TOLERANCE = 10;
const READABLE_ZOOM = 0.8;
const CROWDED_WIDTH = 1280;

const { getState } = useEditorStore;

function trackPointer(
  onMove: (event: PointerEvent) => void,
  onEnd: PointerEnd,
) {
  const up = (event: PointerEvent) => {
    stop();
    onEnd(event, false);
  };
  const cancel = (event: PointerEvent) => {
    stop();
    onEnd(event, true);
  };
  function stop() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  return stop;
}

function findSnap(world: Point, zoom: number) {
  const { nodes, edges, sizes } = getState();
  let best: { port: OpenPort; placement: Point } | null = null;
  let bestDistance = Infinity;
  for (const port of openPorts(nodes, edges, sizes)) {
    const placement = placementFor(port.source, port.port, sizes);
    const distance =
      Math.hypot(world.x - port.point.x, world.y - port.point.y) * zoom;
    const inside =
      world.x >= placement.x &&
      world.x <= placement.x + NODE_WIDTH &&
      world.y >= port.point.y - 12 &&
      world.y <= placement.y + NODE_HEIGHT;
    if ((distance <= SNAP_RADIUS || inside) && distance < bestDistance) {
      best = { port, placement: freePlacement(placement, nodes, sizes) };
      bestDistance = distance;
    }
  }
  return best;
}

function nodeAt(world: Point, exclude: string) {
  const { nodes, sizes } = getState();
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    if (node.id === exclude || !hasInput(node)) continue;
    if (
      world.x >= node.x &&
      world.x <= node.x + NODE_WIDTH &&
      world.y >= node.y - 16 &&
      world.y <= node.y + nodeHeight(node, sizes)
    ) {
      return node.id;
    }
  }
  return null;
}

function resolvePort(link: LinkDrag): PortId | null {
  if (link.port) return link.port;
  const source = getState().nodes.find((node) => node.id === link.source);
  if (!source) return null;
  const ports = portsOf(source);
  if (ports.length < 2) return ports[0] ?? null;
  return link.pointer.x < source.x + NODE_WIDTH / 2 ? ports[0] : ports[1];
}

export type CanvasPanelApi = {
  focusNode: (id: string) => void;
  appendTo: (sourceId: string, kind: NodeKind) => void;
};

const CanvasApi = createContext<CanvasPanelApi | null>(null);

/** Canvas actions for overlays rendered inside it, like the step panel. */
export function useCanvasApi() {
  const value = useContext(CanvasApi);
  if (!value) throw new Error("useCanvasApi outside the canvas");
  return value;
}

type CanvasProps = {
  subjectKind: SubjectKind;
  readOnly: boolean;
  describe: (node: GraphNode) => { title: string; detail: string | null };
  issues: Record<string, string[]>;
  /** Real runs per step, shown under each card. */
  counts: Record<string, StepCounts>;
  /** Overlays such as the step panel; they reach canvas actions through `useCanvasApi`. */
  children?: ReactNode;
};

/** Pan/zoom workflow canvas: drag steps from the palette, connect ports, drag to arrange. */
export default function Canvas({
  subjectKind,
  readOnly,
  describe,
  issues,
  counts,
  children,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const animationRef = useRef<AnimationPlaybackControls | null>(null);

  const nodes = useEditorStore((state) => state.nodes);
  const edges = useEditorStore((state) => state.edges);
  const sizes = useEditorStore((state) => state.sizes);
  const selection = useEditorStore((state) => state.selection);
  const view = useEditorStore((state) => state.view);
  const run = useEditorStore((state) => state.run);
  const setView = useEditorStore((state) => state.setView);
  const setSize = useEditorStore((state) => state.setSize);
  const removeSelection = useEditorStore((state) => state.removeSelection);
  const inspectorNodeId = useEditorStore(
    (state) => state.inspector?.nodeId ?? null,
  );
  const command = useEditorStore((state) => state.command);

  const { belowMd } = useMobileBreakpoints();
  const [canvasWidth, setCanvasWidth] = useState(0);
  const inspecting = Boolean(inspectorNodeId);
  // A manual toggle holds until the step panel opens or closes.
  const [panelOverride, setPanelOverride] = useState<{
    open: boolean;
    inspecting: boolean;
  } | null>(null);
  const crowded = inspecting && canvasWidth < CROWDED_WIDTH;
  const panelOpen =
    panelOverride && panelOverride.inspecting === inspecting
      ? panelOverride.open
      : !belowMd && !crowded;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setCanvasWidth(element.clientWidth),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [palette, setPalette] = useState<PaletteDrag | null>(null);
  const [link, setLink] = useState<LinkDrag | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  const bounds = useCallback(
    () => containerRef.current!.getBoundingClientRect(),
    [],
  );

  const track = useCallback(
    (onMove: (event: PointerEvent) => void, onEnd: PointerEnd) => {
      stopTrackingRef.current?.();
      stopTrackingRef.current = trackPointer(onMove, (event, cancelled) => {
        stopTrackingRef.current = null;
        onEnd(event, cancelled);
      });
    },
    [],
  );

  const stopAnimation = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const animateView = useCallback(
    (update: (view: View) => View) => {
      stopAnimation();
      const from = getState().view;
      const to = update(from);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setView(() => to);
        return;
      }
      animationRef.current = animate(0, 1, {
        duration: 0.25,
        ease: [0.76, 0, 0.24, 1],
        onUpdate: (progress) =>
          setView(() => ({
            x: from.x + (to.x - from.x) * progress,
            y: from.y + (to.y - from.y) * progress,
            zoom: from.zoom + (to.zoom - from.zoom) * progress,
          })),
        onComplete: () => {
          animationRef.current = null;
        },
      });
    },
    [setView, stopAnimation],
  );

  const cancelInteraction = useCallback(() => {
    stopTrackingRef.current?.();
    stopTrackingRef.current = null;
    setPalette(null);
    setLink(null);
    setDraggingNode(null);
    setPanning(false);
  }, []);

  useEffect(
    () => () => {
      stopTrackingRef.current?.();
      animationRef.current?.stop();
    },
    [],
  );

  const insets = useCallback(() => {
    const rect = bounds();
    const left = panelOpen && rect.width >= 900 ? PANEL_INSET : 16;
    const right =
      getState().inspector && rect.width >= 1100 ? INSPECTOR_INSET : 16;
    return { rect, left, right };
  }, [bounds, panelOpen]);

  const reveal = useCallback(
    (node: GraphNode) => {
      const { rect, left, right } = insets();
      const current = getState().view;
      const height = nodeHeight(node, getState().sizes);
      const screenX = rect.width / 2 + current.x + node.x * current.zoom;
      const screenY = current.y + node.y * current.zoom;
      const visible =
        screenX >= left &&
        screenX + NODE_WIDTH * current.zoom <= rect.width - right &&
        screenY >= 16 &&
        screenY + height * current.zoom <= rect.height - 16;
      if (visible) return;
      const centerX = left + (rect.width - left - right) / 2;
      animateView((value) => ({
        ...value,
        x: centerX - rect.width / 2 - (node.x + NODE_WIDTH / 2) * value.zoom,
        y: rect.height / 2 - (node.y + height / 2) * value.zoom,
      }));
    },
    [animateView, insets],
  );

  const createNode = useCallback(
    (
      kind: NodeKind,
      position: Point,
      from: { source: string; port: PortId } | null,
    ) => {
      const node = newNode(kind, position, subjectKind);
      getState().addNode(node, from);
      return node;
    },
    [subjectKind],
  );

  const addToNextSlot = useCallback(
    (kind: NodeKind) => {
      if (readOnly) return;
      const state = getState();
      const ports = openPorts(state.nodes, state.edges, state.sizes);
      const preferred =
        ports.find(
          (port) =>
            state.selection?.type === "node" &&
            port.source.id === state.selection.id,
        ) ?? ports.at(-1);
      let node: GraphNode;
      if (preferred) {
        node = createNode(
          kind,
          freePlacement(
            placementFor(preferred.source, preferred.port, state.sizes),
            state.nodes,
            state.sizes,
          ),
          { source: preferred.source.id, port: preferred.port },
        );
      } else {
        const rect = bounds();
        const center = toWorld(
          rect.left + rect.width / 2,
          rect.top + rect.height / 3,
          rect,
          state.view,
        );
        node = createNode(
          kind,
          freePlacement(
            { x: center.x - NODE_WIDTH / 2, y: center.y },
            state.nodes,
            state.sizes,
          ),
          null,
        );
      }
      getState().openInspector(node.id, "build");
      reveal(node);
    },
    [bounds, createNode, readOnly, reveal],
  );

  const resolvePalette = useCallback(
    (
      kind: NodeKind,
      clientX: number,
      clientY: number,
      grabX: number,
      grabY: number,
    ): PaletteDrag => {
      const base = {
        kind,
        clientX,
        clientY,
        grabX,
        grabY,
        snap: null,
        placement: null,
      };
      const rect = bounds();
      const panel = panelRef.current?.getBoundingClientRect();
      const overPanel =
        panel &&
        clientX >= panel.left &&
        clientX <= panel.right &&
        clientY >= panel.top &&
        clientY <= panel.bottom;
      const inside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      if (overPanel || !inside) return base;
      const current = getState().view;
      const world = toWorld(clientX, clientY, rect, current);
      const snap = findSnap(world, current.zoom);
      if (snap) return { ...base, snap: snap.port, placement: snap.placement };
      return {
        ...base,
        placement: { x: world.x - NODE_WIDTH / 2, y: world.y - 18 },
      };
    },
    [bounds],
  );

  const onItemPointerDown = useCallback(
    (kind: NodeKind, event: ReactPointerEvent) => {
      if (event.button !== 0 || readOnly) return;
      const item = event.currentTarget.getBoundingClientRect();
      const grabX = event.clientX - item.left;
      const grabY = event.clientY - item.top;
      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;
      track(
        (move) => {
          if (
            !active &&
            Math.hypot(move.clientX - startX, move.clientY - startY) <
              DRAG_THRESHOLD
          ) {
            return;
          }
          active = true;
          setPalette(
            resolvePalette(kind, move.clientX, move.clientY, grabX, grabY),
          );
        },
        (end, cancelled) => {
          setPalette(null);
          if (cancelled) return;
          if (!active) {
            addToNextSlot(kind);
            return;
          }
          const drop = resolvePalette(
            kind,
            end.clientX,
            end.clientY,
            grabX,
            grabY,
          );
          if (!drop.placement) return;
          const node = createNode(
            kind,
            drop.placement,
            drop.snap
              ? { source: drop.snap.source.id, port: drop.snap.port }
              : null,
          );
          getState().openInspector(node.id, "build");
        },
      );
    },
    [addToNextSlot, createNode, readOnly, resolvePalette, track],
  );

  const onNodePointerDown = useCallback(
    (id: string, event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const state = getState();
      state.select({ type: "node", id });
      if (readOnly) return;
      const node = state.nodes.find((item) => item.id === id);
      if (!node) return;
      const zoom = state.view.zoom;
      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;
      track(
        (move) => {
          const deltaX = move.clientX - startX;
          const deltaY = move.clientY - startY;
          if (!active) {
            if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
            active = true;
            getState().checkpoint();
            setDraggingNode(id);
          }
          const current = getState();
          const moving = {
            x: node.x + deltaX / zoom,
            y: node.y + deltaY / zoom,
            width: NODE_WIDTH,
            height: nodeHeight(node, current.sizes),
          };
          const others = current.nodes
            .filter((item) => item.id !== id)
            .map((item) => ({
              x: item.x,
              y: item.y,
              width: NODE_WIDTH,
              height: nodeHeight(item, current.sizes),
            }));
          const snapped = snapToNodes(moving, others, SNAP_TOLERANCE / zoom);
          current.moveNode(id, Math.round(snapped.x), Math.round(snapped.y));
        },
        () => setDraggingNode(null),
      );
    },
    [readOnly, track],
  );

  const startLink = useCallback(
    (source: string, port: PortId | null, event: ReactPointerEvent) => {
      if (event.button !== 0 || readOnly) return;
      event.stopPropagation();
      const measure = (clientX: number, clientY: number): LinkDrag => {
        const pointer = toWorld(clientX, clientY, bounds(), getState().view);
        return { source, port, pointer, target: nodeAt(pointer, source) };
      };
      setLink(measure(event.clientX, event.clientY));
      track(
        (move) => setLink(measure(move.clientX, move.clientY)),
        (end, cancelled) => {
          setLink(null);
          if (cancelled) return;
          const result = measure(end.clientX, end.clientY);
          const resolved = resolvePort(result);
          if (!result.target || !resolved) return;
          getState().connect(source, resolved, result.target);
        },
      );
    },
    [bounds, readOnly, track],
  );

  const onHandlePointerDown = useCallback(
    (id: string, event: ReactPointerEvent) => startLink(id, null, event),
    [startLink],
  );

  const onEndpointPointerDown = useCallback(
    (source: string, port: PortId, event: ReactPointerEvent) =>
      startLink(source, port, event),
    [startLink],
  );

  const onEdgePointerDown = useCallback(
    (id: string, event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      getState().select({ type: "edge", id });
    },
    [],
  );

  const onCanvasPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    stopAnimation();
    const start = getState().view;
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;
    track(
      (move) => {
        const deltaX = move.clientX - startX;
        const deltaY = move.clientY - startY;
        if (!active) {
          if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
          active = true;
          setPanning(true);
        }
        setView(() => ({ ...start, x: start.x + deltaX, y: start.y + deltaY }));
      },
      () => {
        setPanning(false);
        if (!active) getState().select(null);
      },
    );
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-canvas-overlay]")
      )
        return;
      event.preventDefault();
      stopAnimation();
      const scale = event.deltaMode === 1 ? 16 : 1;
      const rect = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * scale * 0.01);
        setView((current) =>
          zoomAround(
            current,
            current.zoom * factor,
            event.clientX - rect.left,
            event.clientY - rect.top,
            rect.width,
          ),
        );
        return;
      }
      setView((current) => ({
        ...current,
        x: current.x - event.deltaX * scale,
        y: current.y - event.deltaY * scale,
      }));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [setView, stopAnimation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role=dialog], [role=menu], [role=listbox]",
        )
      ) {
        return;
      }
      const state = getState();
      const key = event.key.toLowerCase();
      if (
        !readOnly &&
        (event.metaKey || event.ctrlKey) &&
        (key === "z" || key === "y")
      ) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (
        !readOnly &&
        (key === "delete" || key === "backspace") &&
        state.selection
      ) {
        event.preventDefault();
        state.removeSelection();
        return;
      }
      if (key === "escape") {
        cancelInteraction();
        if (state.inspector) state.closeInspector();
        else state.select(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelInteraction, readOnly]);

  const zoomBy = (factor: number) => {
    const rect = bounds();
    animateView((current) =>
      zoomAround(
        current,
        current.zoom * factor,
        rect.width / 2,
        rect.height / 2,
        rect.width,
      ),
    );
  };

  const fitView = useCallback(
    (options: { animate?: boolean; readable?: boolean } = {}) => {
      const state = getState();
      if (!state.nodes.length || !containerRef.current) return;
      const { rect, left } = insets();
      const right = 16;
      const minX = Math.min(...state.nodes.map((node) => node.x)) - 40;
      const maxX =
        Math.max(...state.nodes.map((node) => node.x + NODE_WIDTH)) + 40;
      const minY = Math.min(...state.nodes.map((node) => node.y)) - 24;
      const maxY =
        Math.max(
          ...state.nodes.map((node) => node.y + nodeHeight(node, state.sizes)),
        ) + 72;
      const width = rect.width - left - right;
      const height = rect.height - 48;
      const byHeight = height / (maxY - minY);
      // On open, keep cards legible and let tall flows scroll instead of shrinking them.
      const zoom = clampZoom(
        Math.min(
          1,
          width / (maxX - minX),
          options.readable ? Math.max(byHeight, READABLE_ZOOM) : byHeight,
        ),
      );
      const slack = height - (maxY - minY) * zoom;
      const top = 24 + (slack > 0 ? Math.min(slack / 2, 48) : 0);
      const target = {
        zoom,
        x: left + width / 2 - rect.width / 2 - ((minX + maxX) / 2) * zoom,
        y: top - minY * zoom,
      };
      if (options.animate === false) setView(() => target);
      else animateView(() => target);
    },
    [animateView, insets, setView],
  );

  const focusNode = useCallback(
    (id: string) => {
      const node = getState().nodes.find((item) => item.id === id);
      if (node) reveal(node);
    },
    [reveal],
  );

  const appendTo = useCallback(
    (sourceId: string, kind: NodeKind) => {
      const state = getState();
      const source = state.nodes.find((node) => node.id === sourceId);
      if (!source) return;
      const port =
        openPorts(state.nodes, state.edges, state.sizes).find(
          (item) => item.source.id === sourceId,
        )?.port ?? portsOf(source)[0];
      if (!port) return;
      const node = createNode(
        kind,
        freePlacement(
          placementFor(source, port, state.sizes),
          state.nodes,
          state.sizes,
        ),
        { source: sourceId, port },
      );
      getState().openInspector(node.id, "build");
      reveal(node);
    },
    [createNode, reveal],
  );

  const handled = useRef(0);
  useEffect(() => {
    if (!command || handled.current === command.nonce) return;
    handled.current = command.nonce;
    if (command.type === "fit") {
      const frame = requestAnimationFrame(() =>
        fitView({ animate: false, readable: true }),
      );
      return () => cancelAnimationFrame(frame);
    }
    if (command.type === "focus" && command.nodeId) focusNode(command.nodeId);
  }, [command, fitView, focusNode]);

  const canvasApi = useMemo(
    () => ({ focusNode, appendTo }),
    [focusNode, appendTo],
  );

  const openNode = useCallback(
    (id: string) => {
      getState().openInspector(id);
      focusNode(id);
    },
    [focusNode],
  );

  const snapKey = palette?.snap
    ? portKey(palette.snap.source.id, palette.snap.port)
    : null;
  let preview: EdgePreview | null = null;
  const linkSource = link && nodes.find((node) => node.id === link.source);
  if (link && linkSource) {
    const target = link.target
      ? nodes.find((node) => node.id === link.target)
      : undefined;
    preview = {
      from: outputPoint(linkSource, nodeHeight(linkSource, sizes)),
      to: target ? inputPoint(target) : link.pointer,
    };
  } else if (palette?.snap && palette.placement) {
    const source = palette.snap.source;
    preview = {
      from: outputPoint(source, nodeHeight(source, sizes)),
      to: { x: palette.placement.x + NODE_WIDTH / 2, y: palette.placement.y },
    };
  }

  const grid = GRID_SIZE * view.zoom;
  const style = {
    "--view-x": `${view.x}px`,
    "--view-y": `${view.y}px`,
    "--view-zoom": view.zoom,
    backgroundImage: `radial-gradient(circle, var(--line-strong) ${Math.max(0.6, view.zoom)}px, transparent ${Math.max(0.9, view.zoom * 1.3)}px)`,
    backgroundSize: `${grid}px ${grid}px`,
    backgroundPosition: `calc(50% + ${view.x}px) ${view.y}px`,
  } as CSSProperties;

  const markFor = (id: string): RunMark => {
    if (run.activeNodeId === id) return "active";
    if (!run.visited.includes(id)) return "idle";
    return run.steps.find((step) => step.nodeId === id)?.outcome === "skipped"
      ? "skipped"
      : "done";
  };

  const interacting = Boolean(palette || link || draggingNode || panning);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-roledescription="workflow canvas"
      aria-label="Automation canvas"
      style={style}
      onPointerDown={onCanvasPointerDown}
      className="bg-background relative min-h-0 flex-1 touch-none overflow-clip select-none"
    >
      <div className="absolute top-0 left-1/2 origin-top-left [transform:translate(var(--view-x),var(--view-y))_scale(var(--view-zoom))]">
        <Edges
          nodes={nodes}
          edges={edges}
          sizes={sizes}
          selection={selection}
          snapKey={snapKey}
          preview={preview}
          activeEdgeId={run.activeEdgeId}
          traversed={run.traversed}
          readOnly={readOnly}
          onEdgePointerDown={onEdgePointerDown}
          onEndpointPointerDown={onEndpointPointerDown}
          onDeleteEdge={removeSelection}
        />

        {palette?.snap && palette.placement && (
          <div
            key={snapKey}
            aria-hidden
            style={
              {
                "--node-x": `${palette.placement.x}px`,
                "--node-y": `${palette.placement.y}px`,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              } as CSSProperties
            }
            className="border-ring pointer-events-none absolute top-0 left-0 [translate:var(--node-x)_var(--node-y)] rounded-2xl border border-dashed opacity-70 transition-opacity starting:opacity-0"
          />
        )}

        {nodes.map((node) => {
          const text = describe(node);
          return (
            <NodeCard
              key={node.id}
              node={node}
              title={text.title}
              detail={text.detail}
              issues={issues[node.id] ?? []}
              counts={counts[node.id]}
              selected={selection?.type === "node" && selection.id === node.id}
              targeted={link?.target === node.id}
              dragging={draggingNode === node.id}
              editing={inspectorNodeId === node.id}
              readOnly={readOnly}
              runMark={markFor(node.id)}
              onMeasure={setSize}
              onNodePointerDown={onNodePointerDown}
              onHandlePointerDown={onHandlePointerDown}
              onOpen={openNode}
            />
          );
        })}
      </div>

      {!readOnly && (
        <ActionsPanel
          ref={panelRef}
          open={panelOpen}
          draggingKind={palette?.kind ?? null}
          onToggle={() => setPanelOverride({ open: !panelOpen, inspecting })}
          onItemPointerDown={onItemPointerDown}
          onAdd={addToNextSlot}
        />
      )}

      <CanvasApi.Provider value={canvasApi}>{children}</CanvasApi.Provider>

      <div
        role="toolbar"
        aria-label="Canvas zoom"
        data-canvas-overlay
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute right-3 bottom-3 z-20 flex flex-col gap-2"
      >
        <Tooltip content="Zoom in" side="left">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Zoom in"
            disabled={view.zoom >= MAX_ZOOM - 0.001}
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            <ZoomInIcon aria-hidden className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Zoom out" side="left">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Zoom out"
            disabled={view.zoom <= MIN_ZOOM + 0.001}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            <ZoomOutIcon aria-hidden className="size-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Fit to screen" side="left">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Fit to screen"
            onClick={() => fitView()}
          >
            <FitIcon aria-hidden className="size-4" />
          </Button>
        </Tooltip>
      </div>

      {interacting && (
        <div
          aria-hidden
          className={cn(
            "fixed inset-0 z-40",
            link ? "cursor-crosshair" : "cursor-grabbing",
          )}
        />
      )}

      {palette && (
        <ActionGhost
          kind={palette.kind}
          x={palette.clientX - palette.grabX}
          y={palette.clientY - palette.grabY}
          snapped={Boolean(palette.snap)}
        />
      )}
    </div>
  );
}
