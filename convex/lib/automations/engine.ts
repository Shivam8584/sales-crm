/**
 * The automation engine. Each step runs in its own transaction, scheduled
 * through `internal.automations.run` with a step key; the enrollment stores the
 * only key allowed to run, so duplicate or stale schedules are no-ops and every
 * side effect of a step commits exactly once with the move to the next step.
 */
import { internal } from "../../_generated/api";
import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  DEAL_STAGE_LABEL,
  LEAD_STATUS_LABEL,
  STAGE_LABEL,
} from "../../../lib/domain/labels";
import type {
  DealStage,
  LeadStatus,
  LifecycleStage,
} from "../../../lib/domain/enums";
import {
  NODE_CHANNEL,
  SUBJECT_LABEL,
  SUBJECT_REF,
  configOf,
  describeDuration,
  describeTrigger,
  evaluateConditions,
  formatIst,
  frequencyHoldUntil,
  FREQUENCY_WINDOW_DAYS,
  goalMet,
  isLive,
  istDay,
  matchesTrigger,
  missingMessage,
  nextDayWindow,
  nextNodeId,
  nodeTexts,
  renderTemplate,
  sendTime,
  subjectKey,
  waitTimeout,
  waitUntil,
  type ExitKind,
  type GraphNode,
  type PortId,
  type SubjectKind,
  type Trigger,
  type TriggerEvent,
} from "../../../lib/domain/automations";
import { killSwitchOn, readSafety } from "./safety";
import { nextOwner } from "../assignment";
import { upsertAutomatedTask } from "../tasks";
import { logSystem, type RecordRefs } from "../timeline";
import { notify } from "../../notifications";
import { PROVIDER_LABEL, emailProvider, whatsappProvider } from "./delivery";
import {
  contactDecision,
  loadSubject,
  recipientAddress,
  recipientFor,
  repliedSince,
  subjectFacts,
  subjectVars,
  type Subject,
  type SubjectRef,
} from "./subject";

type Automation = Doc<"automations">;
type Enrollment = Doc<"automationEnrollments">;
type Published = NonNullable<Automation["published"]>;
type Level = Doc<"automationSteps">["level"];
type EnrollmentStatus = Enrollment["status"];

const DAY = 24 * 60 * 60_000;
export const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 30_000;
const HISTORY_LIMIT = 100;
const ROTATION_KEY = "automations.roundRobin";

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

