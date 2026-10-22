import { DAY } from "./automations-internal";
import { type EnrollmentStatus, isLive } from "./automations-model";

// ── Runs: exits, funnel, frequency ──────────────────────────────────────────

export const EXIT_KINDS = [
  "goal",
  "replied",
  "manual",
  "exit_step",
  "automation",
  "record_gone",
  "deleted",
  "step_removed",
  "no_consent",
  "failed",
] as const;
export type ExitKind = (typeof EXIT_KINDS)[number];

export const EXIT_KIND_LABEL: Record<ExitKind | "other", string> = {
  goal: "Reached the goal",
  replied: "Replied or engaged",
  manual: "Removed by a teammate",
  exit_step: "Reached an exit step",
  automation: "Removed by another automation",
  record_gone: "Record archived or erased",
  deleted: "Automation deleted",
  step_removed: "Step removed in a new version",
  no_consent: "No consent to contact",
  failed: "A step kept failing",
  other: "Other",
};

export type RunSummary = {
  status: EnrollmentStatus;
  currentNodeId: string;
  history: { nodeId: string; outcome: string; at: number }[];
};

export type NodeFunnel = {
  /** Runs that arrived at the step. */
  reached: number;
  /** Runs that went on from it, including skipped sends. */
  passed: number;
  /** Runs on it now. */
  current: number;
  skipped: number;
  /** Runs that ended on it: exited, failed, or completed with nothing after. */
  ended: number;
  ports: Record<string, number>;
  lastAt: number | null;
};

const END_OUTCOMES = new Set(["completed", "exited", "failed"]);

/** Per step: how many runs reached it, went on, are on it now and which path they took. */
export function nodeFunnel(runs: RunSummary[]) {
  const stats: Record<string, NodeFunnel> = {};
  const at = (nodeId: string) =>
    (stats[nodeId] ??= {
      reached: 0,
      passed: 0,
      current: 0,
      skipped: 0,
      ended: 0,
      ports: {},
      lastAt: null,
    });
  for (const run of runs) {
    const reached = new Set<string>();
    const passed = new Set<string>();
    for (const entry of run.history) {
      const item = at(entry.nodeId);
      reached.add(entry.nodeId);
      item.ports[entry.outcome] = (item.ports[entry.outcome] ?? 0) + 1;
      item.lastAt = Math.max(item.lastAt ?? 0, entry.at);
      if (END_OUTCOMES.has(entry.outcome)) {
        if (!passed.has(entry.nodeId)) item.ended++;
      } else {
        passed.add(entry.nodeId);
        if (entry.outcome === "skipped") item.skipped++;
      }
    }
    if (isLive(run.status)) {
      at(run.currentNodeId).current++;
      reached.add(run.currentNodeId);
    }
    for (const nodeId of reached) at(nodeId).reached++;
    for (const nodeId of passed) at(nodeId).passed++;
  }
  return stats;
}

export const FREQUENCY_WINDOW_DAYS = 7;
export const FREQUENCY_CAP = { min: 1, max: 20, default: 3 } as const;

/**
 * When the next message may go to someone who already got `sent` (epoch ms)
 * in the rolling window, or null when they're under the cap.
 */
export function frequencyHoldUntil(sent: number[], now: number, cap: number) {
  const window = FREQUENCY_WINDOW_DAYS * DAY;
  const recent = sent.filter((at) => at > now - window).sort((a, b) => a - b);
  if (recent.length < cap) return null;
  return recent[recent.length - cap] + window;
}

export const isValidFrequencyCap = (value: number) =>
  Number.isInteger(value) &&
  value >= FREQUENCY_CAP.min &&
  value <= FREQUENCY_CAP.max;

/** Share of `part` in `whole` as a whole percentage; null when there's nothing to divide. */
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;
