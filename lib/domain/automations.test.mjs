import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SETTINGS,
  checkSender,
  frequencyHoldUntil,
  htmlToText,
  nodeFunnel,
  parseAddress,
  parseChatwoot,
  parseTimestamp,
  stepOrder,
  stripQuoted,
  templateIssues,
  templateTokens,
  checkGraphShape,
  consentKey,
  evaluateConditions,
  goalMet,
  istClock,
  istDay,
  matchesTrigger,
  nextWeekdayTime,
  portsOf,
  renderTemplate,
  sendWindow,
  simulate,
  VARIABLES,
  validateAutomation,
  waitTimeout,
  waitUntil,
} from "./automations.ts";
import {
  TEMPLATES,
  templateIn,
} from "../../convex/lib/automations/templates.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Epoch ms for a wall-clock time in India (UTC+5:30). */
const ist = (y, m, d, h = 0, min = 0) =>
  Date.UTC(y, m - 1, d, h, min) - 330 * MIN;

const node = (id, kind, config = {}) => ({ id, kind, x: 0, y: 0, config });
const edge = (source, port, target) => ({
  id: `${source}-${port}-${target}`,
  source,
  port,
  target,
});
const draft = (nodes, edges, extra = {}) => ({
  subjectKind: "lead",
  trigger: { kind: "lead_created" },
  graph: { nodes, edges },
  settings: DEFAULT_SETTINGS,
  ...extra,
});
const email = {
  subject: "Hi {{first_name}}",
  body: "Hello from {{owner_first_name}}",
  purpose: "sales_outreach",
};

test("every template is a valid, activatable automation", () => {
  assert.equal(TEMPLATES.length, 7);
  for (const template of TEMPLATES) {
    assert.equal(checkGraphShape(template.graph), null, template.name);
    assert.deepEqual(validateAutomation(template), [], template.name);
  }
});

const emails = (graph) =>
  graph.nodes.filter((node) => node.kind === "send_email").map((n) => n.config);
const EXAMPLES = Object.fromEntries(
  VARIABLES.map((item) => [item.key, item.example]),
);
const names = (text) => templateTokens(text).map((token) => token.name);
const LANGUAGE_PLAN = {
  "new-lead-follow-up": ["en", "hinglish", "hi"],
  "demo-no-show": ["en", "hinglish", "hi"],
  "gst-failed": ["en", "hinglish"],
  "signup-no-org": ["en", "hinglish"],
  "no-first-top-up": ["en", "hinglish"],
  "dormant-win-back": ["en", "hinglish"],
  "first-result-check-in": ["en", "hinglish"],
};

test("templates come in the planned languages", () => {
  for (const template of TEMPLATES) {
    const languages = ["en", ...Object.keys(template.variants)];
    assert.deepEqual(languages, LANGUAGE_PLAN[template.key], template.key);
  }
});

test("every template in every language validates and reads cleanly", () => {
  for (const template of TEMPLATES) {
    const english = emails(template.graph);
    for (const language of LANGUAGE_PLAN[template.key]) {
      const copy = templateIn(template, language);
      const label = `${template.key}/${language}`;
      const draft = { ...template, graph: copy.graph };
      assert.equal(checkGraphShape(copy.graph), null, label);
      assert.deepEqual(validateAutomation(draft), [], label);
      assert.equal(copy.language, language, label);
      assert.equal(copy.description, copy.description.normalize("NFC"), label);
      assert.deepEqual(
        copy.graph.nodes.map((node) => [node.id, node.kind]),
        template.graph.nodes.map((node) => [node.id, node.kind]),
        label,
      );
      const local = emails(copy.graph);
      assert.equal(local.length, english.length, label);
      local.forEach((mail, index) => {
        assert.ok(mail.subject.length <= 70, `${label} subject too long`);
        assert.doesNotMatch(
          `${mail.subject}${mail.body}`,
          /\p{Extended_Pictographic}/u,
          label,
        );
        for (const text of [mail.subject, mail.body]) {
          const rendered = renderTemplate(text, EXAMPLES);
          assert.equal(text, text.normalize("NFC"), label);
          assert.deepEqual(rendered.missing, [], label);
          assert.doesNotMatch(rendered.text, /[{}]/, label);
        }
        assert.deepEqual(
          names(mail.body).sort(),
          names(english[index].body).sort(),
          `${label} body placeholders`,
        );
        assert.ok(
          names(mail.subject).every((name) =>
            names(english[index].subject).includes(name),
          ),
          `${label} subject placeholders`,
        );
        assert.equal(mail.purpose, english[index].purpose, label);
      });
    }
  }
});

