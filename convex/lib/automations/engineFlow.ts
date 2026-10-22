import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  describeTrigger,
  goalMet,
  isLive,
  matchesTrigger,
  nextNodeId,
  type PortId,
  SUBJECT_LABEL,
  SUBJECT_REF,
  subjectKey,
  type SubjectKind,
  type TriggerEvent,
} from "../../../lib/domain/automations";
import { killSwitchOn } from "./safety";
import type { RecordRefs } from "../timeline";
import { loadSubject, subjectFacts, type SubjectRef } from "./subject";
import {
  type Automation,
  bumpStats,
  type Enrollment,
  finish,
  logStep,
  type Published,
  scheduleStep,
  subjectOf,
  withHistory,
} from "./engineState";
import { fireAgentsFor } from "../agents/queue";

// ── Enrolment ───────────────────────────────────────────────────────────────

export type EnrollOutcome =
  | { outcome: "enrolled"; enrollmentId: Id<"automationEnrollments"> }
  | {
      outcome: "already" | "finished" | "inactive" | "wrong_kind" | "missing";
      message: string;
    };

export async function enroll(
  ctx: MutationCtx,
  automation: Automation,
  ref: SubjectRef,
  source: string,
  enrolledById?: Id<"members">,
  context?: Record<string, string>,
): Promise<EnrollOutcome> {
  const published = automation.published;
  if (automation.status !== "active" || !published || automation.deletedAt) {
    return {
      outcome: "inactive",
      message: `“${automation.name}” isn't active`,
    };
  }
  if (published.subjectKind !== ref.kind) {
    return {
      outcome: "wrong_kind",
      message: `“${automation.name}” runs on ${SUBJECT_LABEL[published.subjectKind][1]}`,
    };
  }
  const subject = await loadSubject(ctx, ref);
  if (!subject)
    return { outcome: "missing", message: "That record no longer exists" };
  if (subject.gone) return { outcome: "missing", message: subject.gone };

  const previous = await ctx.db
    .query("automationEnrollments")
    .withIndex("by_automation_subject", (q) =>
      q.eq("automationId", automation._id).eq("subjectKey", subject.key),
    )
    .collect();
  if (previous.some((item) => isLive(item.status))) {
    return { outcome: "already", message: `Already in “${automation.name}”` };
  }
  if (previous.length && !published.settings.allowReenroll) {
    return {
      outcome: "finished",
      message: `Already went through “${automation.name}”`,
    };
  }

  const trigger = published.graph.nodes.find((node) => node.kind === "trigger");
  if (!trigger)
    return { outcome: "inactive", message: "The automation has no trigger" };
  const now = Date.now();
  const id = await ctx.db.insert("automationEnrollments", {
    automationId: automation._id,
    version: published.version,
    subjectKind: subject.kind,
    subjectKey: subject.key,
    leadId: subject.lead?._id,
    personId: subject.person?._id,
    accountId: subject.account?._id,
    dealId: subject.deal?._id,
    status: "running",
    currentNodeId: trigger.id,
    stepKey: "",
    seq: 0,
    attempt: 0,
    enrolledAt: now,
    enrolledById,
    source,
    context: context && Object.keys(context).length ? context : undefined,
    history: [],
  });
  const enrollment = (await ctx.db.get(id))!;
  await bumpStats(ctx, automation._id, { enrolled: 1, active: 1 });
  await logStep(
    ctx,
    enrollment,
    "info",
    `Enrolled ${subject.name}: ${source}`,
    trigger.id,
  );
  await scheduleStep(ctx, enrollment, {});
  return { outcome: "enrolled", enrollmentId: id };
}

export type TriggerInput = Omit<TriggerEvent, "at" | "refs"> & {
  refs: RecordRefs;
};

export function subjectKeys(refs: RecordRefs) {
  return (Object.keys(SUBJECT_REF) as SubjectKind[])
    .map((kind) => {
      const id = refs[SUBJECT_REF[kind]];
      return id ? subjectKey(kind, id) : null;
    })
    .filter((key): key is string => Boolean(key));
}

/**
 * Tells automations something happened: enrols matching records, wakes runs
 * waiting for this event and exits runs whose goal is now met. Never throws, so
 * the change that caused the event always goes through.
 */
export async function emitAutomationTrigger(
  ctx: MutationCtx,
  input: TriggerInput,
) {
  const event: TriggerEvent = { ...input, at: Date.now() };
  await fireAgentsFor(ctx, input.kind, input.refs);
  try {
    const active = await ctx.db
      .query("automations")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const keys = subjectKeys(input.refs);
    await checkGoals(ctx, keys);
    await wakeWaiting(ctx, keys, event);
    if (await killSwitchOn(ctx)) return;
    for (const automation of active) {
      const published = automation.published;
      if (!published || automation.deletedAt) continue;
      if (!matchesTrigger(published.trigger, event)) continue;
      const id = input.refs[SUBJECT_REF[published.subjectKind]];
      if (!id) continue;
      await enroll(
        ctx,
        automation,
        { kind: published.subjectKind, id },
        describeTrigger(published.trigger),
      );
    }
  } catch (error) {
    console.error("Automation trigger failed", input.kind, error);
  }
}

