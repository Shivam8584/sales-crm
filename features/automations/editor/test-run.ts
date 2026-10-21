import type { SimStep } from "@/lib/domain/automations";
import { useEditorStore } from "./editor-store";

const STEP_MS = 650;
const EDGE_MS = 380;

let token = 0;

const { getState } = useEditorStore;

function pause(ms: number, run: number) {
  return new Promise<boolean>((resolve) =>
    window.setTimeout(() => resolve(run === token), ms),
  );
}

export function stopTestRun() {
  token += 1;
  getState().clearRun();
}

/** Plays a dry run's path on the canvas, step by step. */
export async function playTestRun(steps: SimStep[], subject: string) {
  const run = ++token;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const visited: string[] = [];
  const traversed: string[] = [];
  getState().setRun({
    status: "running",
    activeNodeId: null,
    activeEdgeId: null,
    visited,
    traversed,
    steps: [],
    subject,
  });
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    getState().setRun({
      activeNodeId: step.nodeId,
      activeEdgeId: null,
      steps: steps.slice(0, index + 1),
    });
    getState().request("focus", step.nodeId);
    if (!reduced && !(await pause(STEP_MS, run))) return;
    visited.push(step.nodeId);
    getState().setRun({ visited: [...visited] });
    const next = steps[index + 1];
    if (!next || !step.port) continue;
    const edge = getState().edges.find(
      (item) =>
        item.source === step.nodeId &&
        item.port === step.port &&
        item.target === next.nodeId,
    );
    if (!edge) continue;
    getState().setRun({ activeNodeId: null, activeEdgeId: edge.id });
    if (!reduced && !(await pause(EDGE_MS, run))) return;
    traversed.push(edge.id);
    getState().setRun({ traversed: [...traversed] });
  }
  if (run !== token) return;
  getState().setRun({ status: "done", activeNodeId: null, activeEdgeId: null });
  const last = steps.at(-1);
  if (!last) return;
  getState().openInspector(last.nodeId, "logs");
  getState().request("focus", last.nodeId);
}
