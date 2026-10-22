import {
  DEAL_STAGES,
  LEAD_KINDS,
  LEAD_STATUSES,
  LIFECYCLE_STAGES,
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
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUSES,
  PAUSE_REASONS,
  PLATFORM_EVENT_LABEL,
  PLATFORM_TRIGGER_LABEL,
  PLATFORM_TRIGGERS,
  type PlatformEventType,
  type PlatformTrigger,
} from "./platform";
import {
  type Condition,
  type ConditionConfig,
  type ConditionOp,
  SUBJECT_KINDS,
  type SubjectKind,
  type UpdateField,
} from "./automations-model";

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