test("a language a template lacks falls back to English", () => {
  const gst = TEMPLATES.find((item) => item.key === "gst-failed");
  assert.equal(templateIn(gst, "hi").language, "en");
  assert.equal(templateIn(gst, undefined).graph, gst.graph);
  assert.equal(templateIn(gst, "hinglish").language, "hinglish");
});

test("Devanagari copy is Devanagari where it should be", () => {
  const lead = TEMPLATES.find((item) => item.key === "new-lead-follow-up");
  for (const mail of emails(templateIn(lead, "hi").graph)) {
    assert.match(mail.subject + mail.body, /[\u0900-\u097F]/u);
    assert.match(mail.body, /^नमस्ते /);
  }
});

test("graph validation catches structure problems", () => {
  const ok = draft(
    [node("t", "trigger"), node("e", "send_email", email)],
    [edge("t", "out", "e")],
  );
  assert.deepEqual(validateAutomation(ok), []);

  const orphan = draft(
    [node("t", "trigger"), node("e", "send_email", email), node("x", "exit")],
    [edge("t", "out", "e")],
  );
  assert.ok(
    validateAutomation(orphan).some(
      (issue) => issue.nodeId === "x" && /Not connected/.test(issue.message),
    ),
  );

  const loop = draft(
    [
      node("t", "trigger"),
      node("a", "wait", { mode: "duration", amount: 1, unit: "days" }),
      node("b", "wait", { mode: "duration", amount: 1, unit: "days" }),
    ],
    [edge("t", "out", "a"), edge("a", "out", "b"), edge("b", "out", "a")],
  );
  assert.ok(validateAutomation(loop).some((i) => /loop/.test(i.message)));

  const badPort = draft(
    [node("t", "trigger"), node("e", "send_email", email)],
    [edge("t", "yes", "e")],
  );
  assert.ok(validateAutomation(badPort).some((i) => /path/.test(i.message)));

  const noTrigger = draft([node("e", "send_email", email)], []);
  assert.ok(
    validateAutomation(noTrigger).some((i) =>
      /exactly one trigger/.test(i.message),
    ),
  );
  assert.equal(checkGraphShape(noTrigger.graph), "Keep exactly one trigger");

  const empty = draft([node("t", "trigger")], []);
  assert.ok(
    validateAutomation(empty).some((i) => /first step/.test(i.message)),
  );
});

test("validation checks step settings and the trigger's records", () => {
  const issues = validateAutomation(
    draft(
      [
        node("t", "trigger"),
        node("e", "send_email", { ...email, body: "Hi {{nickname}}" }),
        node("w", "send_whatsapp", {
          template: "Bad Name",
          language: "en",
          params: [""],
          purpose: "sales_outreach",
        }),
      ],
      [edge("t", "out", "e"), edge("e", "out", "w")],
    ),
  );
  assert.ok(issues.some((i) => i.nodeId === "e" && /nickname/.test(i.message)));
  assert.ok(issues.some((i) => i.nodeId === "w" && i.field === "template"));
  assert.ok(issues.some((i) => i.nodeId === "w" && i.field === "params"));

  const wrongSubject = validateAutomation(
    draft([node("t", "trigger"), node("x", "exit")], [edge("t", "out", "x")], {
      subjectKind: "deal",
    }),
  );
  assert.ok(wrongSubject.some((i) => i.field === "subjectKind"));

  const unknownEvent = validateAutomation(
    draft([node("t", "trigger"), node("x", "exit")], [edge("t", "out", "x")], {
      subjectKind: "account",
      trigger: { kind: "platform_event", eventTypes: ["made.up"] },
    }),
  );
  assert.ok(unknownEvent.some((i) => /Unknown platform event/.test(i.message)));
});

test("event waits branch into met and timeout", () => {
  assert.deepEqual(portsOf(node("w", "wait", { mode: "event" })), [
    "met",
    "timeout",
  ]);
  assert.deepEqual(portsOf(node("c", "condition")), ["yes", "no"]);
  assert.deepEqual(portsOf(node("x", "exit")), []);
});

