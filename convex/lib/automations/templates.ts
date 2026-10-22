import {
  DEFAULT_SETTINGS,
  type AutomationSettings,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type EmailConfig,
  type NodeConfigs,
  type NodeKind,
  type TaskConfig,
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

const FUNDED = {
  field: "platform.event",
  op: "happened" as const,
  value: ["wallet.topup_succeeded", "wallet.deposit_received"],
};

const REGISTERED = {
  field: "platform.event",
  op: "happened" as const,
  value: ["organization.created"],
};

const LEAD_DONE = {
  field: "lead.status",
  op: "is" as const,
  value: ["qualified", "nurture", "disqualified", "converted"],
};

type Step = Pick<Spec, "kind" | "config">;

const FIRST_NAME = "{{person.firstName|there}}";
const SIGN_OFF = "{{owner.firstName|The Hypedrive team}}";

const email = (subject: string, text: string): Step => ({
  kind: "send_email",
  config: {
    subject,
    body: `Hi ${FIRST_NAME},\n\n${text}\n\n${SIGN_OFF}`,
    purpose: "sales_outreach",
  } satisfies EmailConfig,
});

const wait = (amount: number, unit: "hours" | "days" = "days"): Step => ({
  kind: "wait",
  config: { mode: "duration", amount, unit },
});

const task = (title: string, notes: string): Step => ({
  kind: "create_task",
  config: {
    title,
    notes,
    assignee: "owner",
    dueInDays: 0,
    priority: "high",
  } satisfies TaskConfig,
});

function sequence(steps: Step[]): Graph {
  return build([
    { id: "trigger", kind: "trigger", row: 0 },
    ...steps.map((step, index) => ({
      ...step,
      id: `step-${index + 1}`,
      row: index + 1,
      from: [index ? `step-${index}` : "trigger", "out"] as [string, PortId],
    })),
  ]);
}

export const TEMPLATES: AutomationTemplate[] = [
  {
    key: "new-lead-follow-up",
    name: "New lead follow-up",
    description:
      "An intro email as soon as a lead comes in, a nudge the next day and a last-call task for the owner on day 3.",
    subjectKind: "lead",
    trigger: { kind: "lead_created" },
    settings: { ...DEFAULT_SETTINGS, goal: [LEAD_DONE] },
    graph: sequence([
      email(
        "Quick hello from Hypedrive",
        "Thanks for your interest in Hypedrive. We help brands selling on marketplaces get genuine reviews and photos from real buyers.\n\nTell me which marketplaces you sell on and roughly how many orders you ship a month, and I'll suggest where to start. Or reply with a time for a short call.",
      ),
      wait(1),
      email(
        "Still interested in Hypedrive?",
        "Just checking my earlier note reached you. If now isn't a good time, tell me when to come back and I will.",
      ),
      wait(2),
      task(
        "Last call: {{record.name}}",
        "Two emails sent and no reply. Call once. If there's no answer, move the lead to Nurture.",
      ),
    ]),
  },
  {
    key: "demo-no-show",
    name: "Demo no-show re-book",
    description:
      "Start it by hand when a lead misses a demo: a re-book email now, a second one after two days and a call task after five.",
    subjectKind: "lead",
    trigger: { kind: "manual" },
    settings: { ...DEFAULT_SETTINGS, goal: [LEAD_DONE] },
    graph: sequence([
      email(
        "Sorry we missed each other",
        "We missed you at the Hypedrive demo. These things happen.\n\nReply with a day and time that works and I'll set it up again. It takes about 20 minutes.",
      ),
      wait(2),
      email(
        "Shall we find a new time for your demo?",
        "I haven't heard back about rescheduling. If a different day or time suits you better, reply with it. If you'd rather not go ahead, a one-line reply is fine too.",
      ),
      wait(3),
      task(
        "Call {{record.name}} to re-book the demo",
        "They missed the demo and haven't replied to two emails. Call, offer two slots, and close the lead if they decline.",
      ),
    ]),
  },
  {
    key: "gst-failed",
    name: "GST verification failed",
    description:
      "When a brand's GST check fails at signup, emails the usual fixes after two hours and gives the owner a call task two days later.",
    subjectKind: "person",
    trigger: {
      kind: "platform_event",
      eventTypes: ["organization.gst_failed"],
    },
    settings: { ...DEFAULT_SETTINGS, goal: [REGISTERED] },
    graph: sequence([
      wait(2, "hours"),
      email(
        "Your GST check on Hypedrive didn't go through",
        "Your GST verification didn't go through when you signed up. The usual causes are a typo in the GSTIN, a registration that is cancelled or suspended, or a legal name that doesn't match the one on the GST portal.\n\nReply with the GSTIN you used and I'll go through it with you. Hypedrive needs a verified GSTIN before you can create your brand.",
      ),
      wait(2),
      task(
        "Call {{record.name}} to fix their GST",
        "GST failed at signup and they still have no organisation. Find out why, walk them through a retry, or point them to a CA if the registration itself needs fixing.",
      ),
    ]),
  },
  {
    key: "signup-no-org",
    name: "Signed up, no organisation yet",
    description:
      "A day after signup with no organisation created, offers help with the setup form, then a call task two days on.",
    subjectKind: "person",
    trigger: { kind: "platform_event", eventTypes: ["user.signed_up"] },
    settings: { ...DEFAULT_SETTINGS, goal: [REGISTERED] },
    graph: sequence([
      wait(1),
      email(
        "Need a hand setting up your brand on Hypedrive?",
        "You signed up for Hypedrive but haven't created your brand yet. It takes about five minutes and needs your brand name, website, a support phone number and your GSTIN.\n\nIf it's easier, reply and I'll fill it in with you on a call.",
      ),
      wait(2),
      task(
        "Call {{record.name}}: signed up, no organisation",
        "Signed up three days ago and still hasn't created an organisation. Offer to fill the form in together on the call.",
      ),
    ]),
  },
  {
    key: "no-first-top-up",
    name: "No first top-up",
    description:
      "After a brand's organisation is created, explains how to fund the wallet after two days, then gives the owner a call task three days later.",
    subjectKind: "account",
    trigger: { kind: "platform_event", eventTypes: ["organization.created"] },
    settings: { ...DEFAULT_SETTINGS, goal: [FUNDED] },
    graph: sequence([
      wait(2),
      email(
        "Adding funds to start your first campaign",
        "{{account.name|Your brand}} is set up on Hypedrive. The next step is adding funds to your wallet, which you can do by UPI or a bank transfer to your virtual account.\n\nIf you'd like to know how much to start with, tell me your monthly orders and I'll suggest a size.",
      ),
      wait(3),
      task(
        "Call {{account.name}} about their first top-up",
        "Verified and still no top-up after five days. Share the UPI link and virtual account details, and ask what's holding them back.",
      ),
    ]),
  },
  {
    key: "dormant-win-back",
    name: "Dormant brand win-back",
    description:
      "For brands whose campaigns have all ended and nothing new has started: an email, a short follow-up after four days and a call task after eight.",
    subjectKind: "account",
    trigger: { kind: "stall_started", ruleIds: ["renewal_due"] },
    settings: DEFAULT_SETTINGS,
    graph: sequence([
      email(
        "What's next for {{account.name|your brand}}?",
        "Your last campaign on Hypedrive has wrapped up. If it went well, the next one is usually easier to plan: new products, another marketplace, or more slots on what sold out.\n\nWant me to send a few suggestions based on your last results?",
      ),
      wait(4),
      email(
        "Closing the loop",
        "A short follow-up on my last note. If you're planning another campaign, reply and I'll help you set it up. If not, no problem, and I won't keep writing.",
      ),
      wait(4),
      task(
        "Win-back call: {{account.name}}",
        "Last campaign ended and two emails got no reply. Share the results, then pitch the next campaign.",
      ),
    ]),
  },
];

export const TEMPLATE = Object.fromEntries(
  TEMPLATES.map((template) => [template.key, template]),
) as Record<string, AutomationTemplate>;