async function bumpStats(
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

const withHistory = (
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
async function scheduleStep(
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

function subjectKeys(refs: RecordRefs) {
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

async function moveOn(
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

// ── Steps ───────────────────────────────────────────────────────────────────

type Outcome =
  | {
      type: "next";
      port: PortId;
      level: Level;
      message: string;
      skipped?: boolean;
    }
  | { type: "defer"; at: number; message: string }
  | { type: "wait"; at: number; waitingFor?: Trigger; message: string }
  | { type: "exit"; reason: string; kind: ExitKind };

type StepContext = {
  automation: Automation;
  published: Published;
  enrollment: Enrollment;
  node: GraphNode;
  subject: Subject;
  now: number;
  stepKey: string;
};

/** Runs the enrollment's current step if `stepKey` is still the live one. */
export async function runStep(
  ctx: MutationCtx,
  enrollmentId: Id<"automationEnrollments">,
  stepKey: string,
) {
  const enrollment = await ctx.db.get(enrollmentId);
  if (
    !enrollment ||
    enrollment.stepKey !== stepKey ||
    !isLive(enrollment.status)
  ) {
    return "stale";
  }
  if (enrollment.pausedById) return "paused";
  const automation = await ctx.db.get(enrollment.automationId);
  if (!automation || automation.deletedAt) {
    await finish(
      ctx,
      enrollment,
      "exited",
      "The automation was deleted",
      undefined,
      "deleted",
    );
    return "exited";
  }
  const now = Date.now();
  const killed = await killSwitchOn(ctx);
  if (killed || automation.status !== "active" || !automation.published) {
    if (!enrollment.heldAt) {
      await ctx.db.patch(enrollment._id, { status: "waiting", heldAt: now });
      await logStep(
        ctx,
        enrollment,
        "info",
        killed
          ? "Held: automations are stopped for the whole workspace"
          : "Held: the automation is paused",
        enrollment.currentNodeId,
      );
    }
    return "held";
  }
  if (enrollment.nextRunAt && enrollment.nextRunAt > now + 1000) {
    await ctx.scheduler.runAt(enrollment.nextRunAt, internal.automations.run, {
      enrollmentId,
      stepKey,
    });
    return "early";
  }
  const published = automation.published;
  const node = published.graph.nodes.find(
    (item) => item.id === enrollment.currentNodeId,
  );
  if (!node) {
    await finish(
      ctx,
      enrollment,
      "exited",
      `Its step was removed in version ${published.version}`,
      undefined,
      "step_removed",
    );
    return "exited";
  }
  const subject = await loadSubject(ctx, subjectOf(enrollment));
  if (!subject || subject.gone) {
    await finish(
      ctx,
      enrollment,
      "exited",
      subject?.gone ?? "The record was deleted",
      node.id,
      "record_gone",
    );
    return "exited";
  }

  const settings = published.settings;
  if (settings.goal.length) {
    const { facts } = await subjectFacts(ctx, subject);
    if (goalMet(settings.goal, facts)) {
      await finish(
        ctx,
        enrollment,
        "exited",
        "Reached the goal",
        node.id,
        "goal",
      );
      return "exited";
    }
  }
  const replied = settings.stopOnReply
    ? await repliedSince(ctx, subject, enrollment.enrolledAt)
    : null;
  if (replied) {
    await finish(
      ctx,
      enrollment,
      "exited",
      replied === "inbound"
        ? "They replied"
        : "A teammate logged a conversation with them",
      node.id,
      "replied",
    );
    return "exited";
  }

  const step: StepContext = {
    automation,
    published,
    enrollment,
    node,
    subject,
    now,
    stepKey,
  };
  const outcome = await execute(ctx, step);
  switch (outcome.type) {
    case "next":
      await logStep(
        ctx,
        enrollment,
        outcome.level,
        outcome.message,
        node.id,
        stepKey,
      );
      await moveOn(
        ctx,
        enrollment,
        published.graph,
        node.id,
        outcome.port,
        outcome.skipped ? "skipped" : outcome.port,
      );
      return "next";
    case "defer":
      await logStep(ctx, enrollment, "info", outcome.message, node.id, stepKey);
      await scheduleStep(
        ctx,
        enrollment,
        { status: "waiting", nextRunAt: outcome.at },
        outcome.at,
      );
      return "deferred";
    case "wait":
      await logStep(ctx, enrollment, "info", outcome.message, node.id, stepKey);
      await scheduleStep(
        ctx,
        enrollment,
        {
          status: "waiting",
          nextRunAt: outcome.at,
          waitStartedAt: now,
          waitingFor: outcome.waitingFor,
        },
        outcome.at,
      );
      return "waiting";
    case "exit":
      await finish(
        ctx,
        enrollment,
        "exited",
        outcome.reason,
        node.id,
        outcome.kind,
      );
      return "exited";
  }
}

/** Records a step that threw (its writes were rolled back) and retries it with backoff. */
export async function stepFailed(
  ctx: MutationCtx,
  enrollmentId: Id<"automationEnrollments">,
  stepKey: string,
  error: string,
) {
  const enrollment = await ctx.db.get(enrollmentId);
  if (
    !enrollment ||
    enrollment.stepKey !== stepKey ||
    !isLive(enrollment.status)
  ) {
    return;
  }
  const attempt = enrollment.attempt + 1;
  if (attempt >= MAX_ATTEMPTS) {
    await finish(
      ctx,
      enrollment,
      "failed",
      `The step failed ${attempt} times: ${error}`,
    );
    return;
  }
  const at = Math.max(
    Date.now() + RETRY_BASE_MS * 4 ** (attempt - 1),
    enrollment.nextRunAt ?? 0,
  );
  await ctx.db.patch(enrollment._id, { attempt, nextRunAt: at });
  await logStep(
    ctx,
    enrollment,
    "warning",
    `The step failed (attempt ${attempt} of ${MAX_ATTEMPTS}): ${error}. Retrying at ${formatIst(at)}`,
    enrollment.currentNodeId,
    stepKey,
  );
  await ctx.scheduler.runAt(at, internal.automations.run, {
    enrollmentId,
    stepKey,
  });
}

async function execute(ctx: MutationCtx, step: StepContext): Promise<Outcome> {
  const { node } = step;
  switch (node.kind) {
    case "trigger":
      return { type: "next", port: "out", level: "info", message: "Started" };
    case "wait":
      return waitStep(step);
    case "condition": {
      const { facts } = await subjectFacts(ctx, step.subject);
      const result = evaluateConditions(configOf(node, "condition"), facts);
      return {
        type: "next",
        port: result ? "yes" : "no",
        level: "success",
        message: result
          ? "Conditions met → YES path"
          : "Conditions not met → NO path",
      };
    }
    case "send_email":
    case "send_whatsapp":
      return await sendStep(ctx, step);
    case "create_task":
      return await taskStep(ctx, step);
    case "notify":
      return await notifyStep(ctx, step);
    case "update_field":
      return await updateStep(ctx, step);
    case "automation":
      return await linkStep(ctx, step);
    case "exit":
      return {
        type: "exit",
        reason: configOf(node, "exit").reason?.trim() || "Reached an exit step",
        kind: "exit_step",
      };
  }
}

function waitStep({ node, enrollment, now }: StepContext): Outcome {
  const config = configOf(node, "wait");
  if (enrollment.waitStartedAt) {
    if (config.mode === "event") {
      return {
        type: "next",
        port: "timeout",
        level: "info",
        message: `The event didn't happen within ${describeDuration(config.timeoutAmount, config.timeoutUnit)} → TIMEOUT path`,
      };
    }
    return { type: "next", port: "out", level: "info", message: "Wait over" };
  }
  if (config.mode === "event") {
    const at = waitTimeout(config, now);
    return {
      type: "wait",
      at,
      waitingFor: config.event,
      message: `Waiting for ${config.event ? describeTrigger(config.event).toLowerCase() : "the event"}, until ${formatIst(at)} at the latest`,
    };
  }
  const at = waitUntil(config, now) ?? now;
  return { type: "wait", at, message: `Waiting until ${formatIst(at)}` };
}

const CHANNEL_NOUN = { email: "email", whatsapp: "WhatsApp message" } as const;

async function sendStep(ctx: MutationCtx, step: StepContext): Promise<Outcome> {
  const { node, subject, published, automation, enrollment, now, stepKey } =
    step;
  const channel = NODE_CHANNEL[node.kind] as "email" | "whatsapp";
  const config =
    node.kind === "send_email"
      ? configOf(node, "send_email")
      : configOf(node, "send_whatsapp");
  const recipient = await recipientFor(ctx, subject, channel);
  const decision = await contactDecision(
    ctx,
    recipient,
    channel,
    config.purpose,
  );
  if (!decision.allowed || !recipient) {
    return {
      type: "next",
      port: "out",
      level: "warning",
      skipped: true,
      message: `Skipped the ${CHANNEL_NOUN[channel]}: ${decision.message}`,
    };
  }
  const to = recipientAddress(recipient, channel)!;
  const vars = await subjectVars(ctx, subject, recipient, enrollment.context);
  const missing = [
    ...new Set(
      nodeTexts(node).flatMap((text) => renderTemplate(text, vars).missing),
    ),
  ];
  if (missing.length) {
    return {
      type: "next",
      port: "out",
      level: "warning",
      skipped: true,
      message: `Skipped the ${CHANNEL_NOUN[channel]}: ${missingMessage(missing)}`,
    };
  }

  const at = sendTime(published.settings, now);
  if (at > now) {
    return {
      type: "defer",
      at,
      message: `Quiet hours: holding the ${CHANNEL_NOUN[channel]} until ${formatIst(at)}`,
    };
  }
  const capKey = `automation-send:${automation._id}:${istDay(now)}`;
  const counter = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", capKey))
    .unique();
  if ((counter?.count ?? 0) >= published.settings.dailyCap) {
    const next = nextDayWindow(now);
    return {
      type: "defer",
      at: next,
      message: `Daily cap of ${published.settings.dailyCap} messages reached; holding until ${formatIst(next)}`,
    };
  }
  const { frequencyCap } = await readSafety(ctx);
  const since = now - FREQUENCY_WINDOW_DAYS * DAY;
  const recent = recipient.personId
    ? await ctx.db
        .query("automationMessages")
        .withIndex("by_person", (q) =>
          q.eq("personId", recipient.personId).gt("_creationTime", since),
        )
        .collect()
    : await ctx.db
        .query("automationMessages")
        .withIndex("by_lead", (q) =>
          q.eq("leadId", recipient.leadId).gt("_creationTime", since),
        )
        .collect();
  const holdUntil = frequencyHoldUntil(
    recent
      .filter((item) => item.status !== "failed" && item.stepKey !== stepKey)
      .map((item) => item._creationTime),
    now,
    frequencyCap,
  );
  if (holdUntil !== null) {
    const next = sendTime(published.settings, holdUntil);
    return {
      type: "defer",
      at: next,
      message: `Frequency cap: ${recipient.name} already got ${frequencyCap} automated ${frequencyCap === 1 ? "message" : "messages"} in the last ${FREQUENCY_WINDOW_DAYS} days; holding until ${formatIst(next)}`,
    };
  }
  const existing = await ctx.db
    .query("automationMessages")
    .withIndex("by_step_key", (q) => q.eq("stepKey", stepKey))
    .first();
  if (existing) {
    return {
      type: "next",
      port: "out",
      level: "info",
      message: "Already queued for this step",
    };
  }

  const status = channel === "email" ? emailProvider() : whatsappProvider();
  const provider = status.provider;
  const outbox = provider === "outbox";
  const statusLine = outbox
    ? `Queued by the automation “${automation.name}”. Not sent: no ${channel === "email" ? "email" : "WhatsApp"} provider is set up, so it stays in the outbox.`
    : `Queued by the automation “${automation.name}” for sending via ${PROVIDER_LABEL[provider]}.`;

  let subjectLine: string | undefined;
  let body: string | undefined;
  let params: string[] | undefined;
  let template: string | undefined;
  let language: string | undefined;
  if (node.kind === "send_email") {
    const email = configOf(node, "send_email");
    subjectLine = renderTemplate(email.subject, vars).text.trim();
    body = renderTemplate(email.body, vars).text.trim();
  } else {
    const whatsapp = configOf(node, "send_whatsapp");
    template = whatsapp.template;
    language = whatsapp.language;
    params = whatsapp.params.map((param) =>
      renderTemplate(param, vars).text.trim(),
    );
  }
  const content =
    channel === "email"
      ? `Subject: ${subjectLine}\n\n${body}`
      : `Template ${template} (${language})${params?.length ? `\n${params.map((param, index) => `{{${index + 1}}} ${param}`).join("\n")}` : ""}`;

  const refs: RecordRefs = {
    ...subject.refs,
    personId: recipient.personId ?? subject.refs.personId,
    leadId: recipient.leadId ?? subject.refs.leadId,
  };
  const timelineId = await ctx.db.insert("timeline", {
    ...refs,
    kind: channel,
    occurredAt: now,
    automated: true,
    direction: "outbound",
    subject: subjectLine ?? template,
    body: `${statusLine}\n\n${content}`,
  });
  const messageId = await ctx.db.insert("automationMessages", {
    automationId: automation._id,
    enrollmentId: enrollment._id,
    stepKey,
    channel,
    personId: recipient.personId,
    leadId: recipient.leadId,
    to,
    subject: subjectLine,
    body,
    template,
    language,
    params,
    status: "queued",
    provider,
    attempts: 0,
    timelineId,
  });
  if (counter) await ctx.db.patch(counter._id, { count: counter.count + 1 });
  else
    await ctx.db.insert("rateLimits", {
      key: capKey,
      windowStart: now,
      count: 1,
    });
  if (!outbox) {
    await ctx.scheduler.runAfter(0, internal.automations.deliver, {
      messageId,
    });
  }
  const what =
    channel === "email"
      ? `the email “${subjectLine}”`
      : `the WhatsApp template ${template}`;
  return {
    type: "next",
    port: "out",
    level: "success",
    message: outbox
      ? `Queued ${what} to ${to} in the outbox (not sent: no provider)${status.problem ? `. ${status.problem}` : ""}`
      : `Queued ${what} to ${to} for ${PROVIDER_LABEL[provider]}`,
  };
}

async function activeMember(ctx: MutationCtx, id: string | null | undefined) {
  if (!id) return null;
  const memberId = ctx.db.normalizeId("members", id);
  const member = memberId ? await ctx.db.get(memberId) : null;
  return member?.status === "active" ? member : null;
}

/** The owner, or whoever built the automation when the owner can't take it. */
async function ownerOrFallback(ctx: MutationCtx, step: StepContext) {
  return (
    (await activeMember(ctx, step.subject.ownerId)) ??
    (await activeMember(ctx, step.automation.createdById))
  );
}

function taskRefs(subject: Subject): RecordRefs {
  switch (subject.kind) {
    case "lead":
      return { leadId: subject.lead!._id };
    case "person":
      return { personId: subject.person!._id, accountId: subject.account?._id };
    case "account":
      return { accountId: subject.account!._id };
    case "deal":
      return { dealId: subject.deal!._id, accountId: subject.deal!.accountId };
  }
}

async function taskStep(ctx: MutationCtx, step: StepContext): Promise<Outcome> {
  const { node, subject, enrollment, now } = step;
  const config = configOf(node, "create_task");
  let assignee: Doc<"members"> | null = null;
  if (config.assignee === "member")
    assignee = await activeMember(ctx, config.memberId);
  if (config.assignee === "round_robin") {
    assignee = await activeMember(ctx, await nextOwner(ctx, ROTATION_KEY));
  }
  assignee ??= await ownerOrFallback(ctx, step);
  if (!assignee) {
    return {
      type: "next",
      port: "out",
      level: "warning",
      skipped: true,
      message: "Skipped the task: nobody active to assign it to",
    };
  }
  const vars = await subjectVars(ctx, subject, undefined, enrollment.context);
  const title = renderTemplate(config.title, vars).text.trim();
  const notes = config.notes
    ? renderTemplate(config.notes, vars).text.trim()
    : undefined;
  const result = await upsertAutomatedTask(ctx, {
    automationKey: `automation:${enrollment._id}:${node.id}`,
    title,
    notes: [notes, `Created by the automation “${step.automation.name}”.`]
      .filter(Boolean)
      .join("\n\n"),
    priority: config.priority,
    assigneeId: assignee._id,
    dueDate: istDay(now + config.dueInDays * DAY),
    ...taskRefs(subject),
  });
  return {
    type: "next",
    port: "out",
    level: "success",
    message:
      result.outcome === "unchanged"
        ? `The task “${title}” already exists`
        : `Created the task “${title}” for ${assignee.name}`,
  };
}

async function notifyStep(
  ctx: MutationCtx,
  step: StepContext,
): Promise<Outcome> {
  const { node, subject, automation, enrollment } = step;
  const config = configOf(node, "notify");
  const recipient =
    config.to === "member"
      ? ((await activeMember(ctx, config.memberId)) ??
        (await ownerOrFallback(ctx, step)))
      : await ownerOrFallback(ctx, step);
  if (!recipient) {
    return {
      type: "next",
      port: "out",
      level: "warning",
      skipped: true,
      message: "Skipped: nobody active to notify",
    };
  }
  const message = renderTemplate(
    config.message,
    await subjectVars(ctx, subject, undefined, enrollment.context),
  ).text.trim();
  await notify(ctx, recipient._id, {
    kind: "automation",
    title: message,
    body: `${automation.name} · ${subject.name}`,
    href: subject.href,
  });
  return {
    type: "next",
    port: "out",
    level: "success",
    message: `Notified ${recipient.name}`,
  };
}

async function updateStep(
  ctx: MutationCtx,
  step: StepContext,
): Promise<Outcome> {
  const { node, subject, automation, now } = step;
  const config = configOf(node, "update_field");
  const by = ` (automation “${automation.name}”)`;
  const done = (message: string): Outcome => ({
    type: "next",
    port: "out",
    level: "success",
    message,
  });
  const unchanged = (message: string): Outcome => ({
    type: "next",
    port: "out",
    level: "info",
    message,
  });

  if (config.field === "owner") {
    const member =
      config.value === "round_robin"
        ? await activeMember(ctx, await nextOwner(ctx, ROTATION_KEY))
        : await activeMember(ctx, config.value);
    if (!member) {
      return {
        type: "next",
        port: "out",
        level: "warning",
        skipped: true,
        message: "Skipped: that teammate is no longer active",
      };
    }
    if (subject.ownerId === member._id)
      return unchanged(`${member.name} already owns it`);
    const target =
      subject.lead ?? subject.deal ?? subject.account ?? subject.person;
    if (subject.kind === "lead") {
      await ctx.db.patch(subject.lead!._id, {
        ownerId: member._id,
        assignedAt: now,
      });
    } else if (target) {
      await ctx.db.patch(target._id as Id<"deals" | "accounts" | "people">, {
        ownerId: member._id,
        updatedAt: now,
      });
    }
    await logSystem(
      ctx,
      subject.refs,
      `assigned the ${SUBJECT_LABEL[subject.kind][0]} to ${member.name}${by}`,
    );
    return done(`Assigned to ${member.name}`);
  }

  if (config.field === "tag_add" || config.field === "tag_remove") {
    const record =
      subject.kind === "account" ? subject.account : subject.person;
    if (!record) return unchanged("Nothing to tag");
    const tag = config.value.trim();
    const has = record.tags.some(
      (item) => item.toLowerCase() === tag.toLowerCase(),
    );
    const adding = config.field === "tag_add";
    if (has === adding)
      return unchanged(adding ? `Already tagged ${tag}` : `Not tagged ${tag}`);
    const tags = adding
      ? [...record.tags, tag]
      : record.tags.filter((item) => item.toLowerCase() !== tag.toLowerCase());
    await ctx.db.patch(record._id, { tags, updatedAt: now });
    await logSystem(
      ctx,
      subject.refs,
      `${adding ? "added the tag" : "removed the tag"} ${tag}${by}`,
    );
    return done(`${adding ? "Added" : "Removed"} the tag ${tag}`);
  }

  if (config.field === "status" && subject.lead) {
    const lead = subject.lead;
    const status = config.value as LeadStatus;
    if (lead.status === "converted" || lead.status === "disqualified") {
      return unchanged(
        `The lead is ${LEAD_STATUS_LABEL[lead.status].toLowerCase()}, so its status stays`,
      );
    }
    if (lead.status === status)
      return unchanged(`Already ${LEAD_STATUS_LABEL[status]}`);
    await ctx.db.patch(lead._id, { status });
    await logSystem(
      ctx,
      subject.refs,
      `set the status to ${LEAD_STATUS_LABEL[status]}${by}`,
    );
    return done(`Status → ${LEAD_STATUS_LABEL[status]}`);
  }

  if (config.field === "stage" && subject.kind === "deal" && subject.deal) {
    const deal = subject.deal;
    const stage = config.value as DealStage;
    if (deal.stage === "won" || deal.stage === "lost")
      return unchanged("The deal is closed, so its stage stays");
    if (deal.stage === stage)
      return unchanged(`Already in ${DEAL_STAGE_LABEL[stage]}`);
    const last = await ctx.db
      .query("deals")
      .withIndex("by_stage_position", (q) => q.eq("stage", stage))
      .order("desc")
      .first();
    await ctx.db.patch(deal._id, {
      stage,
      position: last ? last.position + 1 : 0,
      updatedAt: now,
    });
    await logSystem(
      ctx,
      subject.refs,
      `moved the deal ${deal.title} to ${DEAL_STAGE_LABEL[stage]}${by}`,
    );
    return done(`Stage → ${DEAL_STAGE_LABEL[stage]}`);
  }

  if (config.field === "stage" && subject.account) {
    const account = subject.account;
    const stage = config.value as LifecycleStage;
    if (account.stage === stage)
      return unchanged(`Already ${STAGE_LABEL[stage]}`);
    await ctx.db.patch(account._id, { stage, updatedAt: now });
    await logSystem(
      ctx,
      { accountId: account._id },
      `moved the account to ${STAGE_LABEL[stage]}${by}`,
    );
    return done(`Stage → ${STAGE_LABEL[stage]}`);
  }
  return {
    type: "next",
    port: "out",
    level: "warning",
    skipped: true,
    message: "Skipped: the record doesn't have that field",
  };
}

async function linkStep(ctx: MutationCtx, step: StepContext): Promise<Outcome> {
  const { node, subject, automation } = step;
  const config = configOf(node, "automation");
  const otherId = ctx.db.normalizeId("automations", config.automationId);
  const other = otherId ? await ctx.db.get(otherId) : null;
  if (!other || other.deletedAt) {
    return {
      type: "next",
      port: "out",
      level: "warning",
      skipped: true,
      message: "Skipped: that automation no longer exists",
    };
  }
  if (config.action === "remove") {
    const live = (
      await ctx.db
        .query("automationEnrollments")
        .withIndex("by_automation_subject", (q) =>
          q.eq("automationId", other._id).eq("subjectKey", subject.key),
        )
        .collect()
    ).filter((item) => isLive(item.status));
    for (const item of live) {
      await finish(
        ctx,
        item,
        "exited",
        `Removed by the automation “${automation.name}”`,
        undefined,
        "automation",
      );
    }
    return {
      type: "next",
      port: "out",
      level: live.length ? "success" : "info",
      message: live.length
        ? `Removed from “${other.name}”`
        : `Wasn't in “${other.name}”`,
    };
  }
  const result = await enroll(
    ctx,
    other,
    { kind: subject.kind, id: subject.id },
    `Added by the automation “${automation.name}”`,
  );
  return result.outcome === "enrolled"
    ? {
        type: "next",
        port: "out",
        level: "success",
        message: `Added to “${other.name}”`,
      }
    : {
        type: "next",
        port: "out",
        level: "warning",
        skipped: true,
        message: `Not added: ${result.message}`,
      };
}

// ── Replies ─────────────────────────────────────────────────────────────────

/** A reply this soon after a run ended still counts towards its reply rate. */
const REPLY_GRACE_MS = 14 * DAY;

const CHANNEL_WORD = { email: "email", whatsapp: "WhatsApp" } as const;

export type ReplyInput = {
  refs: RecordRefs;
  channel: "email" | "whatsapp";
  at: number;
  dealIds?: Id<"deals">[];
};

/**
 * A contact replied: their runs are marked replied, live runs that stop on
 * reply exit (unless a step is waiting for exactly this reply), and reply
 * triggers and waits fire.
 */
export async function recordReply(ctx: MutationCtx, input: ReplyInput) {
  const event: TriggerEvent = {
    kind: "reply_received",
    refs: input.refs,
    value: input.channel,
    at: input.at,
  };
  const keys = [
    ...subjectKeys(input.refs),
    ...(input.dealIds ?? []).map((id) => subjectKey("deal", id)),
  ];
  let exited = 0;
  let marked = 0;
  const statuses = [
    "running",
    "waiting",
    "completed",
    "exited",
    "failed",
  ] as const;
  for (const key of new Set(keys)) {
    for (const status of statuses) {
      const rows = await ctx.db
        .query("automationEnrollments")
        .withIndex("by_subject", (q) =>
          q.eq("subjectKey", key).eq("status", status),
        )
        .collect();
      for (const enrollment of rows) {
        const live = isLive(enrollment.status);
        if (!live && (enrollment.finishedAt ?? 0) < input.at - REPLY_GRACE_MS) {
          continue;
        }
        if (!enrollment.repliedAt) {
          await ctx.db.patch(enrollment._id, { repliedAt: input.at });
          marked++;
        }
        if (!live) continue;
        const awaited =
          enrollment.waitingFor && matchesTrigger(enrollment.waitingFor, event);
        const automation = await ctx.db.get(enrollment.automationId);
        const stops = automation?.published?.settings.stopOnReply ?? false;
        if (stops && !awaited) {
          await finish(
            ctx,
            { ...enrollment, repliedAt: enrollment.repliedAt ?? input.at },
            "exited",
            `They replied by ${CHANNEL_WORD[input.channel]}`,
            undefined,
            "replied",
          );
          exited++;
        } else if (!awaited) {
          await logStep(
            ctx,
            enrollment,
            "info",
            `They replied by ${CHANNEL_WORD[input.channel]}; the run carries on because “stop when they engage” is off`,
            enrollment.currentNodeId,
          );
        }
      }
    }
  }
  await emitAutomationTrigger(ctx, {
    kind: "reply_received",
    refs: input.refs,
    value: input.channel,
  });
  return { exited, marked };
}
