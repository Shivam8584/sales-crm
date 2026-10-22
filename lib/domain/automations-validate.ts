import { hasVariantB, variantContent } from "./ab-test";
import {
  DEAL_STAGES,
  LEAD_KINDS,
  LEAD_STATUSES,
  LIFECYCLE_STAGES,
  PRIORITIES,
} from "./enums";
import {
  CAMPAIGN_STATUSES,
  PAUSE_REASONS,
  PLATFORM_TRIGGERS,
} from "./platform";
import { DAY } from "./automations-internal";
import {
  ASSIGNEES,
  type AutomationLinkConfig,
  type AutomationSettings,
  type Condition,
  type ConditionConfig,
  type EmailConfig,
  type Graph,
  type GraphEdge,
  type GraphNode,
  hasInput,
  LIMITS,
  NODE_KINDS,
  type NotifyConfig,
  portsOf,
  REPLY_CHANNELS,
  SUBJECT_LABEL,
  type SubjectKind,
  type TaskConfig,
  type Trigger,
  TRIGGER_KINDS,
  TRIGGER_LABEL,
  TRIGGER_SUBJECTS,
  type UpdateConfig,
  WAIT_UNITS,
  type WaitConfig,
  type WaitUnit,
  type WhatsAppConfig,
} from "./automations-model";
import { parseTime, UNIT_MS } from "./automations-time";
import {
  conditionFields,
  OP_LABEL,
  OPS_FOR,
  updateFieldsFor,
  updateValues,
} from "./automations-fields";
import { templateIssues } from "./automations-variables";

// ── Validation ──────────────────────────────────────────────────────────────

export type Issue = { nodeId?: string; field?: string; message: string };

export type AutomationDraft = {
  subjectKind: SubjectKind;
  trigger: Trigger;
  graph: Graph;
  settings: AutomationSettings;
};

export type ValidationContext = {
  memberIds?: string[];
  automationIds?: string[];
  ruleIds?: string[];
  selfId?: string;
};

const WHATSAPP_TEMPLATE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE = /^[a-z]{2,3}(_[A-Z]{2})?$/;

function checkTrigger(
  trigger: Trigger,
  subject: SubjectKind,
  context: ValidationContext,
  issues: Issue[],
  nodeId?: string,
) {
  const push = (message: string, field?: string) =>
    issues.push({ nodeId, field, message });
  if (!TRIGGER_KINDS.includes(trigger.kind)) return push("Pick a trigger");
  if (!TRIGGER_SUBJECTS[trigger.kind].includes(subject)) {
    push(
      `${TRIGGER_LABEL[trigger.kind]} can't enrol ${SUBJECT_LABEL[subject][1]}`,
      "subjectKind",
    );
  }
  const unknown = (list: string[] | undefined, known: readonly string[]) =>
    (list ?? []).filter((value) => !known.includes(value));
  if (unknown(trigger.leadKinds, LEAD_KINDS).length)
    push("Unknown lead kind", "leadKinds");
  if (unknown(trigger.leadStatuses, LEAD_STATUSES).length) {
    push("Unknown lead status", "leadStatuses");
  }
  if (unknown(trigger.dealStages, DEAL_STAGES).length)
    push("Unknown deal stage", "dealStages");
  if (unknown(trigger.accountStages, LIFECYCLE_STAGES).length) {
    push("Unknown account stage", "accountStages");
  }
  const badEvents = unknown(trigger.eventTypes, PLATFORM_TRIGGERS);
  if (badEvents.length)
    push(`Unknown platform event ${badEvents[0]}`, "eventTypes");
  if (unknown(trigger.campaignStatuses, CAMPAIGN_STATUSES).length) {
    push("Unknown campaign status", "campaignStatuses");
  }
  if (unknown(trigger.pauseReasons, PAUSE_REASONS).length) {
    push("Unknown pause reason", "pauseReasons");
  }
  if (trigger.kind === "platform_event" && !trigger.eventTypes?.length) {
    push("Pick at least one platform event", "eventTypes");
  }
  if (unknown(trigger.channels, REPLY_CHANNELS).length) {
    push("Unknown channel", "channels");
  }
  if (context.ruleIds && unknown(trigger.ruleIds, context.ruleIds).length) {
    push("Unknown stall rule", "ruleIds");
  }
}

