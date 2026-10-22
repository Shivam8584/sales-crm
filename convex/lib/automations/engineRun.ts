import { internal } from "../../_generated/api";
import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  configOf,
  describeDuration,
  describeTrigger,
  evaluateConditions,
  formatIst,
  goalMet,
  isLive,
  waitTimeout,
  waitUntil,
} from "../../../lib/domain/automations";
import { killSwitchOn } from "./safety";
import { loadSubject, repliedSince, subjectFacts } from "./subject";
import {
  finish,
  logStep,
  MAX_ATTEMPTS,
  type Outcome,
  RETRY_BASE_MS,
  scheduleStep,
  type StepContext,
  subjectOf,
} from "./engineState";
import { moveOn } from "./engineFlow";
import { sendStep } from "./engineSend";
import { linkStep, notifyStep, taskStep, updateStep } from "./engineActions";

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