test("conditions branch on all or any", () => {
  const facts = {
    "lead.status": "contacted",
    "account.tags": ["D2C", "Skincare"],
    "deal.amount": 50_000,
    "consent.email": true,
    "platform.event": ["organization.created"],
    "platform.stage": "funded",
  };
  const all = (conditions) =>
    evaluateConditions({ match: "all", conditions }, facts);
  assert.equal(
    all([{ field: "lead.status", op: "is", value: ["new", "contacted"] }]),
    true,
  );
  assert.equal(
    all([{ field: "lead.status", op: "is_not", value: ["contacted"] }]),
    false,
  );
  assert.equal(
    all([{ field: "account.tags", op: "has", value: ["skincare"] }]),
    true,
  );
  assert.equal(
    all([{ field: "deal.amount", op: "gt", value: ["10000"] }]),
    true,
  );
  assert.equal(
    all([{ field: "deal.amount", op: "lt", value: ["10000"] }]),
    false,
  );
  assert.equal(all([{ field: "consent.email", op: "is_true" }]), true);
  assert.equal(all([{ field: "consent.whatsapp", op: "is_true" }]), false);
  assert.equal(
    all([
      {
        field: "platform.event",
        op: "not_happened",
        value: ["wallet.topup_succeeded", "wallet.deposit_received"],
      },
    ]),
    true,
  );
  assert.equal(
    all([{ field: "platform.stage", op: "reached", value: ["org_created"] }]),
    true,
  );
  assert.equal(
    all([{ field: "platform.stage", op: "reached", value: ["live"] }]),
    false,
  );

  const mixed = [
    { field: "lead.status", op: "is", value: ["new"] },
    { field: "consent.email", op: "is_true" },
  ];
  assert.equal(
    evaluateConditions({ match: "all", conditions: mixed }, facts),
    false,
  );
  assert.equal(
    evaluateConditions({ match: "any", conditions: mixed }, facts),
    true,
  );
  assert.equal(goalMet([], facts), false);
  assert.equal(goalMet([mixed[1]], facts), true);
});

test("triggers match on kind and filters", () => {
  const event = {
    kind: "lead_created",
    refs: { leadId: "l1" },
    value: "demo",
    source: "website",
    at: 0,
  };
  assert.equal(matchesTrigger({ kind: "lead_created" }, event), true);
  assert.equal(
    matchesTrigger({ kind: "lead_created", leadKinds: ["demo"] }, event),
    true,
  );
  assert.equal(
    matchesTrigger({ kind: "lead_created", leadKinds: ["contact"] }, event),
    false,
  );
  assert.equal(
    matchesTrigger({ kind: "lead_created", leadSources: ["calcom"] }, event),
    false,
  );
  assert.equal(matchesTrigger({ kind: "lead_status_changed" }, event), false);

  const paused = {
    kind: "platform_event",
    refs: { accountId: "a1" },
    value: "campaign.status_changed",
    campaignStatus: "paused",
    pauseReason: "insufficient_funds",
    at: 0,
  };
  const rescue = {
    kind: "platform_event",
    eventTypes: ["campaign.status_changed"],
    campaignStatuses: ["paused"],
    pauseReasons: ["insufficient_funds"],
  };
  assert.equal(matchesTrigger(rescue, paused), true);
  assert.equal(
    matchesTrigger(rescue, { ...paused, pauseReason: "brand_paused" }),
    false,
  );
  assert.equal(
    matchesTrigger(rescue, { ...paused, campaignStatus: "ended" }),
    false,
  );
});

test("India time helpers", () => {
  const at = ist(2026, 10, 21, 8, 30);
  assert.equal(istClock(at).minutes, 8 * 60 + 30);
  assert.equal(istClock(at).weekday, 3);
  assert.equal(istClock(at).dayStart, ist(2026, 10, 21));
  assert.equal(istDay(ist(2026, 10, 21, 23, 59)), "2026-10-21");
  assert.equal(istDay(ist(2026, 10, 22, 0, 1)), "2026-10-22");
});