function checkConditions(
  conditions: Condition[],
  subject: SubjectKind,
  push: (message: string, field?: string) => void,
) {
  const fields = conditionFields();
  if (conditions.length > LIMITS.conditions) {
    push(`Use up to ${LIMITS.conditions} conditions`, "conditions");
  }
  conditions.forEach((condition, index) => {
    const field = fields.find((item) => item.key === condition.field);
    const at = `conditions.${index}`;
    if (!field) return push("Pick a field", at);
    if (!field.subjects.includes(subject)) {
      return push(
        `${field.label} isn't available for ${SUBJECT_LABEL[subject][1]}`,
        at,
      );
    }
    if (!OPS_FOR[field.type].includes(condition.op)) {
      return push(
        `“${OP_LABEL[condition.op] ?? condition.op}” doesn't apply to ${field.label}`,
        at,
      );
    }
    const needsValue = !["is_true", "is_false"].includes(condition.op);
    const values = (condition.value ?? []).filter(
      (value) => value.trim() !== "",
    );
    if (needsValue && values.length === 0)
      return push(`Pick a value for ${field.label}`, at);
    if (
      field.type === "number" &&
      needsValue &&
      !Number.isFinite(Number(values[0]))
    ) {
      push(`${field.label} needs a number`, at);
    }
    if (field.options && needsValue) {
      const known = field.options.map((option) => option.value);
      if (values.some((value) => !known.includes(value))) {
        push(`Unknown value for ${field.label}`, at);
      }
    }
  });
}

function checkVariables(
  text: string,
  subject: SubjectKind,
  push: (message: string) => void,
) {
  const [first] = templateIssues(text, subject);
  if (first) push(first);
}

function checkWait(
  config: WaitConfig,
  subject: SubjectKind,
  context: ValidationContext,
  issues: Issue[],
  nodeId: string,
) {
  const push = (message: string, field?: string) =>
    issues.push({ nodeId, field, message });
  const duration = (
    amount: number | undefined,
    unit: WaitUnit | undefined,
    field: string,
  ) => {
    if (!unit || !WAIT_UNITS.includes(unit)) return push("Pick a unit", field);
    if (!Number.isInteger(amount) || (amount ?? 0) < 1) {
      return push("Wait at least 1 " + unit.replace(/s$/, ""), field);
    }
    if ((amount ?? 0) * UNIT_MS[unit] > LIMITS.waitDays * DAY) {
      push(`Wait at most ${LIMITS.waitDays} days`, field);
    }
  };
  if (config.mode === "duration")
    return duration(config.amount, config.unit, "amount");
  if (config.mode === "until") {
    if (parseTime(config.time) === null) push("Pick a time", "time");
    if (!config.days?.length) push("Pick at least one day", "days");
    if (
      config.days?.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
    ) {
      push("Pick valid days", "days");
    }
    return;
  }
  if (config.mode === "event") {
    if (!config.event || config.event.kind === "manual")
      return push("Pick an event", "event");
    checkTrigger(config.event, subject, context, issues, nodeId);
    return duration(config.timeoutAmount, config.timeoutUnit, "timeoutAmount");
  }
  push("Pick how to wait", "mode");
}