async function liveFor(ctx: MutationCtx, key: string) {
  const out: Enrollment[] = [];
  for (const status of ["running", "waiting"] as const) {
    out.push(
      ...(await ctx.db
        .query("automationEnrollments")
        .withIndex("by_subject", (q) =>
          q.eq("subjectKey", key).eq("status", status),
        )
        .collect()),
    );
  }
  return out;
}

async function checkGoals(ctx: MutationCtx, keys: string[]) {
  for (const key of keys) {
    const live = await liveFor(ctx, key);
    let facts: Awaited<ReturnType<typeof subjectFacts>>["facts"] | null = null;
    for (const enrollment of live) {
      const automation = await ctx.db.get(enrollment.automationId);
      const goal = automation?.published?.settings.goal ?? [];
      if (!goal.length) continue;
      if (!facts) {
        const subject = await loadSubject(ctx, subjectOf(enrollment));
        if (!subject) break;
        facts = (await subjectFacts(ctx, subject)).facts;
      }
      if (goalMet(goal, facts)) {
        await finish(
          ctx,
          enrollment,
          "exited",
          "Reached the goal",
          undefined,
          "goal",
        );
      }
    }
  }
}

async function wakeWaiting(
  ctx: MutationCtx,
  keys: string[],
  event: TriggerEvent,
) {
  for (const key of keys) {
    const waiting = await ctx.db
      .query("automationEnrollments")
      .withIndex("by_subject", (q) =>
        q.eq("subjectKey", key).eq("status", "waiting"),
      )
      .collect();
    for (const enrollment of waiting) {
      if (
        enrollment.pausedById ||
        !enrollment.waitingFor ||
        !matchesTrigger(enrollment.waitingFor, event)
      ) {
        continue;
      }
      const automation = await ctx.db.get(enrollment.automationId);
      const graph = automation?.published?.graph;
      if (!graph) continue;
      await logStep(
        ctx,
        enrollment,
        "success",
        "The event happened → EVENT path",
        enrollment.currentNodeId,
      );
      await moveOn(ctx, enrollment, graph, enrollment.currentNodeId, "met");
    }
  }
}

export async function moveOn(
  ctx: MutationCtx,
  enrollment: Enrollment,
  graph: Published["graph"],
  fromNodeId: string,
  port: PortId,
  outcome: string = port,
) {
  const history = withHistory(enrollment, fromNodeId, outcome);
  const target = nextNodeId(graph, fromNodeId, port);
  if (!target) {
    await ctx.db.patch(enrollment._id, { history });
    await finish(
      ctx,
      { ...enrollment, history },
      "completed",
      "Reached the end",
      fromNodeId,
    );
    return;
  }
  await scheduleStep(ctx, enrollment, {
    history,
    currentNodeId: target,
    status: "running",
    nextRunAt: undefined,
    waitStartedAt: undefined,
    waitingFor: undefined,
    heldAt: undefined,
  });
}

/** Picks held runs back up after an automation is re-activated. */
export async function resumeHeld(
  ctx: MutationCtx,
  automationId: Id<"automations">,
) {
  const waiting = await ctx.db
    .query("automationEnrollments")
    .withIndex("by_automation", (q) =>
      q.eq("automationId", automationId).eq("status", "waiting"),
    )
    .collect();
  let resumed = 0;
  for (const enrollment of waiting) {
    if (!enrollment.heldAt || enrollment.pausedById) continue;
    resumed++;
    await scheduleStep(
      ctx,
      enrollment,
      {
        heldAt: undefined,
        status: enrollment.nextRunAt ? "waiting" : "running",
      },
      enrollment.nextRunAt,
    );
  }
  return resumed;
}

/** After the kill switch is lifted: every active automation's held runs. */
export async function resumeAllHeld(ctx: MutationCtx) {
  const active = await ctx.db
    .query("automations")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  let resumed = 0;
  for (const automation of active) {
    if (automation.deletedAt) continue;
    resumed += await resumeHeld(ctx, automation._id);
  }
  return resumed;
}

/** Holds one run by hand; it stays put until resumed, even across re-activation. */
export async function pauseRun(
  ctx: MutationCtx,
  enrollment: Enrollment,
  byId: Id<"members">,
  byName: string,
) {
  await ctx.db.patch(enrollment._id, {
    pausedById: byId,
    heldAt: enrollment.heldAt ?? Date.now(),
    status: "waiting",
    seq: enrollment.seq + 1,
    stepKey: `${enrollment._id}:${enrollment.seq + 1}`,
  });
  await logStep(
    ctx,
    enrollment,
    "info",
    `Paused by ${byName}`,
    enrollment.currentNodeId,
  );
}

export async function resumeRun(
  ctx: MutationCtx,
  enrollment: Enrollment,
  byName: string,
) {
  await logStep(
    ctx,
    enrollment,
    "info",
    `Resumed by ${byName}`,
    enrollment.currentNodeId,
  );
  const fresh = { ...enrollment, pausedById: undefined };
  await scheduleStep(
    ctx,
    fresh,
    {
      pausedById: undefined,
      heldAt: undefined,
      status: enrollment.nextRunAt ? "waiting" : "running",
    },
    enrollment.nextRunAt,
  );
}