test("quiet hours hold messages to 9:00–20:00 India time", () => {
  assert.equal(sendWindow(ist(2026, 10, 21, 10)), ist(2026, 10, 21, 10));
  assert.equal(sendWindow(ist(2026, 10, 21, 7, 15)), ist(2026, 10, 21, 9));
  assert.equal(sendWindow(ist(2026, 10, 21, 20)), ist(2026, 10, 22, 9));
  assert.equal(sendWindow(ist(2026, 10, 21, 23, 30)), ist(2026, 10, 22, 9));
  assert.equal(
    sendWindow(ist(2026, 10, 21, 19, 59)),
    ist(2026, 10, 21, 19, 59),
  );
});

test("waits: duration, weekday-time and event timeout", () => {
  const now = ist(2026, 10, 21, 11);
  assert.equal(
    waitUntil({ mode: "duration", amount: 2, unit: "days" }, now),
    now + 2 * DAY,
  );
  assert.equal(
    waitUntil({ mode: "duration", amount: 5, unit: "minutes" }, now),
    now + 5 * MIN,
  );
  assert.equal(waitUntil({ mode: "event" }, now), null);
  assert.equal(
    waitTimeout({ mode: "event", timeoutAmount: 3, timeoutUnit: "hours" }, now),
    now + 3 * HOUR,
  );
  // Wednesday 11:00 → same day 15:00, next Monday 10:00, and Thursday 10:00 for weekdays.
  assert.equal(nextWeekdayTime(now, [3], "15:00"), ist(2026, 10, 21, 15));
  assert.equal(nextWeekdayTime(now, [1], "10:00"), ist(2026, 10, 26, 10));
  assert.equal(
    waitUntil({ mode: "until", days: [1, 2, 3, 4, 5], time: "10:00" }, now),
    ist(2026, 10, 22, 10),
  );
  // Friday 18:00 → Monday 10:00 for weekdays only.
  assert.equal(
    nextWeekdayTime(ist(2026, 10, 23, 18), [1, 2, 3, 4, 5], "10:00"),
    ist(2026, 10, 26, 10),
  );
  assert.equal(nextWeekdayTime(now, [3], "11:00"), ist(2026, 10, 28, 11));
});

test("templates fill variables and report missing ones", () => {
  assert.deepEqual(
    renderTemplate("Hi {{ first_name }}, from {{company}}", {
      first_name: "Asha",
      company: "Kesar",
    }),
    {
      text: "Hi Asha, from Kesar",
      missing: [],
    },
  );
  assert.deepEqual(renderTemplate("Hi {{first_name}}", {}), {
    text: "Hi ",
    missing: ["first_name"],
  });
});

const demo = TEMPLATES.find((item) => item.key === "new-lead-follow-up");
const allowAll = {
  [consentKey("email", "sales_outreach")]: {
    allowed: true,
    message: "Consent",
  },
  [consentKey("whatsapp", "sales_outreach")]: {
    allowed: true,
    message: "Consent",
  },
};

test("dry run walks a sequence and applies quiet hours", () => {
  const now = ist(2026, 10, 21, 22);
  const steps = simulate({
    draft: demo,
    facts: { "lead.status": "new" },
    consent: allowAll,
    vars: {
      "person.firstName": "Asha",
      "owner.firstName": "Shivam",
      "account.name": "Kesar",
      "record.name": "Asha",
    },
    now,
  });
  assert.deepEqual(
    steps.map((step) => step.nodeId),
    ["trigger", "step-1", "step-2", "step-3", "step-4", "step-5"],
  );
  const send = steps[1];
  assert.equal(send.outcome, "done");
  assert.equal(send.at, ist(2026, 10, 22, 9));
  assert.match(send.message, /quiet hours/);
  assert.equal(steps[2].at, ist(2026, 10, 23, 9));
  assert.equal(steps[4].at, ist(2026, 10, 25, 9));
});

test("dry run skips outbound steps without consent and exits on goal", () => {
  const steps = simulate({
    draft: demo,
    facts: { "lead.status": "new" },
    consent: {
      [consentKey("email", "sales_outreach")]: {
        allowed: false,
        message: "They withdrew consent for email",
      },
    },
    vars: {},
    now: ist(2026, 10, 21, 11),
  });
  assert.equal(steps[1].outcome, "skipped");
  assert.match(steps[1].message, /withdrew/);
  assert.equal(steps[3].outcome, "skipped");

  const converted = simulate({
    draft: demo,
    facts: { "lead.status": "converted" },
    consent: allowAll,
    vars: {},
    now: 0,
  });
  assert.equal(converted.length, 1);
  assert.equal(converted[0].outcome, "exited");
});

