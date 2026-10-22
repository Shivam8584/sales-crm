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
  configOf,
  isLive,
  istDay,
  renderTemplate,
  SUBJECT_LABEL,
} from "../../../lib/domain/automations";
import { nextOwner } from "../assignment";
import { upsertAutomatedTask } from "../tasks";
import { logSystem, type RecordRefs } from "../timeline";
import { notify } from "../../notifications";
import { type Subject, subjectVars } from "./subject";
import {
  DAY,
  finish,
  type Outcome,
  ROTATION_KEY,
  type StepContext,
} from "./engineState";
import { enroll } from "./engineFlow";

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

export async function taskStep(
  ctx: MutationCtx,
  step: StepContext,
): Promise<Outcome> {
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

export async function notifyStep(
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

export async function updateStep(
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

export async function linkStep(
  ctx: MutationCtx,
  step: StepContext,
): Promise<Outcome> {
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