function checkNode(
  node: GraphNode,
  draft: AutomationDraft,
  context: ValidationContext,
  issues: Issue[],
) {
  const push = (message: string, field?: string) =>
    issues.push({ nodeId: node.id, field, message });
  const subject = draft.subjectKind;
  const config = node.config ?? {};
  if (node.title && node.title.length > LIMITS.title)
    push("Shorten the step name", "title");
  switch (node.kind) {
    case "trigger":
      return;
    case "wait":
      return checkWait(config as WaitConfig, subject, context, issues, node.id);
    case "condition": {
      const value = config as ConditionConfig;
      if (!value.conditions?.length)
        return push("Add at least one condition", "conditions");
      return checkConditions(value.conditions, subject, push);
    }
    case "create_task": {
      const value = config as TaskConfig;
      if (!value.title?.trim()) push("Give the task a title", "title");
      else if (value.title.length > LIMITS.title)
        push("Shorten the task title", "title");
      checkVariables(value.title ?? "", subject, (message) =>
        push(message, "title"),
      );
      checkVariables(value.notes ?? "", subject, (message) =>
        push(message, "notes"),
      );
      if (!ASSIGNEES.includes(value.assignee))
        push("Pick who gets the task", "assignee");
      if (value.assignee === "member")
        checkMember(value.memberId, context, push);
      if (
        !Number.isInteger(value.dueInDays) ||
        value.dueInDays < 0 ||
        value.dueInDays > LIMITS.dueInDays
      ) {
        push(`Due in 0 to ${LIMITS.dueInDays} days`, "dueInDays");
      }
      if (!PRIORITIES.includes(value.priority))
        push("Pick a priority", "priority");
      return;
    }
    case "send_email": {
      const value = config as EmailConfig;
      if (!value.subject?.trim()) push("Write a subject line", "subject");
      else if (value.subject.length > LIMITS.subject)
        push("Shorten the subject", "subject");
      if (!value.body?.trim()) push("Write the email", "body");
      else if (value.body.length > LIMITS.body)
        push("Shorten the email", "body");
      checkVariables(
        `${value.subject ?? ""} ${value.body ?? ""}`,
        subject,
        (message) => push(message, "body"),
      );
      checkPurpose(value.purpose, push);
      if (value.ab) {
        const { ab } = value;
        if (!Number.isInteger(ab.splitB) || ab.splitB < 0 || ab.splitB > 100)
          push("Give version B between 0 and 100 percent", "abSplit");
        const b = variantContent(value, "b");
        if (!hasVariantB(ab))
          push("Write a subject or message for version B", "abSubject");
        else if (b.subject === value.subject && b.body === value.body)
          push("Version B is the same as A", "abSubject");
        if ((ab.subject?.length ?? 0) > LIMITS.subject)
          push("Shorten the subject for version B", "abSubject");
        if ((ab.body?.length ?? 0) > LIMITS.body)
          push("Shorten the message for version B", "abBody");
        checkVariables(
          `${ab.subject ?? ""} ${ab.body ?? ""}`,
          subject,
          (message) => push(message, "abBody"),
        );
      }
      return;
    }
    case "send_whatsapp": {
      const value = config as WhatsAppConfig;
      if (!WHATSAPP_TEMPLATE.test(value.template ?? "")) {
        push(
          "Use the approved template's name: lowercase letters, digits and _",
          "template",
        );
      }
      if (!LANGUAGE.test(value.language ?? ""))
        push("Use a language code like en or en_US", "language");
      if ((value.params ?? []).length > LIMITS.params)
        push(`Use up to ${LIMITS.params} parameters`, "params");
      (value.params ?? []).forEach((param, index) => {
        if (!param.trim()) push(`Fill in parameter {{${index + 1}}}`, "params");
        checkVariables(param, subject, (message) => push(message, "params"));
      });
      checkPurpose(value.purpose, push);
      return;
    }
    case "notify": {
      const value = config as NotifyConfig;
      if (!value.message?.trim()) push("Write the message", "message");
      else if (value.message.length > LIMITS.message)
        push("Shorten the message", "message");
      checkVariables(value.message ?? "", subject, (message) =>
        push(message, "message"),
      );
      if (value.to !== "owner" && value.to !== "member")
        push("Pick who to notify", "to");
      if (value.to === "member") checkMember(value.memberId, context, push);
      return;
    }
    case "update_field": {
      const value = config as UpdateConfig;
      const allowed = updateFieldsFor(subject);
      if (!allowed.includes(value.field)) {
        return push(`Pick a field ${SUBJECT_LABEL[subject][1]} have`, "field");
      }
      const choices = updateValues(subject, value.field);
      if (!value.value?.trim()) return push("Pick a value", "value");
      if (choices && !choices.some((choice) => choice.value === value.value)) {
        return push("Pick a valid value", "value");
      }
      if (value.field === "owner" && value.value !== "round_robin") {
        checkMember(value.value, context, push);
      }
      return;
    }
    case "automation": {
      const value = config as AutomationLinkConfig;
      if (value.action !== "add" && value.action !== "remove")
        push("Pick add or remove", "action");
      if (!value.automationId)
        return push("Pick an automation", "automationId");
      if (value.automationId === context.selfId)
        push("Pick a different automation", "automationId");
      if (
        context.automationIds &&
        !context.automationIds.includes(value.automationId)
      ) {
        push("That automation no longer exists", "automationId");
      }
      return;
    }
    case "exit":
      return;
  }
}

