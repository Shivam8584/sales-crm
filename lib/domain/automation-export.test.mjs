import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "./automations.ts";
import { buildAutomationExport, exportFileName } from "./automation-export.ts";

const MEMBER_ID = "jx7c2memberidabcdef";
const OTHER_AUTOMATION_ID = "k17c2automationidxyz";

const node = (id, kind, config = {}, extra = {}) => ({
  id,
  kind,
  x: 0,
  y: 0,
  config,
  ...extra,
});

const source = {
  name: "Welcome, “new” leads",
  description: "Warm up\nevery new lead",
  subjectKind: "lead",
  trigger: { kind: "lead_created", leadSources: ["web"] },
  settings: {
    ...DEFAULT_SETTINGS,
    goal: [{ field: "owner", op: "is", value: [MEMBER_ID] }],
    senderName: "Asha at Acme",
    replyTo: "asha@acme.com",
  },
  graph: {
    nodes: [
      node(
        "c",
        "wait",
        { mode: "duration", amount: 2, unit: "days" },
        { y: 300 },
      ),
      node(
        "b",
        "send_email",
        {
          subject: "=Hello {{person.firstName|there}}",
          body: 'Hi {{person.firstName|there}},\n\nQuick "question", {{owner.firstName}}',
          purpose: "sales_outreach",
        },
        { y: 200, title: "Intro, v1" },
      ),
      node("a", "trigger", {}, { y: 0 }),
      node(
        "d",
        "condition",
        {
          match: "all",
          conditions: [{ field: "owner", op: "is", value: [MEMBER_ID] }],
        },
        { y: 400 },
      ),
      node(
        "e",
        "create_task",
        {
          title: "Call {{record.name}}",
          assignee: "member",
          memberId: MEMBER_ID,
          dueInDays: 1,
          priority: "high",
        },
        { y: 500 },
      ),
      node(
        "f",
        "automation",
        { action: "add", automationId: OTHER_AUTOMATION_ID },
        { y: 600 },
      ),
      node("g", "exit", { reason: "Not interested" }, { y: 700 }),
    ],
    edges: [
      { id: "e5", source: "d", port: "no", target: "g" },
      { id: "e1", source: "a", port: "out", target: "b" },
      { id: "e4", source: "d", port: "yes", target: "e" },
      { id: "e2", source: "b", port: "out", target: "c" },
      { id: "e3", source: "c", port: "out", target: "d" },
      { id: "e6", source: "e", port: "out", target: "f" },
    ],
  },
};

const names = {
  member: (id) => (id === MEMBER_ID ? "Priya Shah" : undefined),
  automation: (id) => (id === OTHER_AUTOMATION_ID ? "Nurture" : undefined),
};

const options = {
  exportedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
  includeRules: true,
  names,
  describeCondition: (item) => `${item.field} ${item.op} ${item.value}`,
};

const build = (format, extra = {}) =>
  buildAutomationExport(format, source, { ...options, ...extra });

test("json has the documented shape and no ids", () => {
  const text = build("json");
  const json = JSON.parse(text);
  assert.deepEqual(Object.keys(json), [
    "app",
    "format",
    "exportedAt",
    "automation",
  ]);
  assert.equal(json.app, "hypedrive-crm");
  assert.equal(json.format, 1);
  assert.equal(json.exportedAt, "2026-01-02T03:04:05.000Z");
  assert.deepEqual(Object.keys(json.automation), [
    "name",
    "description",
    "subjectKind",
    "trigger",
    "settings",
    "graph",
  ]);
  assert.equal(text.includes(MEMBER_ID), false);
  assert.equal(text.includes(OTHER_AUTOMATION_ID), false);
  const tasks = json.automation.graph.nodes.find(
    (item) => item.kind === "create_task",
  );
  assert.equal(tasks.config.memberName, "Priya Shah");
  assert.equal("memberId" in tasks.config, false);
  const link = json.automation.graph.nodes.find(
    (item) => item.kind === "automation",
  );
  assert.equal(link.config.automationName, "Nurture");
  assert.deepEqual(json.automation.settings.goal, [
    { field: "owner", op: "is", value: ["Priya Shah"] },
  ]);
  assert.equal(json.automation.settings.replyTo, "asha@acme.com");
  assert.equal("runLog" in json, false);
});

