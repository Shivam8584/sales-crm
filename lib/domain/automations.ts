/**
 * Automations: a trigger enrols a record (lead, person, account or deal) into a
 * graph of steps. Everything here is pure so the Convex engine, the dry run and
 * the editor share one definition of triggers, steps, waits and validation.
 */
import type { ConsentPurpose } from "./consent";
import {
  DEAL_STAGES,
  LEAD_KINDS,
  LEAD_STATUSES,
  LIFECYCLE_STAGES,
  PRIORITIES,
  type Channel,
  type Priority,
} from "./enums";
import {
  DEAL_STAGE_LABEL,
  LEAD_KIND_LABEL,
  LEAD_STATUS_LABEL,
  STAGE_LABEL,
} from "./labels";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STEP_LABEL,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  PAUSE_REASONS,
  PLATFORM_EVENT_LABEL,
  PLATFORM_TRIGGERS,
  PLATFORM_TRIGGER_LABEL,
  type PlatformEventType,
  type PlatformTrigger,
} from "./platform";

export const AUTOMATION_STATUSES = ["draft", "active", "paused"] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const AUTOMATION_STATUS_LABEL: Record<AutomationStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
};

export const ENROLLMENT_STATUSES = [
  "running",
  "waiting",
  "completed",
  "exited",
  "failed",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  running: "Running",
  waiting: "Waiting",
  completed: "Completed",
  exited: "Exited",
  failed: "Failed",
};

export const isLive = (status: EnrollmentStatus) =>
  status === "running" || status === "waiting";

