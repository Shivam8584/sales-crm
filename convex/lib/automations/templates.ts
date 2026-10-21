import {
  DEFAULT_SETTINGS,
  type AutomationSettings,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type NodeConfigs,
  type NodeKind,
  type PortId,
  type SubjectKind,
  type Trigger,
} from "../../../lib/domain/automations";

export type AutomationTemplate = {
  key: string;
  name: string;
  description: string;
  subjectKind: SubjectKind;
  trigger: Trigger;
  settings: AutomationSettings;
  graph: Graph;
};

const STEP = 190;
const SPREAD = 210;
const WIDTH = 320;

type Spec = {
  id: string;
  kind: NodeKind;
  /** Column: 0 main, -1 left (yes/met), 1 right (no/timeout). */
  col?: number;
  row: number;
  config?: NodeConfigs[NodeKind];
  from?: [string, PortId];
};

function build(specs: Spec[]): Graph {
  const nodes: GraphNode[] = specs.map((spec) => ({
    id: spec.id,
    kind: spec.kind,
    x: (spec.col ?? 0) * SPREAD * 1.1 - WIDTH / 2,
    y: spec.row * STEP,
    config: (spec.config ?? {}) as Record<string, unknown>,
  }));
  const edges: GraphEdge[] = specs
    .filter((spec) => spec.from)
    .map((spec) => ({
      id: `${spec.from![0]}-${spec.from![1]}-${spec.id}`,
      source: spec.from![0],
      port: spec.from![1],
      target: spec.id,
    }));
  return { nodes, edges };
}

const NOT_FUNDED = {
  field: "platform.event",
  op: "not_happened" as const,
  value: ["wallet.topup_succeeded", "wallet.deposit_received"],
};

