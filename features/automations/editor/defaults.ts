import {
  updateFieldsFor,
  updateValues,
  type GraphNode,
  type NodeConfigs,
  type NodeKind,
  type SubjectKind,
} from "@/lib/domain/automations";

/** Starting settings for a new step, already valid where a sensible default exists. */
export function defaultConfig(
  kind: NodeKind,
  subject: SubjectKind,
): NodeConfigs[NodeKind] {
  switch (kind) {
    case "trigger":
      return {};
    case "wait":
      return { mode: "duration", amount: 1, unit: "days" };
    case "condition":
      return {
        match: "all",
        conditions: [{ field: "consent.email", op: "is_true" }],
      };
    case "create_task":
      return {
        title: "Follow up with {{record.name}}",
        assignee: "owner",
        dueInDays: 0,
        priority: "normal",
      };
    case "send_email":
      return {
        subject: "",
        body: "Hi {{person.firstName|there}},\n\n\n\n{{owner.firstName}}",
        purpose: "sales_outreach",
      };
    case "send_whatsapp":
      return {
        template: "",
        language: "en",
        params: ["{{person.firstName|there}}"],
        purpose: "sales_outreach",
      };
    case "notify":
      return { to: "owner", message: "{{record.name}} needs a look" };
    case "update_field": {
      const field = updateFieldsFor(subject)[0];
      return { field, value: updateValues(subject, field)?.[0]?.value ?? "" };
    }
    case "automation":
      return { action: "add", automationId: "" };
    case "exit":
      return {};
  }
}

export function newNode(
  kind: NodeKind,
  position: { x: number; y: number },
  subject: SubjectKind,
): GraphNode {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `${kind.replace("_", "-")}-${suffix}`,
    kind,
    x: Math.round(position.x),
    y: Math.round(position.y),
    config: defaultConfig(kind, subject) as Record<string, unknown>,
  };
}