export const SUBJECT_KINDS = ["lead", "person", "account", "deal"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export const SUBJECT_LABEL: Record<SubjectKind, [string, string]> = {
  lead: ["lead", "leads"],
  person: ["person", "people"],
  account: ["account", "accounts"],
  deal: ["deal", "deals"],
};

/** Ids of the records an event or enrollment touches, as strings. */
export type Refs = {
  leadId?: string;
  personId?: string;
  accountId?: string;
  dealId?: string;
};

export const SUBJECT_REF: Record<SubjectKind, keyof Refs> = {
  lead: "leadId",
  person: "personId",
  account: "accountId",
  deal: "dealId",
};

export const subjectKey = (kind: SubjectKind, id: string) => `${kind}:${id}`;

// ── Triggers ────────────────────────────────────────────────────────────────

export const TRIGGER_KINDS = [
  "lead_created",
  "lead_status_changed",
  "deal_stage_changed",
  "account_stage_changed",
  "platform_event",
  "stall_started",
  "task_completed",
  "manual",
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  lead_created: "Lead created",
  lead_status_changed: "Lead status changed",
  deal_stage_changed: "Deal stage changed",
  account_stage_changed: "Account stage changed",
  platform_event: "Platform event",
  stall_started: "Activation stall started",
  task_completed: "Task completed",
  manual: "Manual enrolment",
};

/** Which records a trigger can enrol; the first is the default. */
export const TRIGGER_SUBJECTS: Record<TriggerKind, SubjectKind[]> = {
  lead_created: ["lead"],
  lead_status_changed: ["lead"],
  deal_stage_changed: ["deal", "account"],
  account_stage_changed: ["account"],
  platform_event: ["account", "person", "lead"],
  stall_started: ["account"],
  task_completed: ["account", "deal", "lead", "person"],
  manual: ["account", "person", "lead", "deal"],
};

/** Empty or missing lists mean "any". */
export type Trigger = {
  kind: TriggerKind;
  leadKinds?: string[];
  leadSources?: string[];
  leadStatuses?: string[];
  dealStages?: string[];
  accountStages?: string[];
  eventTypes?: string[];
  /** With `campaign.status_changed`: the status it moved to. */
  campaignStatuses?: string[];
  /** With a move to paused: why. */
  pauseReasons?: string[];
  ruleIds?: string[];
};

/** What the CRM emits when something happens; `value` is the thing a trigger filters on. */
export type TriggerEvent = {
  kind: Exclude<TriggerKind, "manual">;
  refs: Refs;
  /** Lead kind, new lead status, new stage, platform event type or stall rule id. */
  value?: string;
  /** Lead source, for lead_created. */
  source?: string;
  campaignStatus?: string;
  pauseReason?: string;
  at: number;
};

const inList = (list: string[] | undefined, value: string | undefined) =>
  !list || list.length === 0 || (value !== undefined && list.includes(value));

/** The filter list a trigger kind uses for `TriggerEvent.value`. */
export function triggerValues(trigger: Trigger): string[] | undefined {
  switch (trigger.kind) {
    case "lead_created":
      return trigger.leadKinds;
    case "lead_status_changed":
      return trigger.leadStatuses;
    case "deal_stage_changed":
      return trigger.dealStages;
    case "account_stage_changed":
      return trigger.accountStages;
    case "platform_event":
      return trigger.eventTypes;
    case "stall_started":
      return trigger.ruleIds;
    default:
      return undefined;
  }
}

export function matchesTrigger(trigger: Trigger, event: TriggerEvent) {
  if (trigger.kind !== event.kind) return false;
  if (!inList(triggerValues(trigger), event.value)) return false;
  if (trigger.kind === "lead_created") {
    return inList(trigger.leadSources, event.source);
  }
  if (
    trigger.kind === "platform_event" &&
    event.value === "campaign.status_changed"
  ) {
    return (
      inList(trigger.campaignStatuses, event.campaignStatus) &&
      inList(trigger.pauseReasons, event.pauseReason)
    );
  }
  return true;
}

// ── Graph ───────────────────────────────────────────────────────────────────

export const NODE_KINDS = [
  "trigger",
  "wait",
  "condition",
  "create_task",
  "send_email",
  "send_whatsapp",
  "notify",
  "update_field",
  "automation",
  "exit",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_LABEL: Record<NodeKind, string> = {
  trigger: "Trigger",
  wait: "Wait",
  condition: "Condition",
  create_task: "Create task",
  send_email: "Send email",
  send_whatsapp: "WhatsApp template",
  notify: "Notify teammate",
  update_field: "Update field",
  automation: "Other automation",
  exit: "Exit",
};

export const PORTS = ["out", "yes", "no", "met", "timeout"] as const;
export type PortId = (typeof PORTS)[number];

export const PORT_LABEL: Record<PortId, string> = {
  out: "",
  yes: "YES",
  no: "NO",
  met: "EVENT",
  timeout: "TIMEOUT",
};

export const WAIT_UNITS = ["minutes", "hours", "days"] as const;
export type WaitUnit = (typeof WAIT_UNITS)[number];

export const WAIT_MODES = ["duration", "until", "event"] as const;
export type WaitMode = (typeof WAIT_MODES)[number];

export type WaitConfig = {
  mode: WaitMode;
  amount?: number;
  unit?: WaitUnit;
  /** ISO weekdays, 1 = Monday. */
  days?: number[];
  /** `HH:MM`, India time. */
  time?: string;
  event?: Trigger;
  timeoutAmount?: number;
  timeoutUnit?: WaitUnit;
};

export const CONDITION_OPS = [
  "is",
  "is_not",
  "contains",
  "gt",
  "lt",
  "is_true",
  "is_false",
  "has",
  "has_not",
  "happened",
  "not_happened",
  "reached",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export type Condition = { field: string; op: ConditionOp; value?: string[] };
export type ConditionConfig = { match: "all" | "any"; conditions: Condition[] };

export const ASSIGNEES = ["owner", "round_robin", "member"] as const;
export type Assignee = (typeof ASSIGNEES)[number];

export type TaskConfig = {
  title: string;
  notes?: string;
  assignee: Assignee;
  memberId?: string;
  dueInDays: number;
  priority: Priority;
};

export type EmailConfig = {
  subject: string;
  body: string;
  purpose: ConsentPurpose;
};

export type WhatsAppConfig = {
  template: string;
  language: string;
  params: string[];
  purpose: ConsentPurpose;
};

export type NotifyConfig = {
  to: "owner" | "member";
  memberId?: string;
  message: string;
};

export const UPDATE_FIELDS = [
  "stage",
  "status",
  "owner",
  "tag_add",
  "tag_remove",
] as const;
export type UpdateField = (typeof UPDATE_FIELDS)[number];

export type UpdateConfig = { field: UpdateField; value: string };
export type AutomationLinkConfig = {
  action: "add" | "remove";
  automationId: string;
};
export type ExitConfig = { reason?: string };

export type NodeConfigs = {
  trigger: Record<string, never>;
  wait: WaitConfig;
  condition: ConditionConfig;
  create_task: TaskConfig;
  send_email: EmailConfig;
  send_whatsapp: WhatsAppConfig;
  notify: NotifyConfig;
  update_field: UpdateConfig;
  automation: AutomationLinkConfig;
  exit: ExitConfig;
};

export type GraphNode = {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** Optional name shown on the canvas instead of the derived summary. */
  title?: string;
  config: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  source: string;
  port: PortId;
  target: string;
};

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** The node's settings typed by kind; throws if the node is another kind. */
export function configOf<K extends NodeKind>(
  node: GraphNode,
  kind: K,
): NodeConfigs[K] {
  if (node.kind !== kind) throw new Error(`Expected a ${kind} step`);
  return node.config as unknown as NodeConfigs[K];
}

export function portsOf(node: Pick<GraphNode, "kind" | "config">): PortId[] {
  if (node.kind === "exit") return [];
  if (node.kind === "condition") return ["yes", "no"];
  if (node.kind === "wait" && (node.config as WaitConfig).mode === "event") {
    return ["met", "timeout"];
  }
  return ["out"];
}

export const hasInput = (node: Pick<GraphNode, "kind">) =>
  node.kind !== "trigger";

export const isOutbound = (kind: NodeKind) =>
  kind === "send_email" || kind === "send_whatsapp";

export const NODE_CHANNEL: Partial<Record<NodeKind, Channel>> = {
  send_email: "email",
  send_whatsapp: "whatsapp",
};

export type AutomationSettings = {
  /** Outbound messages per India-time day across all enrollments. */
  dailyCap: number;
  /** Hold outbound messages to 9:00–20:00 India time. */
  quietHours: boolean;
  /** Exit when a teammate logs an email, WhatsApp, call or meeting after enrolment. */
  stopOnReply: boolean;
  /** Exit as soon as these all hold, e.g. the lead converted. */
  goal: Condition[];
  allowReenroll: boolean;
};

export const DEFAULT_SETTINGS: AutomationSettings = {
  dailyCap: 50,
  quietHours: true,
  stopOnReply: true,
  goal: [],
  allowReenroll: false,
};

export const LIMITS = {
  name: 120,
  description: 500,
  nodes: 60,
  title: 120,
  subject: 200,
  body: 5000,
  message: 1000,
  params: 10,
  dailyCap: { min: 1, max: 1000 },
  waitDays: 90,
  dueInDays: 365,
  goal: 10,
  conditions: 10,
} as const;

// ── Conditions ──────────────────────────────────────────────────────────────

export type FieldType =
  | "enum"
  | "text"
  | "number"
  | "boolean"
  | "tags"
  | "member"
  | "event"
  | "stage_path";

export type ConditionField = {
  key: string;
  label: string;
  type: FieldType;
  subjects: readonly SubjectKind[];
  options?: { value: string; label: string }[];
};

const ALL_SUBJECTS = SUBJECT_KINDS;

const options = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
) => values.map((value) => ({ value, label: labels[value] }));

export function platformEventOptions() {
  return PLATFORM_TRIGGERS.map((type) => ({
    value: type,
    label: eventLabel(type),
  }));
}

export function eventLabel(type: string) {
  const label =
    PLATFORM_TRIGGER_LABEL[type as PlatformTrigger] ??
    PLATFORM_EVENT_LABEL[type as PlatformEventType];
  return label ? capitalise(label) : type;
}

export const CAMPAIGN_STATUS_OPTIONS = options(
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
);

export const PAUSE_REASON_LABEL: Record<
  (typeof PAUSE_REASONS)[number],
  string
> = {
  brand_paused: "Paused by the brand",
  insufficient_funds: "Out of funds",
};

export const PAUSE_REASON_OPTIONS = options(PAUSE_REASONS, PAUSE_REASON_LABEL);

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export const ACTIVATION_STAGE_OPTIONS = ACTIVATION_STAGES.map((value) => ({
  value,
  label: ACTIVATION_STEP_LABEL[value],
}));

export function conditionFields(): ConditionField[] {
  return [
    {
      key: "lead.status",
      label: "Lead status",
      type: "enum",
      subjects: ["lead"],
      options: options(LEAD_STATUSES, LEAD_STATUS_LABEL),
    },
    {
      key: "lead.kind",
      label: "Lead kind",
      type: "enum",
      subjects: ["lead"],
      options: options(LEAD_KINDS, LEAD_KIND_LABEL),
    },
    {
      key: "lead.source",
      label: "Lead source",
      type: "text",
      subjects: ["lead"],
    },
    {
      key: "deal.stage",
      label: "Deal stage",
      type: "enum",
      subjects: ["deal"],
      options: options(DEAL_STAGES, DEAL_STAGE_LABEL),
    },
    {
      key: "deal.amount",
      label: "Deal amount",
      type: "number",
      subjects: ["deal"],
    },
    {
      key: "account.stage",
      label: "Account stage",
      type: "enum",
      subjects: ALL_SUBJECTS,
      options: options(LIFECYCLE_STAGES, STAGE_LABEL),
    },
    {
      key: "account.tags",
      label: "Account tags",
      type: "tags",
      subjects: ALL_SUBJECTS,
    },
    { key: "owner", label: "Owner", type: "member", subjects: ALL_SUBJECTS },
    {
      key: "consent.email",
      label: "Can email (sales outreach)",
      type: "boolean",
      subjects: ALL_SUBJECTS,
    },
    {
      key: "consent.whatsapp",
      label: "Can WhatsApp (sales outreach)",
      type: "boolean",
      subjects: ALL_SUBJECTS,
    },
    {
      key: "platform.event",
      label: "Platform event",
      type: "event",
      subjects: ALL_SUBJECTS,
      options: platformEventOptions(),
    },
    {
      key: "platform.stage",
      label: "Activation stage",
      type: "stage_path",
      subjects: ALL_SUBJECTS,
      options: ACTIVATION_STAGE_OPTIONS,
    },
    {
      key: "has_email",
      label: "Has an email address",
      type: "boolean",
      subjects: ALL_SUBJECTS,
    },
    {
      key: "has_phone",
      label: "Has a phone number",
      type: "boolean",
      subjects: ALL_SUBJECTS,
    },
  ];
}

export const OPS_FOR: Record<FieldType, ConditionOp[]> = {
  enum: ["is", "is_not"],
  text: ["is", "is_not", "contains"],
  number: ["gt", "lt"],
  boolean: ["is_true", "is_false"],
  tags: ["has", "has_not"],
  member: ["is", "is_not"],
  event: ["happened", "not_happened"],
  stage_path: ["reached", "is", "is_not"],
};

export const OP_LABEL: Record<ConditionOp, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  gt: "is more than",
  lt: "is less than",
  is_true: "is yes",
  is_false: "is no",
  has: "includes",
  has_not: "doesn't include",
  happened: "happened",
  not_happened: "hasn't happened",
  reached: "has reached",
};

export type FactValue = string | number | boolean | string[] | null;
export type Facts = Record<string, FactValue>;

function evaluate(condition: Condition, facts: Facts): boolean {
  const fact = facts[condition.field];
  const values = condition.value ?? [];
  switch (condition.op) {
    case "is":
      return typeof fact === "string" && values.includes(fact);
    case "is_not":
      return !(typeof fact === "string" && values.includes(fact));
    case "contains":
      return (
        typeof fact === "string" &&
        values.some((value) => fact.toLowerCase().includes(value.toLowerCase()))
      );
    case "gt":
      return typeof fact === "number" && fact > Number(values[0]);
    case "lt":
      return typeof fact === "number" && fact < Number(values[0]);
    case "is_true":
      return fact === true;
    case "is_false":
      return fact !== true;
    case "has":
    case "happened":
      return (
        Array.isArray(fact) &&
        values.some((value) =>
          fact.some((item) => item.toLowerCase() === value.toLowerCase()),
        )
      );
    case "has_not":
    case "not_happened":
      return !(
        Array.isArray(fact) &&
        values.some((value) =>
          fact.some((item) => item.toLowerCase() === value.toLowerCase()),
        )
      );
    case "reached": {
      const at = ACTIVATION_STAGES.indexOf(fact as never);
      const target = Math.min(
        ...values.map((value) => ACTIVATION_STAGES.indexOf(value as never)),
      );
      return at >= 0 && target >= 0 && at >= target;
    }
  }
}

export function evaluateConditions(config: ConditionConfig, facts: Facts) {
  if (config.conditions.length === 0) return true;
  return config.match === "any"
    ? config.conditions.some((condition) => evaluate(condition, facts))
    : config.conditions.every((condition) => evaluate(condition, facts));
}

export const goalMet = (goal: Condition[], facts: Facts) =>
  goal.length > 0 &&
  evaluateConditions({ match: "all", conditions: goal }, facts);

// ── Time (India) ────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const IST_OFFSET = 330 * MINUTE;

export const QUIET_HOURS = { start: 9 * 60, end: 20 * 60 } as const;

export const UNIT_MS: Record<WaitUnit, number> = {
  minutes: MINUTE,
  hours: HOUR,
  days: DAY,
};

export const WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** India-time weekday (1 = Monday), minute of day and the epoch ms of that day's midnight. */
export function istClock(at: number) {
  const shifted = at + IST_OFFSET;
  const dayStart = Math.floor(shifted / DAY) * DAY - IST_OFFSET;
  const weekday = ((new Date(shifted).getUTCDay() + 6) % 7) + 1;
  return { weekday, minutes: Math.floor((shifted % DAY) / MINUTE), dayStart };
}

export function istDay(at: number) {
  return new Date(at + IST_OFFSET).toISOString().slice(0, 10);
}

export function parseTime(time: string | undefined) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Next moment after `now` that falls on one of `days` at `time`, India time. */
export function nextWeekdayTime(now: number, days: number[], time: string) {
  const minutes = parseTime(time) ?? 0;
  const { dayStart } = istClock(now);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = dayStart + offset * DAY + minutes * MINUTE;
    if (candidate <= now) continue;
    if (days.length === 0 || days.includes(istClock(candidate).weekday)) {
      return candidate;
    }
  }
  return dayStart + 7 * DAY + minutes * MINUTE;
}

