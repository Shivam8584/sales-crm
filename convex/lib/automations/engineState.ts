import { internal } from "../../_generated/api";
import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  type ExitKind,
  type GraphNode,
  isLive,
  type PortId,
  SUBJECT_REF,
  type Trigger,
} from "../../../lib/domain/automations";
import type { Subject, SubjectRef } from "./subject";

export type Automation = Doc<"automations">;
export type Enrollment = Doc<"automationEnrollments">;
export type Published = NonNullable<Automation["published"]>;
type Level = Doc<"automationSteps">["level"];
export type EnrollmentStatus = Enrollment["status"];

export const DAY = 24 * 60 * 60_000;
export const MAX_ATTEMPTS = 4;
export const RETRY_BASE_MS = 30_000;
const HISTORY_LIMIT = 100;
export const ROTATION_KEY = "automations.roundRobin";

// ── Bookkeeping ─────────────────────────────────────────────────────────────

export async function logStep(
  ctx: MutationCtx,
  enrollment: Pick<Enrollment, "_id" | "automationId">,
  level: Level,
  message: string,
  nodeId?: string,
  stepKey?: string,
) {
  await ctx.db.insert("automationSteps", {
    automationId: enrollment.automationId,
    enrollmentId: enrollment._id,
    nodeId,
    stepKey,
    at: Date.now(),
    level,
    message,
  });
}

const STAT: Record<EnrollmentStatus, keyof Automation["stats"] | null> = {
  running: "active",
  waiting: "active",
  completed: "completed",
  exited: "exited",
  failed: "failed",
};

export async function bumpStats(
  ctx: MutationCtx,
  automationId: Id<"automations">,
  changes: Partial<Record<keyof Automation["stats"], number>>,
) {
  const automation = await ctx.db.get(automationId);
  if (!automation) return;
  const stats = { ...automation.stats };
  for (const [key, delta] of Object.entries(changes) as [
    keyof Automation["stats"],
    number,
  ][]) {
    stats[key] = Math.max(0, stats[key] + delta);
  }
  await ctx.db.patch(automationId, { stats });
}

export const withHistory = (
  enrollment: Enrollment,
  nodeId: string,
  outcome: string,
) => [
  ...enrollment.history.slice(-(HISTORY_LIMIT - 1)),
  { nodeId, at: Date.now(), outcome },
];

export function subjectOf(enrollment: Enrollment): SubjectRef {
  const id =
    enrollment[SUBJECT_REF[enrollment.subjectKind]] ??
    enrollment.subjectKey.split(":")[1];
  return { kind: enrollment.subjectKind, id };
}

/** Moves the enrollment on under a new step key and schedules that step. */
export async function scheduleStep(
  ctx: MutationCtx,
  enrollment: Enrollment,
  patch: Partial<Enrollment>,
  at?: number,
) {
  const seq = enrollment.seq + 1;
  const stepKey = `${enrollment._id}:${seq}`;
  await ctx.db.patch(enrollment._id, { ...patch, seq, stepKey, attempt: 0 });
  const args = { enrollmentId: enrollment._id, stepKey };
  if (at !== undefined && at > Date.now()) {
    await ctx.scheduler.runAt(at, internal.automations.run, args);
  } else {
    await ctx.scheduler.runAfter(0, internal.automations.run, args);
  }
}

/** Ends a run; any step still scheduled for it becomes stale. */
export async function finish(
  ctx: MutationCtx,
  enrollment: Enrollment,
  status: "completed" | "exited" | "failed",
  reason: string,
  nodeId?: string,
  kind?: ExitKind,
) {
  if (!isLive(enrollment.status)) return;
  const now = Date.now();
  await ctx.db.patch(enrollment._id, {
    status,
    finishedAt: now,
    exitReason: reason,
    exitKind:
      status === "completed"
        ? undefined
        : (kind ?? (status === "failed" ? "failed" : undefined)),
    pausedById: undefined,
    nextRunAt: undefined,
    waitStartedAt: undefined,
    waitingFor: undefined,
    heldAt: undefined,
    seq: enrollment.seq + 1,
    stepKey: `${enrollment._id}:${enrollment.seq + 1}`,
    history: withHistory(
      enrollment,
      nodeId ?? enrollment.currentNodeId,
      status,
    ),
  });
  await bumpStats(ctx, enrollment.automationId, {
    active: -1,
    [STAT[status]!]: 1,
  });
  await logStep(
    ctx,
    enrollment,
    status === "failed" ? "error" : status === "completed" ? "success" : "info",
    status === "completed"
      ? `Completed: ${reason}`
      : `${status === "failed" ? "Failed" : "Exited"}: ${reason}`,
    nodeId ?? enrollment.currentNodeId,
  );
}

export type Outcome =
  | {
      type: "next";
      port: PortId;
      level: Level;
      message: string;
      skipped?: boolean;
    }
  | { type: "defer"; at: number; message: string }
  | { type: "wait"; at: number; waitingFor?: Trigger; message: string }
  | { type: "exit"; reason: string; kind?: ExitKind };

export type StepContext = {
  automation: Automation;
  published: Published;
  enrollment: Enrollment;
  node: GraphNode;
  subject: Subject;
  now: number;
  stepKey: string;
};
