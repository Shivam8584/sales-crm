import {
  type Graph,
  LIMITS,
  NODE_KINDS,
  type PortId,
  PORTS,
} from "./automations-model";

/** Structural checks that apply even to drafts, so stored graphs stay well formed. */
export function checkGraphShape(graph: Graph): string | null {
  if (graph.nodes.length > LIMITS.nodes)
    return `Use up to ${LIMITS.nodes} steps`;
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length) return "Two steps share an id";
  if (graph.nodes.filter((node) => node.kind === "trigger").length !== 1) {
    return "Keep exactly one trigger";
  }
  for (const node of graph.nodes) {
    if (!NODE_KINDS.includes(node.kind)) return "Unknown step";
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y))
      return "Invalid position";
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      return "A connection points to a missing step";
    }
    if (!PORTS.includes(edge.port)) return "Unknown path";
  }
  return null;
}

export function nextNodeId(graph: Graph, from: string, port: PortId) {
  return (
    graph.edges.find((edge) => edge.source === from && edge.port === port)
      ?.target ?? null
  );
}

/** Steps in the order a run meets them: breadth-first from the trigger, then anything unconnected. */
export function stepOrder(graph: Graph) {
  const trigger = graph.nodes.find((node) => node.kind === "trigger");
  const order: string[] = [];
  const seen = new Set<string>();
  const queue = trigger ? [trigger.id] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    const next = graph.edges
      .filter((edge) => edge.source === id)
      .sort((a, b) => PORTS.indexOf(a.port) - PORTS.indexOf(b.port));
    for (const edge of next) queue.push(edge.target);
  }
  for (const node of [...graph.nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!seen.has(node.id)) order.push(node.id);
  }
  return order;
}