/** `at`, or the start of the next 9:00–20:00 India-time window. */
export function sendWindow(at: number) {
  const { minutes, dayStart } = istClock(at);
  if (minutes >= QUIET_HOURS.start && minutes < QUIET_HOURS.end) return at;
  const start = dayStart + QUIET_HOURS.start * MINUTE;
  return minutes < QUIET_HOURS.start ? start : start + DAY;
}

/** Start of the next India-time day's send window, for a hit daily cap. */
export function nextDayWindow(at: number) {
  return istClock(at).dayStart + DAY + QUIET_HOURS.start * MINUTE;
}

/** When a duration or weekday wait ends; null for event waits. */
export function waitUntil(config: WaitConfig, now: number): number | null {
  if (config.mode === "duration") {
    return now + (config.amount ?? 0) * UNIT_MS[config.unit ?? "days"];
  }
  if (config.mode === "until") {
    return nextWeekdayTime(now, config.days ?? [], config.time ?? "09:00");
  }
  return null;
}

export function waitTimeout(config: WaitConfig, now: number) {
  return (
    now + (config.timeoutAmount ?? 0) * UNIT_MS[config.timeoutUnit ?? "days"]
  );
}

const plural = (count: number, unit: string) =>
  `${count} ${count === 1 ? unit.replace(/s$/, "") : unit}`;