export const TEMPLATES: AutomationTemplate[] = [
  {
    key: "demo-follow-up",
    name: "New demo request follow-up",
    description:
      "Confirms a new demo request by email, gives the owner a call task, then nudges on WhatsApp if the lead hasn't moved in two days.",
    subjectKind: "lead",
    trigger: { kind: "lead_created", leadKinds: ["demo"] },
    settings: {
      ...DEFAULT_SETTINGS,
      goal: [{ field: "lead.status", op: "is", value: ["converted"] }],
    },
    graph: build([
      { id: "trigger", kind: "trigger", row: 0 },
      {
        id: "email",
        kind: "send_email",
        row: 1,
        from: ["trigger", "out"],
        config: {
          subject: "Your Hypedrive demo, {{first_name}}",
          body: "Hi {{first_name}},\n\nThanks for asking for a demo of Hypedrive. I'm {{owner_first_name}}, and I'll walk you through how brands like {{company}} get honest reviews and UGC from real buyers on the marketplaces you sell on.\n\nI'll call you shortly to find a time that works. If it's easier, reply with a slot.\n\n{{owner_first_name}}",
          purpose: "sales_outreach",
        },
      },
      {
        id: "call",
        kind: "create_task",
        row: 2,
        from: ["email", "out"],
        config: {
          title: "Call {{name}} to confirm the demo",
          notes:
            "Confirm the slot, the marketplaces they sell on and their monthly orders.",
          assignee: "owner",
          dueInDays: 0,
          priority: "high",
        },
      },
      {
        id: "wait",
        kind: "wait",
        row: 3,
        from: ["call", "out"],
        config: { mode: "duration", amount: 2, unit: "days" },
      },
      {
        id: "still-open",
        kind: "condition",
        row: 4,
        from: ["wait", "out"],
        config: {
          match: "all",
          conditions: [
            { field: "lead.status", op: "is", value: ["new", "contacted"] },
          ],
        },
      },
      {
        id: "whatsapp",
        kind: "send_whatsapp",
        row: 5.2,
        col: -1,
        from: ["still-open", "yes"],
        config: {
          template: "demo_follow_up",
          language: "en",
          params: ["{{first_name}}", "{{owner_first_name}}"],
          purpose: "sales_outreach",
        },
      },
      {
        id: "moved-on",
        kind: "exit",
        row: 5.2,
        col: 1,
        from: ["still-open", "no"],
        config: { reason: "The lead moved on" },
      },
    ]),
  },
  {
    key: "gst-not-funded",
    name: "GST verified but not funded nudge",
    description:
      "After a brand creates its organisation with a verified GSTIN, nudges them on WhatsApp to top up, then hands the owner a call if they still haven't funded.",
    subjectKind: "account",
    trigger: { kind: "platform_event", eventTypes: ["organization.created"] },
    settings: {
      ...DEFAULT_SETTINGS,
      goal: [{ ...NOT_FUNDED, op: "happened" }],
    },
    graph: build([
      { id: "trigger", kind: "trigger", row: 0 },
      {
        id: "wait",
        kind: "wait",
        row: 1,
        from: ["trigger", "out"],
        config: { mode: "duration", amount: 1, unit: "days" },
      },
      {
        id: "unfunded",
        kind: "condition",
        row: 2,
        from: ["wait", "out"],
        config: { match: "all", conditions: [NOT_FUNDED] },
      },
      {
        id: "nudge",
        kind: "send_whatsapp",
        row: 3.2,
        col: -1,
        from: ["unfunded", "yes"],
        config: {
          template: "wallet_topup_nudge",
          language: "en",
          params: ["{{first_name}}", "{{company}}"],
          purpose: "sales_outreach",
        },
      },
      {
        id: "funded",
        kind: "exit",
        row: 3.2,
        col: 1,
        from: ["unfunded", "no"],
        config: { reason: "They funded their wallet" },
      },
      {
        id: "wait-again",
        kind: "wait",
        row: 4.2,
        col: -1,
        from: ["nudge", "out"],
        config: { mode: "duration", amount: 2, unit: "days" },
      },
      {
        id: "still-unfunded",
        kind: "condition",
        row: 5.2,
        col: -1,
        from: ["wait-again", "out"],
        config: { match: "all", conditions: [NOT_FUNDED] },
      },
      {
        id: "call",
        kind: "create_task",
        row: 6.4,
        col: -2,
        from: ["still-unfunded", "yes"],
        config: {
          title: "Call {{company}} about their first top-up",
          notes:
            "Send a UPI top-up link on WhatsApp, share their virtual account for bank transfers and recap what a first campaign returns.",
          assignee: "owner",
          dueInDays: 0,
          priority: "urgent",
        },
      },
      {
        id: "funded-later",
        kind: "exit",
        row: 6.4,
        col: 0,
        from: ["still-unfunded", "no"],
        config: { reason: "They funded their wallet" },
      },
    ]),
  },
  {
    key: "paused-for-funds",
    name: "Paused for funds rescue",
    description:
      "When a campaign auto-pauses for insufficient funds, alerts the owner, opens an urgent task and messages the brand. Nothing resumes the campaign after a top-up, so the task asks for both.",
    subjectKind: "account",
    trigger: {
      kind: "platform_event",
      eventTypes: ["campaign.status_changed"],
      campaignStatuses: ["paused"],
      pauseReasons: ["insufficient_funds"],
    },
    settings: { ...DEFAULT_SETTINGS, stopOnReply: false },
    graph: build([
      { id: "trigger", kind: "trigger", row: 0 },
      {
        id: "alert",
        kind: "notify",
        row: 1,
        from: ["trigger", "out"],
        config: {
          to: "owner",
          message:
            "{{company}}'s campaign paused: out of funds. It won't resume on its own after a top-up.",
        },
      },
      {
        id: "task",
        kind: "create_task",
        row: 2,
        from: ["alert", "out"],
        config: {
          title: "Get {{company}} to top up and resume their campaign",
          notes:
            "A top-up alone doesn't resume the campaign. Confirm the payment, then have them press Resume (or resume it with them on a call).",
          assignee: "owner",
          dueInDays: 0,
          priority: "urgent",
        },
      },
      {
        id: "message",
        kind: "send_whatsapp",
        row: 3,
        from: ["task", "out"],
        config: {
          template: "campaign_paused_funds",
          language: "en",
          params: ["{{first_name}}", "{{company}}"],
          purpose: "sales_outreach",
        },
      },
      {
        id: "wait-live",
        kind: "wait",
        row: 4,
        from: ["message", "out"],
        config: {
          mode: "event",
          event: {
            kind: "platform_event",
            eventTypes: ["campaign.status_changed"],
            campaignStatuses: ["live"],
          },
          timeoutAmount: 2,
          timeoutUnit: "days",
        },
      },
      {
        id: "resumed",
        kind: "exit",
        row: 5.2,
        col: -1,
        from: ["wait-live", "met"],
        config: { reason: "The campaign is live again" },
      },
      {
        id: "escalate",
        kind: "notify",
        row: 5.2,
        col: 1,
        from: ["wait-live", "timeout"],
        config: {
          to: "owner",
          message:
            "{{company}} is still paused two days later. Escalate or call again.",
        },
      },
    ]),
  },
  {
    key: "proposal-follow-up",
    name: "Proposal sent follow-up",
    description:
      "Three days after a deal reaches Proposal, emails the main contact and gives the owner a follow-up task, unless the deal has moved.",
    subjectKind: "deal",
    trigger: { kind: "deal_stage_changed", dealStages: ["proposal"] },
    settings: {
      ...DEFAULT_SETTINGS,
      goal: [
        { field: "deal.stage", op: "is", value: ["onboarding", "won", "lost"] },
      ],
    },
    graph: build([
      { id: "trigger", kind: "trigger", row: 0 },
      {
        id: "wait",
        kind: "wait",
        row: 1,
        from: ["trigger", "out"],
        config: { mode: "duration", amount: 3, unit: "days" },
      },
      {
        id: "still-proposal",
        kind: "condition",
        row: 2,
        from: ["wait", "out"],
        config: {
          match: "all",
          conditions: [{ field: "deal.stage", op: "is", value: ["proposal"] }],
        },
      },
      {
        id: "email",
        kind: "send_email",
        row: 3.2,
        col: -1,
        from: ["still-proposal", "yes"],
        config: {
          subject: "Following up on your Hypedrive proposal",
          body: "Hi {{first_name}},\n\nChecking in on the proposal for {{deal_title}}. Happy to walk through the numbers or adjust the slots and bonus to fit your budget.\n\nWould a 15-minute call this week help?\n\n{{owner_first_name}}",
          purpose: "sales_outreach",
        },
      },
      {
        id: "moved",
        kind: "exit",
        row: 3.2,
        col: 1,
        from: ["still-proposal", "no"],
        config: { reason: "The deal moved on" },
      },
      {
        id: "task",
        kind: "create_task",
        row: 4.2,
        col: -1,
        from: ["email", "out"],
        config: {
          title: "Follow up on the proposal for {{deal_title}}",
          assignee: "owner",
          dueInDays: 2,
          priority: "normal",
        },
      },
    ]),
  },
  {
    key: "renewal-after-end",
    name: "Renewal after campaign ended",
    description:
      "When a brand's campaign ends, tells the owner on the next weekday morning, sends a check-in email and books a renewal call.",
    subjectKind: "account",
    trigger: {
      kind: "platform_event",
      eventTypes: ["campaign.status_changed"],
      campaignStatuses: ["ended"],
    },
    settings: DEFAULT_SETTINGS,
    graph: build([
      { id: "trigger", kind: "trigger", row: 0 },
      {
        id: "morning",
        kind: "wait",
        row: 1,
        from: ["trigger", "out"],
        config: { mode: "until", days: [1, 2, 3, 4, 5], time: "10:00" },
      },
      {
        id: "alert",
        kind: "notify",
        row: 2,
        from: ["morning", "out"],
        config: {
          to: "owner",
          message:
            "{{company}} just ended a campaign. Plan the renewal while results are fresh.",
        },
      },
      {
        id: "email",
        kind: "send_email",
        row: 3,
        from: ["alert", "out"],
        config: {
          subject: "What's next after your campaign, {{first_name}}?",
          body: "Hi {{first_name}},\n\nYour campaign on Hypedrive has wrapped up. I'd love to share what worked for {{company}} and plan the next one: new SKUs, another marketplace or a bigger slot count.\n\nWhen's a good time to talk?\n\n{{owner_first_name}}",
          purpose: "sales_outreach",
        },
      },
      {
        id: "wait",
        kind: "wait",
        row: 4,
        from: ["email", "out"],
        config: { mode: "duration", amount: 5, unit: "days" },
      },
      {
        id: "call",
        kind: "create_task",
        row: 5,
        from: ["wait", "out"],
        config: {
          title: "Renewal call with {{company}}",
          notes: "Review the last campaign's results and propose the next one.",
          assignee: "owner",
          dueInDays: 0,
          priority: "high",
        },
      },
    ]),
  },
];

export const TEMPLATE = Object.fromEntries(
  TEMPLATES.map((template) => [template.key, template]),
) as Record<string, AutomationTemplate>;
