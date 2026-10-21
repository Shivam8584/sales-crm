import { create } from "zustand";
import type {
  Graph,
  GraphEdge,
  GraphNode,
  PortId,
  SimStep,
} from "@/lib/domain/automations";

export type View = { x: number; y: number; zoom: number };
export type Selection = { type: "node" | "edge"; id: string } | null;
export type InspectorTab = "build" | "rules" | "status" | "logs";

export type RunState = {
  status: "idle" | "running" | "done";
  activeNodeId: string | null;
  activeEdgeId: string | null;
  visited: string[];
  traversed: string[];
  steps: SimStep[];
  subject: string | null;
};

export const IDLE_RUN: RunState = {
  status: "idle",
  activeNodeId: null,
  activeEdgeId: null,
  visited: [],
  traversed: [],
  steps: [],
  subject: null,
};

export const DEFAULT_VIEW: View = { x: 0, y: 72, zoom: 1 };
const HISTORY_LIMIT = 60;

type Command = { type: "fit" | "focus"; nodeId?: string; nonce: number };

type EditorState = {
  automationId: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Bumped on every graph edit so the page knows to save. */
  revision: number;
  sizes: Record<string, number>;
  view: View;
  selection: Selection;
  inspector: { nodeId: string; tab: InspectorTab } | null;
  past: Graph[];
  future: Graph[];
  run: RunState;
  command: Command | null;
  load: (automationId: string, graph: Graph) => void;
  setView: (update: (view: View) => View) => void;
  setSize: (id: string, height: number) => void;
  select: (selection: Selection) => void;
  openInspector: (nodeId: string, tab?: InspectorTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  closeInspector: () => void;
  checkpoint: () => void;
  addNode: (
    node: GraphNode,
    from: { source: string; port: PortId } | null,
  ) => void;
  moveNode: (id: string, x: number, y: number) => void;
  updateNode: (id: string, patch: Partial<GraphNode>) => void;
  updateConfig: (id: string, patch: Record<string, unknown>) => void;
  connect: (source: string, port: PortId, target: string) => void;
  removeSelection: () => void;
  undo: () => void;
  redo: () => void;
  setRun: (patch: Partial<RunState>) => void;
  clearRun: () => void;
  request: (type: Command["type"], nodeId?: string) => void;
};

const snapshot = (state: Pick<EditorState, "nodes" | "edges">): Graph => ({
  nodes: state.nodes,
  edges: state.edges,
});

export const useEditorStore = create<EditorState>((set, get) => {
  /** Applies a graph change, recording the previous graph for undo. */
  const commit = (
    change: (state: EditorState) => Partial<Graph>,
    record = true,
  ) =>
    set((state) => ({
      ...change(state),
      revision: state.revision + 1,
      ...(record
        ? {
            past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
            future: [],
          }
        : {}),
    }));

  return {
    automationId: null,
    nodes: [],
    edges: [],
    revision: 0,
    sizes: {},
    view: DEFAULT_VIEW,
    selection: null,
    inspector: null,
    past: [],
    future: [],
    run: IDLE_RUN,
    command: null,

    load: (automationId, graph) =>
      set({
        automationId,
        nodes: graph.nodes,
        edges: graph.edges,
        revision: 0,
        sizes: {},
        view: DEFAULT_VIEW,
        selection: null,
        inspector: null,
        past: [],
        future: [],
        run: IDLE_RUN,
        command: { type: "fit", nonce: Date.now() },
      }),

    setView: (update) => set((state) => ({ view: update(state.view) })),
    setSize: (id, height) =>
      set((state) =>
        state.sizes[id] === height
          ? state
          : { sizes: { ...state.sizes, [id]: height } },
      ),
    select: (selection) => set({ selection }),
    openInspector: (nodeId, tab) =>
      set((state) => ({
        inspector: {
          nodeId,
          tab:
            tab ??
            (state.inspector?.nodeId === nodeId
              ? state.inspector.tab
              : "build"),
        },
        selection: { type: "node", id: nodeId },
      })),
    setInspectorTab: (tab) =>
      set((state) =>
        state.inspector ? { inspector: { ...state.inspector, tab } } : state,
      ),
    closeInspector: () => set({ inspector: null }),

    checkpoint: () =>
      set((state) => ({
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      })),

    addNode: (node, from) =>
      commit((state) => ({
        nodes: [...state.nodes, node],
        edges: from
          ? [
              ...state.edges.filter(
                (edge) =>
                  !(edge.source === from.source && edge.port === from.port),
              ),
              {
                id: `${from.source}-${from.port}-${node.id}`,
                source: from.source,
                port: from.port,
                target: node.id,
              },
            ]
          : state.edges,
      })),

    moveNode: (id, x, y) =>
      commit(
        (state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? { ...node, x, y } : node,
          ),
        }),
        false,
      ),

    updateNode: (id, patch) =>
      commit(
        (state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? { ...node, ...patch } : node,
          ),
        }),
        false,
      ),

    updateConfig: (id, patch) =>
      commit(
        (state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id
              ? { ...node, config: { ...node.config, ...patch } }
              : node,
          ),
          edges: state.edges.filter((edge) => {
            if (edge.source !== id || !("mode" in patch)) return true;
            const event = patch.mode === "event";
            return event ? edge.port !== "out" : edge.port === "out";
          }),
        }),
        false,
      ),

    connect: (source, port, target) => {
      if (source === target) return;
      commit((state) => ({
        edges: [
          ...state.edges.filter(
            (edge) => !(edge.source === source && edge.port === port),
          ),
          { id: `${source}-${port}-${target}`, source, port, target },
        ],
      }));
    },

    removeSelection: () => {
      const { selection, nodes } = get();
      if (!selection) return;
      if (selection.type === "node") {
        const node = nodes.find((item) => item.id === selection.id);
        if (!node || node.kind === "trigger") return;
      }
      commit((state) =>
        selection.type === "edge"
          ? { edges: state.edges.filter((edge) => edge.id !== selection.id) }
          : {
              nodes: state.nodes.filter((node) => node.id !== selection.id),
              edges: state.edges.filter(
                (edge) =>
                  edge.source !== selection.id && edge.target !== selection.id,
              ),
            },
      );
      set((state) => ({
        selection: null,
        inspector:
          state.inspector?.nodeId === selection.id ? null : state.inspector,
      }));
    },

    undo: () =>
      set((state) => {
        const previous = state.past.at(-1);
        if (!previous) return state;
        return {
          ...previous,
          past: state.past.slice(0, -1),
          future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
          revision: state.revision + 1,
          selection: null,
        };
      }),

    redo: () =>
      set((state) => {
        const next = state.future[0];
        if (!next) return state;
        return {
          ...next,
          future: state.future.slice(1),
          past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
          revision: state.revision + 1,
          selection: null,
        };
      }),

    setRun: (patch) => set((state) => ({ run: { ...state.run, ...patch } })),
    clearRun: () => set({ run: IDLE_RUN }),
    request: (type, nodeId) =>
      set({ command: { type, nodeId, nonce: Date.now() } }),
  };
});