function checkPurpose(
  purpose: string | undefined,
  push: (message: string, field?: string) => void,
) {
  if (purpose !== "sales_outreach" && purpose !== "product_updates") {
    push("Pick what the message is for", "purpose");
  }
}

function checkMember(
  id: string | undefined,
  context: ValidationContext,
  push: (message: string, field?: string) => void,
) {
  if (!id) return push("Pick a teammate", "memberId");
  if (context.memberIds && !context.memberIds.includes(id)) {
    push("That teammate is no longer active", "memberId");
  }
}

/** Problems that block activation; drafts may be saved with them. */
export function validateAutomation(
  draft: AutomationDraft,
  context: ValidationContext = {},
): Issue[] {
  const issues: Issue[] = [];
  const { nodes, edges } = draft.graph;
  const settings = draft.settings;
  const triggers = nodes.filter((node) => node.kind === "trigger");
  const trigger = triggers[0];
  if (triggers.length !== 1) {
    issues.push({ message: "Start from exactly one trigger" });
  }
  if (nodes.length > LIMITS.nodes) {
    issues.push({ message: `Use up to ${LIMITS.nodes} steps` });
  }
  checkTrigger(draft.trigger, draft.subjectKind, context, issues, trigger?.id);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length)
    issues.push({ message: "Two steps share an id" });
  const taken = new Set<string>();
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      issues.push({ message: "A connection points to a missing step" });
      continue;
    }
    if (!portsOf(source).includes(edge.port)) {
      issues.push({
        nodeId: source.id,
        message: "A connection leaves from a path this step doesn't have",
      });
    }
    if (!hasInput(target))
      issues.push({
        nodeId: target.id,
        message: "Nothing can lead into the trigger",
      });
    if (edge.source === edge.target)
      issues.push({
        nodeId: source.id,
        message: "A step can't lead to itself",
      });
    const key = `${edge.source}:${edge.port}`;
    if (taken.has(key)) {
      issues.push({
        nodeId: source.id,
        message: "One path leads to two steps; keep one",
      });
    }
    taken.add(key);
  }

  if (trigger) {
    const reached = new Set<string>([trigger.id]);
    const queue = [trigger.id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const edge of edges) {
        if (edge.source !== id || reached.has(edge.target)) continue;
        reached.add(edge.target);
        queue.push(edge.target);
      }
    }
    for (const node of nodes) {
      if (!reached.has(node.id)) {
        issues.push({
          nodeId: node.id,
          message: "Not connected to the trigger",
        });
      }
    }
    if (!edges.some((edge) => edge.source === trigger.id)) {
      issues.push({
        nodeId: trigger.id,
        message: "Add a first step after the trigger",
      });
    }
    if (hasCycle(nodes, edges))
      issues.push({
        message: "Steps loop back on themselves; remove the loop",
      });
  }

  for (const node of nodes) {
    if (!NODE_KINDS.includes(node.kind)) {
      issues.push({ nodeId: node.id, message: "Unknown step" });
      continue;
    }
    checkNode(node, draft, context, issues);
  }

  if (
    !Number.isInteger(settings.dailyCap) ||
    settings.dailyCap < LIMITS.dailyCap.min ||
    settings.dailyCap > LIMITS.dailyCap.max
  ) {
    issues.push({
      field: "dailyCap",
      message: `Daily cap is ${LIMITS.dailyCap.min} to ${LIMITS.dailyCap.max} messages`,
    });
  }
  if (settings.goal.length > LIMITS.goal) {
    issues.push({
      field: "goal",
      message: `Use up to ${LIMITS.goal} goal conditions`,
    });
  }
  checkConditions(settings.goal, draft.subjectKind, (message) =>
    issues.push({ field: "goal", message: `Goal: ${message}` }),
  );
  return issues;
}

function hasCycle(nodes: GraphNode[], edges: GraphEdge[]) {
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const edge of edges) {
      if (edge.source === id && visit(edge.target)) return true;
    }
    state.set(id, 2);
    return false;
  };
  return nodes.some((node) => visit(node.id));
}
