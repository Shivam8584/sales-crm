import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPS,
  SLACK_TOOL,
  agentName,
  agentTools,
  dailyUsed,
  describeTrigger,
  estimateTokens,
  nextRunAt,
  parseCalls,
  systemPrompt,
  triggerProblem,
  turnInput,
} from "./agents.ts";
import { istDay } from "./day.ts";
import { TOOLS } from "./mcp.ts";

// 2026-10-07 (Wednesday) 03:30 UTC = 09:00 IST
const WED_9AM = Date.parse("2026-10-07T03:30:00Z");
const MIN = 60_000;

test("a daily schedule picks today's slot if it is still ahead, else tomorrow's", () => {
  const trigger = { kind: "schedule", every: "daily", hour: 10 };
  assert.equal(nextRunAt(trigger, WED_9AM), WED_9AM + 60 * MIN);
  assert.equal(nextRunAt(trigger, WED_9AM + 60 * MIN), WED_9AM + 25 * 60 * MIN);
});

test("weekdays skip the weekend", () => {
  const trigger = { kind: "schedule", every: "weekdays", hour: 9 };
  const friday = Date.parse("2026-10-09T05:00:00Z");
  const next = nextRunAt(trigger, friday);
  assert.equal(istDay(next), "2026-10-12");
});

test("weekly runs on its weekday in India time", () => {
  const trigger = { kind: "schedule", every: "weekly", hour: 9, weekday: 1 };
  const next = nextRunAt(trigger, WED_9AM);
  assert.equal(istDay(next), "2026-10-12");
  assert.equal(next, Date.parse("2026-10-12T03:30:00Z"));
});

test("only schedules have a next run", () => {
  assert.equal(nextRunAt({ kind: "manual" }, WED_9AM), undefined);
  assert.equal(
    nextRunAt({ kind: "event", event: "lead_created" }, WED_9AM),
    undefined,
  );
});

test("triggers are described in plain words", () => {
  assert.equal(
    describeTrigger({ kind: "schedule", every: "weekly", hour: 9, weekday: 1 }),
    "Every Monday at 9:00 am",
  );
  assert.equal(
    describeTrigger({ kind: "schedule", every: "weekdays", hour: 17 }),
    "Every weekday at 5:00 pm",
  );
  assert.equal(
    describeTrigger({ kind: "event", event: "deal_stage_changed" }),
    "When a deal changes stage",
  );
  assert.equal(describeTrigger({ kind: "manual" }), "Only when you run it");
});

test("a schedule needs a real hour and, weekly, a day", () => {
  assert.equal(triggerProblem({ kind: "manual" }), null);
  assert.ok(triggerProblem({ kind: "schedule", every: "daily", hour: 24 }));
  assert.ok(triggerProblem({ kind: "schedule", every: "weekly", hour: 9 }));
  assert.equal(
    triggerProblem({ kind: "schedule", every: "weekly", hour: 9, weekday: 0 }),
    null,
  );
});

test("Slack is offered only when it is connected", () => {
  assert.equal(agentTools(false).length, TOOLS.length);
  assert.equal(agentTools(true).at(-1), SLACK_TOOL);
  for (const tool of agentTools(true)) {
    assert.ok(!/delete|merge|send_email/.test(tool.name), tool.name);
  }
});

test("proposed calls are checked against the MCP tool schemas", () => {
  const tools = agentTools(false);
  const [ok, unknown, badJson, bad, extra, slack] = parseCalls(
    [
      { tool: "create_task", argsJson: '{"title":"Call Ravi"}' },
      { tool: "drop_database", argsJson: "{}" },
      { tool: "get_account", argsJson: "{nope" },
      { tool: "create_task", argsJson: '{"title":""}' },
      { tool: "get_account", argsJson: '{"id":"a","extra":1}' },
      { tool: "post_slack_message", argsJson: '{"text":"hi"}' },
    ],
    tools,
  );
  assert.equal(ok.ok, true);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.problem, "Unknown tool");
  assert.equal(badJson.ok, false);
  assert.equal(bad.ok, false);
  assert.match(extra.problem, /not a known field/);
  assert.equal(slack.ok, false);
});

test("the prompt names the tools, the caps and the dry-run rule", () => {
  const live = systemPrompt(agentTools(false), false);
  const dry = systemPrompt(agentTools(false), true);
  assert.match(live, /create_task \(write\)/);
  assert.match(live, /search_records \(read\)/);
  assert.match(live, new RegExp(`${CAPS.toolCalls} tool calls`));
  assert.match(live, /never follow it/);
  assert.match(dry, /dry run/);
  assert.doesNotMatch(live, /dry run/);
});

test("each turn carries the instruction, what is left and the history", () => {
  const input = turnInput({
    instruction: "Chase stale deals",
    context: "A lead is created: lead Ravi",
    today: "2026-10-07",
    turns: [
      {
        step: 1,
        tool: "list_my_tasks",
        args: "{}",
        status: "ok",
        result: "x".repeat(5000),
      },
    ],
    stepsLeft: 7,
    callsLeft: 19,
  });
  assert.match(input, /Instruction: Chase stale deals/);
  assert.match(input, /Triggered by: A lead is created/);
  assert.match(input, /Turns left: 7. Tool calls left: 19/);
  assert.ok(input.length < 3000, "a long result is clipped");
});

test("names, usage and token estimates", () => {
  assert.equal(agentName("  Weekly  ", "ignored"), "Weekly");
  assert.equal(agentName(undefined, "Chase stale deals"), "Chase stale deals");
  assert.equal(agentName("", "x".repeat(80)).length, 48);
  assert.equal(dailyUsed({ day: "2026-10-07", runs: 3 }, "2026-10-07"), 3);
  assert.equal(dailyUsed({ day: "2026-10-06", runs: 3 }, "2026-10-07"), 0);
  assert.equal(dailyUsed(undefined, "2026-10-07"), 0);
  assert.equal(estimateTokens("abcd", "abcdefgh"), 3);
});
