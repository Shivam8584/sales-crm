import type { AbConfig } from "./ab-test";
import type { ConsentPurpose } from "./consent";
import type { Channel, Priority } from "./enums";
import { normalizeEmail } from "./normalize";

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
  "reply_received",
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
  reply_received: "Reply received",
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
  reply_received: ["person", "lead", "account"],
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
  /** With `reply_received`: the channels the reply came in on. */
  channels?: string[];
};

export const REPLY_CHANNELS = ["email", "whatsapp"] as const;
export type ReplyChannel = (typeof REPLY_CHANNELS)[number];
export const REPLY_CHANNEL_LABEL: Record<ReplyChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
};

/** What the CRM emits when something happens; `value` is the thing a trigger filters on. */
export type TriggerEvent = {
  kind: Exclude<TriggerKind, "manual">;
  refs: Refs;
  /** Lead kind, new lead status, new stage, platform event type, stall rule id or reply channel. */
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
    case "reply_received":
      return trigger.channels;
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
  ab?: AbConfig;
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

export const LANGUAGES = ["en", "hinglish", "hi"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Each language's own name for itself, as a reader would look for it. */
export const LANGUAGE_LABEL: Record<Language, string> = {
  en: "English",
  hinglish: "Hinglish",
  hi: "हिन्दी",
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
  /** Display name on emails; the address always comes from the server. */
  senderName?: string;
  /** Where replies go instead of the workspace's reply address. */
  replyTo?: string;
  /** What the emails are written in; picks the unsubscribe line. English when unset. */
  language?: Language;
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
  senderName: 60,
} as const;

// Anything that could end or split a quoted display name, or start a new header line.
const UNSAFE_NAME = /[\u0000-\u001f\u007f\u2028\u2029<>"\\]/;

export type SenderCheck =
  | { ok: true; senderName?: string; replyTo?: string }
  | { ok: false; field: "senderName" | "replyTo"; message: string };

export function checkSender(input: {
  senderName?: string;
  replyTo?: string;
}): SenderCheck {
  const senderName = input.senderName?.trim() || undefined;
  if (senderName && senderName.length > LIMITS.senderName) {
    return {
      ok: false,
      field: "senderName",
      message: `Keep the sender name under ${LIMITS.senderName} characters`,
    };
  }
  if (senderName && UNSAFE_NAME.test(senderName)) {
    return {
      ok: false,
      field: "senderName",
      message: "The sender name can't contain line breaks, quotes, < > or \\",
    };
  }
  const typed = input.replyTo?.trim();
  const replyTo = typed ? normalizeEmail(typed) : undefined;
  if (typed && !replyTo) {
    return {
      ok: false,
      field: "replyTo",
      message: "Enter one plain email address, like name@company.com",
    };
  }
  return {
    ok: true,
    ...(senderName && { senderName }),
    ...(replyTo && { replyTo }),
  };
}
