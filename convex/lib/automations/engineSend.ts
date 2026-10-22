import { internal } from "../../_generated/api";
import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  hasVariantB,
  pickVariant,
  variantContent,
} from "../../../lib/domain/ab-test";
import {
  configOf,
  type EmailConfig,
  formatIst,
  FREQUENCY_WINDOW_DAYS,
  frequencyHoldUntil,
  type GraphNode,
  missingMessage,
  nextDayWindow,
  NODE_CHANNEL,
  nodeTexts,
  renderTemplate,
  sendTime,
  templateVariables,
} from "../../../lib/domain/automations";
import type { ContactReason } from "../../../lib/domain/consent";
import { dailySendCap, rateLimiter } from "../rateLimiter";
import { readSafety } from "./safety";
import type { RecordRefs } from "../timeline";
import { issueSurveyToken } from "../../surveys";
import { siteUrl } from "../http";
import { SURVEY_TTL_DAYS, surveyPath } from "../../../lib/domain/surveys";
import {
  emailProvider,
  PROVIDER_LABEL,
  renderEmail,
  whatsappProvider,
} from "./delivery";
import {
  contactDecision,
  recipientAddress,
  recipientFor,
  subjectVars,
} from "./subject";
import { DAY, type Outcome, type StepContext } from "./engineState";

const CHANNEL_NOUN = { email: "email", whatsapp: "WhatsApp message" } as const;

const usesSurveyLink = (texts: string[]) =>
  texts.some((text) => templateVariables(text).includes("survey.link"));

async function emailVariant(
  ctx: MutationCtx,
  enrollmentId: Id<"automationEnrollments">,
  node: GraphNode,
  email: EmailConfig,
) {
  if (!hasVariantB(email.ab)) return undefined;
  const earlier = await ctx.db
    .query("automationMessages")
    .withIndex("by_enrollment", (q) => q.eq("enrollmentId", enrollmentId))
    .collect();
  const previous = earlier.find(
    (message) => message.nodeId === node.id && message.variant,
  )?.variant;
  return pickVariant(email.ab, `${enrollmentId}:${node.id}`, previous);
}

const STOPPED_FOR_GOOD = new Set<ContactReason>([
  "withdrawn",
  "erased",
  "erasure_requested",
]);

export async function sendStep(
  ctx: MutationCtx,
  step: StepContext,
): Promise<Outcome> {
  const { node, subject, published, automation, enrollment, now, stepKey } =
    step;
  const channel = NODE_CHANNEL[node.kind] as "email" | "whatsapp";
  const email =
    node.kind === "send_email" ? configOf(node, "send_email") : null;
  const config = email ?? configOf(node, "send_whatsapp");
  const variant = email
    ? await emailVariant(ctx, enrollment._id, node, email)
    : undefined;
  const texts = email
    ? Object.values(variantContent(email, variant ?? "a"))
    : nodeTexts(node);
  const recipient = await recipientFor(ctx, subject, channel);
  const decision = await contactDecision(
    ctx,
    recipient,
    channel,
    config.purpose,
  );
  if (decision.reason && STOPPED_FOR_GOOD.has(decision.reason)) {
    return {
      type: "exit",
      kind: "no_consent",
      reason: `${decision.message}, so the sequence stopped`,
    };
  }
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
    ...new Set(texts.flatMap((text) => renderTemplate(text, vars).missing)),
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
  const cap = {
    key: automation._id,
    config: dailySendCap(published.settings.dailyCap),
  };
  if (!(await rateLimiter.check(ctx, "automationSend", cap)).ok) {
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

  let sendVars = vars;
  let surveyLink: string | undefined;
  if (usesSurveyLink(texts) && subject.account) {
    const token = await issueSurveyToken(ctx, {
      accountId: subject.account._id,
      personId: recipient.personId,
      createdById: automation.createdById,
    });
    if (!token) {
      return {
        type: "next",
        port: "out",
        level: "warning",
        skipped: true,
        message: `Skipped the ${CHANNEL_NOUN[channel]}: ${recipient.name} was already sent a survey in the last ${SURVEY_TTL_DAYS} days`,
      };
    }
    surveyLink = siteUrl(surveyPath(token));
    sendVars = { ...vars, "survey.link": surveyLink };
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
  if (email) {
    ({ subject: subjectLine, body } = renderEmail(
      variantContent(email, variant ?? "a"),
      sendVars,
      published.settings.language,
    ));
  } else {
    const whatsapp = configOf(node, "send_whatsapp");
    template = whatsapp.template;
    language = whatsapp.language;
    params = whatsapp.params.map((param) =>
      renderTemplate(param, sendVars).text.trim(),
    );
  }
  const content =
    channel === "email"
      ? `Subject: ${subjectLine}\n\n${body}`
      : `Template ${template} (${language})${params?.length ? `\n${params.map((param, index) => `{{${index + 1}}} ${param}`).join("\n")}` : ""}`;
  const logged = surveyLink
    ? content.replaceAll(surveyLink, siteUrl("/survey/…"))
    : content;

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
    body: `${statusLine}\n\n${logged}`,
  });
  const messageId = await ctx.db.insert("automationMessages", {
    automationId: automation._id,
    enrollmentId: enrollment._id,
    stepKey,
    nodeId: variant ? node.id : undefined,
    variant,
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
  await rateLimiter.limit(ctx, "automationSend", cap);
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