test("templates use fallbacks, aliases and flag variables a record can't have", () => {
  assert.deepEqual(
    renderTemplate("Hi {{person.firstName|there}} at {{ account.name }}", {
      "account.name": "Kesar",
    }),
    { text: "Hi there at Kesar", missing: [] },
  );
  assert.deepEqual(renderTemplate("A{{prospect.note|}}B", {}), {
    text: "AB",
    missing: [],
  });
  assert.deepEqual(
    renderTemplate("{{first_name}} / {{prospect.talkingPoint}}", {
      "person.firstName": "Asha",
    }),
    { text: "Asha / ", missing: ["prospect.talkingPoint"] },
  );
  assert.deepEqual(templateIssues("{{deal.title}} {{lead.source}}", "deal"), [
    "{{lead.source}} is always empty for deals",
  ]);
  assert.deepEqual(templateIssues("{{prospect.anything}} {{nope}}", "lead"), [
    "Unknown variable {{nope}}",
  ]);
  assert.deepEqual(templateIssues("Template {{1}} stays literal", "lead"), []);
});

test("activation is blocked by variables the record kind can't fill", () => {
  const issues = validateAutomation(
    draft(
      [
        node("trigger", "trigger"),
        node("mail", "send_email", {
          subject: "About {{deal.title}}",
          body: "Hi",
          purpose: "sales_outreach",
        }),
      ],
      [edge("trigger", "out", "mail")],
    ),
  );
  assert.ok(
    issues.some((issue) => /always empty for leads/.test(issue.message)),
  );
});

test("dry run skips a message whose variables are empty", () => {
  const steps = simulate({
    draft: draft(
      [
        node("trigger", "trigger"),
        node("mail", "send_email", {
          subject: "Hello",
          body: "About {{prospect.talkingPoint}}",
          purpose: "sales_outreach",
        }),
      ],
      [edge("trigger", "out", "mail")],
    ),
    facts: {},
    consent: allowAll,
    vars: {},
    now: ist(2026, 10, 21, 11),
  });
  assert.equal(steps[1].outcome, "skipped");
  assert.match(steps[1].message, /prospect\.talkingPoint/);
});

test("reply trigger filters on channel", () => {
  const trigger = { kind: "reply_received", channels: ["email"] };
  const event = (value) => ({
    kind: "reply_received",
    refs: { personId: "p" },
    value,
    at: 0,
  });
  assert.equal(matchesTrigger(trigger, event("email")), true);
  assert.equal(matchesTrigger(trigger, event("whatsapp")), false);
  assert.equal(
    matchesTrigger({ kind: "reply_received" }, event("whatsapp")),
    true,
  );
});

test("frequency cap holds until the oldest message in the window ages out", () => {
  const now = 100 * DAY;
  assert.equal(frequencyHoldUntil([now - DAY, now - 2 * DAY], now, 3), null);
  assert.equal(
    frequencyHoldUntil([now - DAY, now - 2 * DAY, now - 3 * DAY], now, 3),
    now - 3 * DAY + 7 * DAY,
  );
  assert.equal(
    frequencyHoldUntil([now - 8 * DAY, now - DAY, now - 2 * DAY], now, 3),
    null,
  );
  assert.equal(
    frequencyHoldUntil([now - DAY, now - 2 * DAY, now - 3 * DAY], now, 2),
    now - 2 * DAY + 7 * DAY,
  );
});

test("funnel counts reached, passed, current and ended per step", () => {
  const stats = nodeFunnel([
    {
      status: "completed",
      currentNodeId: "b",
      history: [
        { nodeId: "a", outcome: "out", at: 1 },
        { nodeId: "b", outcome: "skipped", at: 2 },
        { nodeId: "b", outcome: "completed", at: 3 },
      ],
    },
    {
      status: "waiting",
      currentNodeId: "b",
      history: [{ nodeId: "a", outcome: "out", at: 4 }],
    },
    {
      status: "exited",
      currentNodeId: "a",
      history: [{ nodeId: "a", outcome: "exited", at: 5 }],
    },
  ]);
  assert.equal(stats.a.reached, 3);
  assert.equal(stats.a.passed, 2);
  assert.equal(stats.a.ended, 1);
  assert.equal(stats.b.reached, 2);
  assert.equal(stats.b.passed, 1);
  assert.equal(stats.b.skipped, 1);
  assert.equal(stats.b.current, 1);
  assert.equal(stats.b.ended, 0);
  assert.equal(stats.b.lastAt, 3);
});

