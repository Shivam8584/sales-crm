import { CONSENT_PURPOSE_LABEL } from "@/lib/domain/consent";
import { PRIORITY_LABEL } from "@/lib/domain/labels";
import {
  OP_LABEL,
  SUBJECT_LABEL,
  conditionFields,
  configOf,
  describeNode,
  type Condition,
  type GraphNode,
  type NameLookup,
  type SubjectKind,
  type Trigger,
} from "@/lib/domain/automations";

const ASSIGNEE = {
  owner: "Owner",
  round_robin: "Round-robin",
  member: "",
} as const;

export function describeCondition(
  condition: Condition,
  names: NameLookup = {},
) {
  const field = conditionFields().find((item) => item.key === condition.field);
  if (!field) return "Pick a field";
  const values = (condition.value ?? []).map((value) =>
    field.type === "member"
      ? (names.member?.(value) ?? "a teammate")
      : (field.options?.find((option) => option.value === value)?.label ??
        value),
  );
  const shown =
    values.length > 2
      ? `${values.slice(0, 2).join(", ")} +${values.length - 2}`
      : values.join(" or ");
  return `${field.label} ${OP_LABEL[condition.op]}${shown ? ` ${shown}` : ""}`;
}

/** Card title and the muted line under it. */
export function describeStep(
  node: GraphNode,
  trigger: Trigger,
  subject: SubjectKind,
  names: NameLookup,
): { title: string; detail: string | null } {
  const title = node.title?.trim() || describeNode(node, trigger, names);
  switch (node.kind) {
    case "trigger":
      return { title, detail: `Enrols ${SUBJECT_LABEL[subject][1]}` };
    case "wait": {
      const mode = configOf(node, "wait").mode;
      return {
        title,
        detail:
          mode === "event"
            ? "Takes EVENT as soon as it happens, TIMEOUT otherwise"
            : mode === "until"
              ? "Then moves on"
              : "Then moves on to the next step",
      };
    }
    case "condition": {
      const config = configOf(node, "condition");
      const first = config.conditions?.[0];
      if (!first) return { title, detail: "Add a condition in Rules" };
      const more = config.conditions.length - 1;
      return {
        title,
        detail: `${describeCondition(first, names)}${more ? ` ${config.match === "any" ? "or" : "and"} ${more} more` : ""}`,
      };
    }
    case "create_task": {
      const config = configOf(node, "create_task");
      const who =
        config.assignee === "member"
          ? (names.member?.(config.memberId ?? "") ?? "A teammate")
          : ASSIGNEE[config.assignee];
      const due =
        config.dueInDays === 0
          ? "due today"
          : config.dueInDays === 1
            ? "due tomorrow"
            : `due in ${config.dueInDays} days`;
      return {
        title,
        detail: `${who} · ${due} · ${PRIORITY_LABEL[config.priority] ?? ""}`,
      };
    }
    case "send_email":
      return {
        title,
        detail: `${CONSENT_PURPOSE_LABEL[configOf(node, "send_email").purpose] ?? "Purpose not set"} · consent checked`,
      };
    case "send_whatsapp": {
      const config = configOf(node, "send_whatsapp");
      const count = config.params?.length ?? 0;
      return {
        title,
        detail: `${config.language || "—"} · ${count} ${count === 1 ? "parameter" : "parameters"} · consent checked`,
      };
    }
    case "update_field":
      return { title, detail: `On the ${SUBJECT_LABEL[subject][0]}` };
    default:
      return { title, detail: null };
  }
}