export function describeDuration(
  amount: number | undefined,
  unit: WaitUnit | undefined,
) {
  return plural(amount ?? 0, unit ?? "days");
}

// ── Templates ({{variables}}) ───────────────────────────────────────────────

export const TEMPLATE_VARIABLES = [
  "first_name",
  "name",
  "company",
  "owner_name",
  "owner_first_name",
  "deal_title",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export const TEMPLATE_VARIABLE_LABEL: Record<TemplateVariable, string> = {
  first_name: "Recipient's first name",
  name: "Record name",
  company: "Company",
  owner_name: "Owner's name",
  owner_first_name: "Owner's first name",
  deal_title: "Deal title",
};

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function templateVariables(text: string) {
  return [...text.matchAll(VARIABLE)].map((match) => match[1]);
}

/** Fills `{{variables}}`; `missing` lists the ones without a value. */
export function renderTemplate(
  text: string,
  vars: Partial<Record<string, string>>,
) {
  const missing = new Set<string>();
  const out = text.replace(VARIABLE, (_, key: string) => {
    const value = vars[key];
    if (!value) missing.add(key);
    return value ?? "";
  });
  return { text: out, missing: [...missing] };
}

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

function checkVariables(text: string, push: (message: string) => void) {
  const unknown = templateVariables(text).filter(
    (name) => !TEMPLATE_VARIABLES.includes(name as TemplateVariable),
  );
  if (unknown.length) push(`Unknown variable {{${unknown[0]}}}`);
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
      checkVariables(value.title ?? "", (message) => push(message, "title"));
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
      checkVariables(`${value.subject ?? ""} ${value.body ?? ""}`, (message) =>
        push(message, "body"),
      );
      checkPurpose(value.purpose, push);
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
        checkVariables(param, (message) => push(message, "params"));
      });
      checkPurpose(value.purpose, push);
      return;
    }
    case "notify": {
      const value = config as NotifyConfig;
      if (!value.message?.trim()) push("Write the message", "message");
      else if (value.message.length > LIMITS.message)
        push("Shorten the message", "message");
      checkVariables(value.message ?? "", (message) =>
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

export function updateFieldsFor(subject: SubjectKind): UpdateField[] {
  switch (subject) {
    case "lead":
      return ["status", "owner"];
    case "deal":
      return ["stage", "owner"];
    case "account":
      return ["stage", "owner", "tag_add", "tag_remove"];
    case "person":
      return ["owner", "tag_add", "tag_remove"];
  }
}

export const UPDATE_FIELD_LABEL: Record<UpdateField, string> = {
  stage: "Stage",
  status: "Status",
  owner: "Owner",
  tag_add: "Add tag",
  tag_remove: "Remove tag",
};

/** Fixed choices for a field, or null when the value is free text or a teammate. */
export function updateValues(subject: SubjectKind, field: UpdateField) {
  if (field === "stage" && subject === "deal") {
    return options(
      DEAL_STAGES.filter((stage) => stage !== "won" && stage !== "lost"),
      DEAL_STAGE_LABEL,
    );
  }
  if (field === "stage") return options(LIFECYCLE_STAGES, STAGE_LABEL);
  if (field === "status") {
    return options(
      LEAD_STATUSES.filter(
        (status) => status !== "converted" && status !== "disqualified",
      ),
      LEAD_STATUS_LABEL,
    );
  }
  return null;
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

// ── Summaries ───────────────────────────────────────────────────────────────

export type NameLookup = {
  member?: (id: string) => string | undefined;
  automation?: (id: string) => string | undefined;
  rule?: (id: string) => string | undefined;
};

function listLabel(
  values: string[] | undefined,
  label: (value: string) => string,
  any: string,
) {
  if (!values?.length) return any;
  if (values.length <= 2) return values.map(label).join(" or ");
  return `${label(values[0])} or ${values.length - 1} more`;
}

const lookup = (map: Record<string, string>, key: string): string | undefined =>
  map[key];

export function describeTrigger(trigger: Trigger, names: NameLookup = {}) {
  switch (trigger.kind) {
    case "lead_created":
      return `A ${listLabel(trigger.leadKinds, (value) => lookup(LEAD_KIND_LABEL, value)?.toLowerCase() ?? value, "new")} lead comes in`;
    case "lead_status_changed":
      return `A lead moves to ${listLabel(trigger.leadStatuses, (value) => lookup(LEAD_STATUS_LABEL, value) ?? value, "any status")}`;
    case "deal_stage_changed":
      return `A deal moves to ${listLabel(trigger.dealStages, (value) => lookup(DEAL_STAGE_LABEL, value) ?? value, "any stage")}`;
    case "account_stage_changed":
      return `An account moves to ${listLabel(trigger.accountStages, (value) => lookup(STAGE_LABEL, value) ?? value, "any stage")}`;
    case "platform_event": {
      const events = listLabel(
        trigger.eventTypes,
        eventLabel,
        "Any platform event",
      );
      if (!trigger.eventTypes?.includes("campaign.status_changed"))
        return events;
      const statuses = trigger.campaignStatuses?.length
        ? ` → ${listLabel(trigger.campaignStatuses, (value) => lookup(CAMPAIGN_STATUS_LABEL, value) ?? value, "")}`
        : "";
      const reasons = trigger.pauseReasons?.length
        ? ` (${listLabel(trigger.pauseReasons, (value) => lookup(PAUSE_REASON_LABEL, value)?.toLowerCase() ?? value, "")})`
        : "";
      return `${events}${statuses}${reasons}`;
    }
    case "stall_started":
      return `A brand gets stuck: ${listLabel(trigger.ruleIds, (value) => names.rule?.(value) ?? value, "any step")}`;
    case "task_completed":
      return "A teammate completes a task on the record";
    case "manual":
      return "A teammate enrols the record by hand";
  }
}

/** One-line summary of what a step does, shown on its card. */
export function describeNode(
  node: GraphNode,
  trigger: Trigger,
  names: NameLookup = {},
): string {
  switch (node.kind) {
    case "trigger":
      return describeTrigger(trigger, names);
    case "wait": {
      const config = configOf(node, "wait");
      if (config.mode === "duration")
        return `Wait ${describeDuration(config.amount, config.unit)}`;
      if (config.mode === "until") {
        const days = config.days ?? [];
        const label =
          days.length === 7
            ? "any day"
            : days.length === 5 &&
                [1, 2, 3, 4, 5].every((day) => days.includes(day))
              ? "a weekday"
              : days.map((day) => WEEKDAY_LABEL[day - 1]).join(", ") || "—";
        return `Until ${label} at ${config.time ?? "09:00"} IST`;
      }
      const event = config.event
        ? describeTrigger(config.event, names)
        : "an event";
      return `Until ${event.charAt(0).toLowerCase()}${event.slice(1)}, up to ${describeDuration(config.timeoutAmount, config.timeoutUnit)}`;
    }
    case "condition": {
      const count = configOf(node, "condition").conditions?.length ?? 0;
      return count === 1
        ? "Branch on 1 condition"
        : `Branch on ${count} conditions`;
    }
    case "create_task": {
      const config = configOf(node, "create_task");
      return config.title?.trim() || "Untitled task";
    }
    case "send_email":
      return configOf(node, "send_email").subject?.trim() || "No subject yet";
    case "send_whatsapp":
      return configOf(node, "send_whatsapp").template || "No template yet";
    case "notify": {
      const config = configOf(node, "notify");
      const who =
        config.to === "member"
          ? (names.member?.(config.memberId ?? "") ?? "a teammate")
          : "the owner";
      return `Tell ${who}: ${config.message?.trim() || "…"}`;
    }
    case "update_field": {
      const config = configOf(node, "update_field");
      const value =
        config.field === "owner"
          ? config.value === "round_robin"
            ? "next in rotation"
            : (names.member?.(config.value) ?? "a teammate")
          : (lookup(STAGE_LABEL, config.value) ??
            lookup(DEAL_STAGE_LABEL, config.value) ??
            lookup(LEAD_STATUS_LABEL, config.value) ??
            config.value);
      return `${UPDATE_FIELD_LABEL[config.field] ?? "Field"} → ${value || "…"}`;
    }
    case "automation": {
      const config = configOf(node, "automation");
      const name =
        names.automation?.(config.automationId) ?? "another automation";
      return config.action === "remove"
        ? `Remove from ${name}`
        : `Add to ${name}`;
    }
    case "exit":
      return configOf(node, "exit").reason?.trim() || "End of the automation";
  }
}

// ── Dry run ─────────────────────────────────────────────────────────────────

export type ConsentFacts = Record<
  string,
  { allowed: boolean; message: string }
>;

export const consentKey = (channel: Channel, purpose: ConsentPurpose) =>
  `${channel}:${purpose}`;

export type SimulationInput = {
  draft: AutomationDraft;
  facts: Facts;
  consent: ConsentFacts;
  vars: Partial<Record<string, string>>;
  now: number;
  names?: NameLookup;
};

export type SimStep = {
  nodeId: string;
  port: PortId | null;
  at: number;
  outcome: "done" | "skipped" | "waited" | "exited" | "error";
  message: string;
};

const MAX_SIM_STEPS = 80;

/** Walks the graph for one record without side effects: what would happen, and when. */
export function simulate({
  draft,
  facts,
  consent,
  vars,
  now,
  names = {},
}: SimulationInput) {
  const steps: SimStep[] = [];
  const { graph, settings } = draft;
  const trigger = graph.nodes.find((node) => node.kind === "trigger");
  if (!trigger) return steps;
  let clock = now;
  let current: GraphNode | undefined = trigger;
  if (goalMet(settings.goal, facts)) {
    steps.push({
      nodeId: trigger.id,
      port: null,
      at: clock,
      outcome: "exited",
      message: "Already meets the goal, so it would exit right away",
    });
    return steps;
  }
  while (current && steps.length < MAX_SIM_STEPS) {
    const node: GraphNode = current;
    const step = simulateNode(node, draft, facts, consent, vars, clock, names);
    steps.push(step);
    clock = step.at;
    if (step.outcome === "exited" || step.outcome === "error" || !step.port)
      break;
    const next = nextNodeId(graph, node.id, step.port);
    current = next ? graph.nodes.find((item) => item.id === next) : undefined;
  }
  return steps;
}

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export const formatIst = (at: number) => `${timeFormat.format(at)} IST`;

/** When an outbound message would go out, given quiet hours. */
export function sendTime(settings: AutomationSettings, at: number) {
  return settings.quietHours ? sendWindow(at) : at;
}

function simulateNode(
  node: GraphNode,
  draft: AutomationDraft,
  facts: Facts,
  consent: ConsentFacts,
  vars: Partial<Record<string, string>>,
  at: number,
  names: NameLookup,
): SimStep {
  const base = { nodeId: node.id, at };
  switch (node.kind) {
    case "trigger":
      return { ...base, port: "out", outcome: "done", message: "Enrolled" };
    case "wait": {
      const config = configOf(node, "wait");
      if (config.mode === "event") {
        const until = waitTimeout(config, at);
        return {
          ...base,
          at: until,
          port: "timeout",
          outcome: "waited",
          message: `Would wait for ${config.event ? describeTrigger(config.event, names).toLowerCase() : "the event"} until ${formatIst(until)}; the dry run follows the timeout path`,
        };
      }
      const until = waitUntil(config, at) ?? at;
      return {
        ...base,
        at: until,
        port: "out",
        outcome: "waited",
        message: `Would wait until ${formatIst(until)}`,
      };
    }
    case "condition": {
      const result = evaluateConditions(configOf(node, "condition"), facts);
      return {
        ...base,
        port: result ? "yes" : "no",
        outcome: "done",
        message: result
          ? "Conditions met → YES path"
          : "Conditions not met → NO path",
      };
    }
    case "send_email":
    case "send_whatsapp": {
      const channel = NODE_CHANNEL[node.kind]!;
      const purpose =
        node.kind === "send_email"
          ? configOf(node, "send_email").purpose
          : configOf(node, "send_whatsapp").purpose;
      const decision = consent[consentKey(channel, purpose)];
      if (!decision?.allowed) {
        return {
          ...base,
          port: "out",
          outcome: "skipped",
          message: `Would skip: ${decision?.message ?? "no consent on record"}`,
        };
      }
      const sendAt = sendTime(draft.settings, at);
      const when =
        sendAt === at ? "now" : `at ${formatIst(sendAt)} (quiet hours)`;
      if (node.kind === "send_email") {
        const config = configOf(node, "send_email");
        const subject = renderTemplate(config.subject, vars);
        const missing = [
          ...subject.missing,
          ...renderTemplate(config.body, vars).missing,
        ];
        return {
          ...base,
          at: sendAt,
          port: "out",
          outcome: "done",
          message: `Would queue the email “${subject.text}” ${when}${missing.length ? ` · empty {{${missing[0]}}}` : ""}`,
        };
      }
      const config = configOf(node, "send_whatsapp");
      return {
        ...base,
        at: sendAt,
        port: "out",
        outcome: "done",
        message: `Would queue the WhatsApp template ${config.template} ${when}`,
      };
    }
    case "create_task": {
      const config = configOf(node, "create_task");
      return {
        ...base,
        port: "out",
        outcome: "done",
        message: `Would create the task “${renderTemplate(config.title, vars).text}”`,
      };
    }
    case "notify":
      return {
        ...base,
        port: "out",
        outcome: "done",
        message: `Would ${describeNode(node, draft.trigger, names).replace(/^Tell/, "tell")}`,
      };
    case "update_field":
      return {
        ...base,
        port: "out",
        outcome: "done",
        message: `Would set ${describeNode(node, draft.trigger, names)}`,
      };
    case "automation":
      return {
        ...base,
        port: "out",
        outcome: "done",
        message: `Would ${describeNode(node, draft.trigger, names).replace(/^(Add|Remove)/, (word) => word.toLowerCase())}`,
      };
    case "exit":
      return {
        ...base,
        port: null,
        outcome: "exited",
        message: describeNode(node, draft.trigger, names),
      };
  }
}

export type { Channel, ConsentPurpose, Priority };