test("step order walks from the trigger", () => {
  assert.deepEqual(
    stepOrder({
      nodes: [
        { ...node("x", "exit"), y: 0 },
        node("c", "condition"),
        node("trigger", "trigger"),
        node("no", "exit"),
        node("yes", "exit"),
      ],
      edges: [
        edge("trigger", "out", "c"),
        edge("c", "no", "no"),
        edge("c", "yes", "yes"),
      ],
    }),
    ["trigger", "c", "yes", "no", "x"],
  );
});

test("inbound helpers read addresses, times and the new part of a reply", () => {
  assert.deepEqual(parseAddress("Asha Menon <Asha@Kesar.in>"), {
    email: "asha@kesar.in",
    name: "Asha Menon",
  });
  assert.deepEqual(parseAddress({ email: "a@b.in" }), {
    email: "a@b.in",
    name: null,
  });
  assert.equal(
    stripQuoted("Sounds good, Tuesday works.\n\nOn Mon, Shivam wrote:\n> Hi"),
    "Sounds good, Tuesday works.",
  );
  assert.equal(stripQuoted("> only quoted"), "> only quoted");
  assert.equal(
    htmlToText("<p>Hi&nbsp;there</p><p>Thanks</p>"),
    "Hi there\nThanks",
  );
  assert.equal(parseTimestamp(1700000000), 1700000000000);
  assert.equal(
    parseTimestamp("2020-03-03 13:05:57 UTC"),
    Date.UTC(2020, 2, 3, 13, 5, 57),
  );
  assert.equal(parseTimestamp("nope"), null);
});

test("chatwoot webhooks yield incoming email and WhatsApp messages only", () => {
  const base = {
    event: "message_created",
    id: 42,
    content: "Yes please call",
    message_type: "incoming",
    created_at: 1700000000,
    sender: { name: "Asha", phone_number: "+919820012345", type: "contact" },
    conversation: {
      display_id: 7,
      channel: "Channel::Whatsapp",
      custom_attributes: { hd_org_id: "org_1" },
    },
  };
  const parsed = parseChatwoot(base);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.message, {
    id: "42",
    channel: "whatsapp",
    content: "Yes please call",
    at: 1700000000000,
    email: null,
    phone: "+919820012345",
    name: "Asha",
    conversationId: "7",
    orgId: "org_1",
  });
  assert.equal(parseChatwoot({ ...base, message_type: "outgoing" }).ok, false);
  assert.equal(parseChatwoot({ ...base, private: true }).ok, false);
  assert.equal(
    parseChatwoot({ ...base, event: "conversation_created" }).ok,
    false,
  );
  assert.equal(
    parseChatwoot({
      ...base,
      conversation: { channel: "Channel::WebWidget" },
    }).ok,
    false,
  );
});

test("sender details are trimmed, normalised and refused when unsafe", () => {
  assert.deepEqual(checkSender({}), { ok: true });
  assert.deepEqual(checkSender({ senderName: "  ", replyTo: "" }), {
    ok: true,
  });
  assert.deepEqual(
    checkSender({ senderName: " Asha at Acme ", replyTo: " Asha@Acme.com " }),
    { ok: true, senderName: "Asha at Acme", replyTo: "asha@acme.com" },
  );
  for (const senderName of [
    "a\nb",
    "a\rb",
    'a"b',
    "a<b",
    "a>b",
    "a\\b",
    "a".repeat(61),
  ]) {
    assert.deepEqual(checkSender({ senderName }).field, "senderName");
  }
  assert.equal(checkSender({ senderName: "a".repeat(60) }).ok, true);
  for (const replyTo of [
    "a@b",
    "a@x.com,b@x.com",
    "Asha <a@x.com>",
    "a@x.com?cc=b",
  ]) {
    assert.equal(checkSender({ replyTo }).field, "replyTo");
  }
});