test("json lists steps in flow order, edges by step then port, with stable bytes", () => {
  const json = JSON.parse(build("json"));
  assert.deepEqual(
    json.automation.graph.nodes.map((item) => item.id),
    ["a", "b", "c", "d", "e", "g", "f"],
  );
  assert.deepEqual(
    json.automation.graph.edges.map((item) => `${item.source}.${item.port}`),
    ["a.out", "b.out", "c.out", "d.yes", "d.no", "e.out"],
  );
  assert.deepEqual(Object.keys(json.automation.graph.edges[0]), [
    "source",
    "port",
    "target",
  ]);
  const reordered = {
    ...source,
    graph: {
      nodes: [...source.graph.nodes].reverse(),
      edges: [...source.graph.edges].reverse(),
    },
  };
  assert.equal(
    buildAutomationExport("json", reordered, options),
    build("json"),
  );
});

test("json without rules drops the trigger filters, settings and conditions", () => {
  const json = JSON.parse(build("json", { includeRules: false }));
  assert.deepEqual(json.automation.trigger, { kind: "lead_created" });
  assert.equal("settings" in json.automation, false);
  const condition = json.automation.graph.nodes.find(
    (item) => item.kind === "condition",
  );
  assert.deepEqual(condition.config.conditions, []);
});

test("the run log is last, oldest first and capped at 100", () => {
  const logs = Array.from({ length: 130 }, (_, index) => ({
    at: 1_000_000 + index * 1000,
    level: "info",
    message: `line ${index}`,
  })).reverse();
  const json = JSON.parse(build("json", { logs }));
  assert.equal(json.runLog.length, 100);
  assert.equal(json.runLog[0].message, "line 30");
  assert.equal(json.runLog.at(-1).message, "line 129");
  assert.equal(Object.keys(json).at(-1), "runLog");
  const md = build("markdown", { logs });
  assert.match(md, /## Run log/);
  assert.match(md, /line 129$/);
  assert.equal(build("csv", { logs }), build("csv"));
});

test("csv has one row per step with escaped, formula-safe cells", () => {
  const rows = build("csv").split("\r\n");
  assert.equal(rows[0], "Step,Type,Title or subject,Wait or condition,Next");
  assert.equal(rows.length, 8);
  assert.match(rows[1], /^1,Trigger,/);
  assert.equal(rows[2], `2,Send email,"Intro, v1",,Step 3: Wait 2 days`);
  assert.equal(
    rows[3],
    "3,Wait,Wait 2 days,Wait 2 days,Step 4: Branch on 1 condition",
  );
  assert.equal(
    rows[4],
    `4,Condition,Branch on 1 condition,owner is ${MEMBER_ID},YES → Step 5: Call {{record.name}} | NO → Step 6: Not interested`,
  );
  assert.equal(rows[6], "6,Exit,Not interested,,Ends the run");
  const formula = buildAutomationExport(
    "csv",
    {
      ...source,
      graph: {
        nodes: [
          node("a", "trigger"),
          node("b", "send_email", {
            subject: "=1+1",
            body: "x",
            purpose: "sales_outreach",
          }),
        ],
        edges: [{ id: "e", source: "a", port: "out", target: "b" }],
      },
    },
    options,
  );
  assert.match(formula, /'=1\+1/);
});

test("markdown reads as a brief", () => {
  const md = build("markdown");
  assert.match(md, /^# Welcome, “new” leads\n\nWarm up\nevery new lead\n/);
  assert.match(md, /- \*\*Enrols:\*\* leads/);
  assert.match(md, /^1\. \*\*Trigger\*\* — /m);
  assert.match(md, /^2\. \*\*Send email\*\* — Intro, v1$/m);
  assert.match(md, /^   > Subject: =Hello \{\{person\.firstName\|there\}\}$/m);
  assert.match(md, /^   > Hi \{\{person\.firstName\|there\}\},$/m);
  assert.match(md, /^3\. \*\*Wait\*\* — Wait 2 days$/m);
  assert.match(md, /Assigned to Priya Shah, due in 1 days, high priority/);
  assert.match(md, /- If yes: step 5, Call \{\{record\.name\}\}/);
  assert.match(md, /- If no: step 6, Not interested/);
  assert.match(md, /Add to Nurture/);
  assert.match(md, /## Goal and exit conditions/);
  assert.match(md, /- \*\*Daily send cap:\*\* 50/);
  assert.match(md, /- \*\*Reply-to:\*\* asha@acme\.com/);
  const bare = build("markdown", { includeRules: false });
  assert.doesNotMatch(bare, /Goal and exit conditions|Checks:|Reply-to/);
  assert.match(bare, /Starts when:\*\* /);
});

test("file names are slugs of the sequence name", () => {
  assert.equal(
    exportFileName("Welcome, “new” leads!", "json"),
    "welcome-new-leads.json",
  );
  assert.equal(exportFileName("  ", "csv"), "sequence.csv");
  assert.equal(exportFileName("../../etc/passwd", "markdown"), "etc-passwd.md");
  assert.equal(exportFileName("Résumé Ünïcode", "json"), "résumé-ünïcode.json");
});
