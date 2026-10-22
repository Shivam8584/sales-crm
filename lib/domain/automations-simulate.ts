import type { ConsentPurpose } from "./consent";
import type { Channel } from "./enums";
import {
  type AutomationSettings,
  configOf,
  type GraphNode,
  NODE_CHANNEL,
  type PortId,
} from "./automations-model";
import { sendWindow, waitTimeout, waitUntil } from "./automations-time";
import { evaluateConditions, type Facts, goalMet } from "./automations-fields";
import {
  missingMessage,
  nodeTexts,
  renderTemplate,
} from "./automations-variables";
import type { AutomationDraft } from "./automations-validate";
import { nextNodeId } from "./automations-graph";
import {
  describeNode,
  describeTrigger,
  type NameLookup,
} from "./automations-describe";

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
      const texts = nodeTexts(node);
      const missing = [
        ...new Set(texts.flatMap((text) => renderTemplate(text, vars).missing)),
      ];
      if (missing.length) {
        return {
          ...base,
          port: "out",
          outcome: "skipped",
          message: `Would skip: ${missingMessage(missing)}`,
        };
      }
      const sendAt = sendTime(draft.settings, at);
      const when =
        sendAt === at ? "now" : `at ${formatIst(sendAt)} (quiet hours)`;
      if (node.kind === "send_email") {
        const config = configOf(node, "send_email");
        const subject = renderTemplate(config.subject, vars);
        return {
          ...base,
          at: sendAt,
          port: "out",
          outcome: "done",
          message: `Would queue the email “${subject.text}” ${when}`,
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
