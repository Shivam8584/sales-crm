import {
  DEAL_STAGE_LABEL,
  LEAD_KIND_LABEL,
  LEAD_STATUS_LABEL,
  STAGE_LABEL,
} from "./labels";
import { CAMPAIGN_STATUS_LABEL } from "./platform";
import {
  configOf,
  type GraphNode,
  REPLY_CHANNEL_LABEL,
  type Trigger,
} from "./automations-model";
import { describeDuration, WEEKDAY_LABEL } from "./automations-time";
import {
  eventLabel,
  PAUSE_REASON_LABEL,
  UPDATE_FIELD_LABEL,
} from "./automations-fields";

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
    case "reply_received":
      return `They reply by ${listLabel(trigger.channels, (value) => lookup(REPLY_CHANNEL_LABEL, value)?.replace(/^E/, "e") ?? value, "email or WhatsApp")}`;
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
