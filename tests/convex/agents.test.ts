/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fireAgentEvent } from "../../convex/lib/agents/queue";
import { CAPS, type AgentTrigger } from "../../lib/domain/agents";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
  type Actor,
  type T,
} from "./setup";

type Call = { tool: string; args?: Record<string, unknown> };
type Turn = { summary?: string; calls?: Call[] } | "fail";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A model that answers each turn from the script; the last turn repeats. */
function model(script: Turn[] | ((turn: number) => Turn)) {
  let turn = 0;
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    if (String(url).startsWith("https://hooks.slack.test")) {
      return new Response("ok");
    }
    const next =
      typeof script === "function"
        ? script(turn)
        : script[Math.min(turn, script.length - 1)];
    turn++;
    if (next === "fail") return new Response("nope", { status: 401 });
    const plan = {
      summary: next.summary ?? "Done",
      calls: (next.calls ?? []).map((call) => ({
        tool: call.tool,
        argsJson: JSON.stringify(call.args ?? {}),
      })),
    };
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(plan) }],
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const WEEKLY: AgentTrigger = {
  kind: "schedule",
  every: "weekly",
  hour: 9,
  weekday: 1,
};

async function setup() {
  const t = makeTest();
  const team = await seedTeam(t);
  const accountId = await newAccount(team.rep, "Kesar Threads");
  return { t, team, accountId };
}

function makeAgent(
  owner: Actor,
  fields: Partial<{
    instruction: string;
    trigger: AgentTrigger;
    scope: "own" | "team";
  }> = {},
) {
  return owner.as.mutation(api.agents.create, {
    instruction: "List my overdue tasks and chase them",
    trigger: { kind: "manual" },
    scope: "own",
    ...fields,
  });
}

async function runAgent(t: T, owner: Actor, id: Id<"agents">, preview = false) {
  const runId = await owner.as.mutation(api.agents.runNow, { id, preview });
  await t.action(internal.agents.execute, { runId });
  const run = await owner.as.query(api.agents.run, { id: runId });
  return run!;
}

const taskCount = (t: T) =>
  t.run(async (ctx) => (await ctx.db.query("tasks").collect()).length);

describe("creating agents", () => {
  it("needs an AI key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { team } = await setup();
    expect(await failureCode(makeAgent(team.rep))).toBe("unavailable");
  });

  it("keeps team scope for admins", async () => {
    const { team } = await setup();
    expect(await failureCode(makeAgent(team.rep, { scope: "team" }))).toBe(
      "forbidden",
    );
    expect(await failureCode(makeAgent(team.manager, { scope: "team" }))).toBe(
      "forbidden",
    );
    await makeAgent(team.admin, { scope: "team" });
  });

  it("rejects an empty instruction and a bad schedule", async () => {
    const { team } = await setup();
    expect(await failureCode(makeAgent(team.rep, { instruction: "  " }))).toBe(
      "invalid",
    );
    expect(
      await failureCode(
        makeAgent(team.rep, {
          trigger: { kind: "schedule", every: "daily", hour: 31 },
        }),
      ),
    ).toBe("invalid");
  });

  it("starts with changes off and schedules the next run", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep, { trigger: WEEKLY });
    const agent = await t.run((ctx) => ctx.db.get(id));
    expect(agent).toMatchObject({ allowChanges: false, enabled: true });
    expect(agent?.nextRunAt).toBeGreaterThan(Date.now());
  });

  it("are private to their owner", async () => {
    const { team } = await setup();
    const id = await makeAgent(team.rep);
    expect(await team.otherRep.as.query(api.agents.get, { id })).toBeNull();
    expect(
      await failureCode(
        team.otherRep.as.mutation(api.agents.update, {
          id,
          patch: { allowChanges: true },
        }),
      ),
    ).toBe("not_found");
  });
});

describe("running an agent", () => {
  it("reads, then makes a task as its owner, and the change can be undone", async () => {
    const { t, team, accountId } = await setup();
    const id = await makeAgent(team.rep);
    await team.rep.as.mutation(api.agents.update, {
      id,
      patch: { allowChanges: true },
    });
    const fetcher = model([
      { calls: [{ tool: "search_records", args: { query: "Kesar" } }] },
      {
        calls: [
          {
            tool: "create_task",
            args: { title: "Call Kesar", accountId },
          },
        ],
      },
      { summary: "Made one task", calls: [] },
    ]);

    const run = await runAgent(t, team.rep, id);

    expect(run.status).toBe("done");
    expect(run.summary).toBe("Made one task");
    expect(run.dryRun).toBe(false);
    expect(run.steps).toBe(3);
    expect(run.log.map((entry) => [entry.tool, entry.status])).toEqual([
      ["search_records", "ok"],
      ["create_task", "ok"],
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const task = await t.run(
      async (ctx) => (await ctx.db.query("tasks").collect())[0],
    );
    expect(task).toMatchObject({
      title: "Call Kesar",
      assigneeId: team.rep.id,
    });

    expect(run.changes).toHaveLength(1);
    expect(run.changes[0].undoable).toBe(true);
    await team.rep.as.mutation(api.tokens.undo, { id: run.changes[0]._id });
    expect(await taskCount(t)).toBe(0);
  });

  it("writes nothing in a preview, even with changes allowed", async () => {
    const { t, team, accountId } = await setup();
    const id = await makeAgent(team.rep);
    await team.rep.as.mutation(api.agents.update, {
      id,
      patch: { allowChanges: true },
    });
    model([
      {
        calls: [
          { tool: "create_task", args: { title: "Call Kesar", accountId } },
          {
            tool: "add_tag",
            args: { target: { type: "account", id: accountId }, tag: "hot" },
          },
        ],
      },
      { calls: [] },
    ]);

    const run = await runAgent(t, team.rep, id, true);

    expect(run.trigger).toBe("preview");
    expect(run.dryRun).toBe(true);
    expect(run.log.map((entry) => entry.status)).toEqual([
      "planned",
      "planned",
    ]);
    expect(run.changes).toHaveLength(0);
    expect(await taskCount(t)).toBe(0);
    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.tags).not.toContain("hot");
  });

  it("only plans while changes are off", async () => {
    const { t, team, accountId } = await setup();
    const id = await makeAgent(team.rep);
    model([
      { calls: [{ tool: "create_task", args: { title: "Call", accountId } }] },
      { calls: [] },
    ]);
    const run = await runAgent(t, team.rep, id);
    expect(run.dryRun).toBe(true);
    expect(run.log[0].status).toBe("planned");
    expect(await taskCount(t)).toBe(0);
  });

  it("does not repeat an identical write within a run", async () => {
    const { t, team, accountId } = await setup();
    const id = await makeAgent(team.rep);
    await team.rep.as.mutation(api.agents.update, {
      id,
      patch: { allowChanges: true },
    });
    const same = { tool: "create_task", args: { title: "Call", accountId } };
    model([{ calls: [same, same] }, { calls: [] }]);
    const run = await runAgent(t, team.rep, id);
    expect(run.log.map((entry) => entry.status)).toEqual(["ok", "error"]);
    expect(await taskCount(t)).toBe(1);
  });

  it("logs a bad proposal and carries on", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    let turn = 0;
    fetcher.mockImplementation(async () => {
      const calls =
        turn++ === 0
          ? [
              { tool: "delete_everything", argsJson: "{}" },
              { tool: "get_account", argsJson: "{nope" },
              { tool: "create_task", argsJson: JSON.stringify({ title: "" }) },
              {
                tool: "get_account",
                argsJson: JSON.stringify({ id: "x", extra: 1 }),
              },
            ]
          : [];
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ summary: "Nothing worked", calls }),
              },
            ],
          },
        ],
      });
    });
    const run = await runAgent(t, team.rep, id);
    expect(run.status).toBe("done");
    expect(run.log.map((entry) => entry.status)).toEqual([
      "error",
      "error",
      "error",
      "error",
    ]);
    expect(run.log[0].result).toBe("Unknown tool");
  });
});

describe("Slack", () => {
  const slackCalls = (fetcher: ReturnType<typeof model>) =>
    fetcher.mock.calls.filter(([url]) =>
      String(url).startsWith("https://hooks.slack.test"),
    );

  async function connected() {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/services/x");
    const ctx = await setup();
    await ctx.team.admin.as.mutation(api.slack.setRoute, {
      event: "agent_output",
      enabled: true,
    });
    const id = await makeAgent(ctx.team.rep);
    await ctx.team.rep.as.mutation(api.agents.update, {
      id,
      patch: { allowChanges: true },
    });
    return { ...ctx, id };
  }

  const post = {
    calls: [
      { tool: "post_slack_message", args: { text: "3 deals are stale" } },
    ],
  };

  it("posts through the integration when changes are allowed", async () => {
    const { t, team, id } = await connected();
    const fetcher = model([post, { calls: [] }]);
    const run = await runAgent(t, team.rep, id);
    expect(run.log.map((entry) => [entry.tool, entry.status])).toEqual([
      ["post_slack_message", "ok"],
    ]);
    const sent = slackCalls(fetcher);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(String(sent[0][1]?.body)).text).toBe("3 deals are stale");
  });

  it("only plans the post in a preview", async () => {
    const { t, team, id } = await connected();
    const fetcher = model([post, { calls: [] }]);
    const run = await runAgent(t, team.rep, id, true);
    expect(run.log[0].status).toBe("planned");
    expect(slackCalls(fetcher)).toHaveLength(0);
  });

  it("is not offered while Slack is not connected", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    model([post, { calls: [] }]);
    const run = await runAgent(t, team.rep, id);
    expect(run.log[0]).toMatchObject({
      status: "error",
      result: "Unknown tool",
    });
  });
});

describe("caps", () => {
  it("stops after the step limit", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    const fetcher = model((turn) => ({
      calls: [{ tool: "list_my_tasks", args: { limit: turn + 1 } }],
    }));
    const run = await runAgent(t, team.rep, id);
    expect(run.status).toBe("capped");
    expect(run.steps).toBe(CAPS.steps);
    expect(fetcher).toHaveBeenCalledTimes(CAPS.steps);
    expect(run.note).toContain(`${CAPS.steps} steps`);
  });

  it("stops after the tool-call limit", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    model((turn) => ({
      calls: Array.from({ length: CAPS.callsPerStep }, (_, i) => ({
        tool: "list_my_tasks",
        args: { limit: turn * CAPS.callsPerStep + i + 1 },
      })),
    }));
    const run = await runAgent(t, team.rep, id);
    expect(run.status).toBe("capped");
    expect(run.toolCalls).toBe(CAPS.toolCalls);
    expect(run.log).toHaveLength(CAPS.toolCalls);
    expect(run.note).toContain(`${CAPS.toolCalls} tool calls`);
  });

  it("stops when the estimated tokens run out", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    model(() => ({
      summary: "x".repeat(40_000),
      calls: [{ tool: "todays_summary", args: { n: 1 } }],
    }));
    const run = await runAgent(t, team.rep, id);
    expect(run.status).toBe("capped");
    expect(run.note).toBe("Reached the token budget");
  });

  it("limits runs per agent per day", async () => {
    const { team } = await setup();
    const id = await makeAgent(team.rep);
    await team.rep.as.mutation(api.agents.update, {
      id,
      patch: { dailyRuns: 1 },
    });
    model([{ calls: [] }]);
    const first = await team.rep.as.mutation(api.agents.runNow, {
      id,
      preview: true,
    });
    expect(first).toBeTruthy();
    expect(
      await failureCode(
        team.rep.as.mutation(api.agents.runNow, { id, preview: true }),
      ),
    ).toBe("conflict");
  });

  it("limits runs per day across the workspace", async () => {
    const { team } = await setup();
    const id = await makeAgent(team.rep);
    await team.admin.as.mutation(api.agents.setConfig, { dailyCap: 1 });
    await team.rep.as.mutation(api.agents.runNow, { id, preview: true });
    const second = await makeAgent(team.rep);
    expect(
      await failureCode(
        team.rep.as.mutation(api.agents.runNow, { id: second, preview: true }),
      ),
    ).toBe("conflict");
  });
});

describe("permissions", () => {
  it("keeps an own-scope agent off other people's records", async () => {
    const { t, team } = await setup();
    const theirs = await newAccount(team.otherRep, "Not Mine Ltd");
    const id = await makeAgent(team.rep);
    await team.rep.as.mutation(api.agents.update, {
      id,
      patch: { allowChanges: true },
    });
    model([
      {
        calls: [
          { tool: "get_account", args: { id: theirs } },
          {
            tool: "create_note",
            args: { target: { type: "account", id: theirs }, body: "hello" },
          },
        ],
      },
      { calls: [] },
    ]);
    const run = await runAgent(t, team.rep, id);
    expect(run.log.map((entry) => entry.status)).toEqual(["error", "error"]);
    expect(run.log[0].result).toContain("isn't yours");
    expect(run.changes).toHaveLength(0);
    const notes = await t.run(async (ctx) =>
      (await ctx.db.query("timeline").collect()).filter(
        (entry) => entry.kind === "note",
      ),
    );
    expect(notes).toHaveLength(0);
  });

  it("lets an admin's team-scope agent reach them", async () => {
    const { t, team } = await setup();
    const theirs = await newAccount(team.otherRep, "Not Mine Ltd");
    const id = await makeAgent(team.admin, { scope: "team" });
    model([
      { calls: [{ tool: "get_account", args: { id: theirs } }] },
      { calls: [] },
    ]);
    const run = await runAgent(t, team.admin, id);
    expect(run.log[0].status).toBe("ok");
  });

  it("fails a team agent whose owner is no longer an admin", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.admin, { scope: "team" });
    await t.run((ctx) => ctx.db.patch(team.admin.id, { role: "manager" }));
    model([{ calls: [] }]);
    expect(
      await failureCode(
        team.admin.as.mutation(api.agents.runNow, { id, preview: true }),
      ),
    ).toBe("conflict");
  });

  it("does not run for a deactivated owner", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    const runId = await team.rep.as.mutation(api.agents.runNow, {
      id,
      preview: true,
    });
    await t.run((ctx) => ctx.db.patch(team.rep.id, { status: "deactivated" }));
    const fetcher = model([{ calls: [] }]);
    await t.action(internal.agents.execute, { runId });
    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("failed");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("kill switch", () => {
  it("stops manual runs and skips scheduled ones", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep, { trigger: WEEKLY });
    await t.run((ctx) => ctx.db.patch(id, { nextRunAt: Date.now() - 1000 }));
    await team.admin.as.mutation(api.agents.setConfig, { enabled: false });

    expect(
      await failureCode(
        team.rep.as.mutation(api.agents.runNow, { id, preview: true }),
      ),
    ).toBe("conflict");

    await t.mutation(internal.agents.tick, {});
    const runs = await team.rep.as.query(api.agents.runs, { agentId: id });
    expect(runs.map((run) => run.status)).toEqual(["skipped"]);
    expect(runs[0].note).toBe("Agents are switched off");
    const agent = await t.run((ctx) => ctx.db.get(id));
    expect(agent?.nextRunAt).toBeGreaterThan(Date.now());
  });

  it("ends a queued run if the switch is flipped before it starts", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    const runId = await team.rep.as.mutation(api.agents.runNow, {
      id,
      preview: true,
    });
    await team.admin.as.mutation(api.agents.setConfig, { enabled: false });
    const fetcher = model([{ calls: [] }]);
    await t.action(internal.agents.execute, { runId });
    expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("is admin only", async () => {
    const { team } = await setup();
    expect(
      await failureCode(
        team.rep.as.mutation(api.agents.setConfig, { enabled: false }),
      ),
    ).toBe("forbidden");
  });
});

describe("triggers", () => {
  it("starts a due scheduled agent once and moves its next run on", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep, { trigger: WEEKLY });
    await t.run((ctx) => ctx.db.patch(id, { nextRunAt: Date.now() - 1000 }));
    await t.mutation(internal.agents.tick, {});
    await t.mutation(internal.agents.tick, {});
    const runs = await team.rep.as.query(api.agents.runs, { agentId: id });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ trigger: "schedule", status: "queued" });
  });

  it("ignores a turned-off agent", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep, { trigger: WEEKLY });
    await team.rep.as.mutation(api.agents.update, {
      id,
      patch: { enabled: false },
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.nextRunAt).toBeUndefined();
  });

  it("runs an event agent when its event fires, for its owner's records only", async () => {
    const { team } = await setup();
    const mine = await makeAgent(team.rep, {
      trigger: { kind: "event", event: "lead_created" },
    });
    const others = await makeAgent(team.otherRep, {
      trigger: { kind: "event", event: "lead_created" },
    });
    const other = await makeAgent(team.rep, {
      trigger: { kind: "event", event: "deal_stage_changed" },
    });
    await team.rep.as.mutation(api.leads.create, {
      name: "Ravi",
      companyName: "Kesar",
      email: "ravi@kesar.in",
    });
    const ofMine = await team.rep.as.query(api.agents.runs, { agentId: mine });
    expect(ofMine).toHaveLength(1);
    expect(ofMine[0].context).toContain("A lead is created: lead Ravi");
    expect(
      await team.otherRep.as.query(api.agents.runs, { agentId: others }),
    ).toHaveLength(0);
    expect(
      await team.rep.as.query(api.agents.runs, { agentId: other }),
    ).toHaveLength(0);
  });

  it("runs a reply agent for the person who replied", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep, {
      trigger: { kind: "event", event: "reply_received" },
    });
    const personId = await newPerson(team.rep, { firstName: "Ravi" });
    await t.run((ctx) => fireAgentEvent(ctx, "reply_received", { personId }));
    const runs = await team.rep.as.query(api.agents.runs, { agentId: id });
    expect(runs).toHaveLength(1);
    expect(runs[0].context).toContain("A reply arrives: person Ravi");
  });

  it("is queued by creating a lead", async () => {
    const { team } = await setup();
    const id = await makeAgent(team.admin, {
      scope: "team",
      trigger: { kind: "event", event: "lead_created" },
    });
    await team.rep.as.mutation(api.leads.create, {
      name: "Ravi Iyer",
      companyName: "Brandco",
      email: "ravi@brandco.in",
    } as never);
    const runs = await team.admin.as.query(api.agents.runs, { agentId: id });
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger).toBe("event");
  });
});

describe("failures", () => {
  it("fails the run and tells the owner when the model is down", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    model(["fail"]);
    const run = await runAgent(t, team.rep, id);
    expect(run.status).toBe("failed");
    expect(run.note).toContain("AI key");
    const notes = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      recipientId: team.rep.id,
      title: expect.stringContaining("failed"),
    });
    const agent = await t.run((ctx) => ctx.db.get(id));
    expect(agent?.lastStatus).toBe("failed");
  });

  it("ends a run that never reported back", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    const runId = await team.rep.as.mutation(api.agents.runNow, {
      id,
      preview: true,
    });
    await t.run((ctx) =>
      ctx.db.patch(runId, {
        status: "running",
        startedAt: Date.now() - 3_600_000,
      }),
    );
    await t.mutation(internal.agents.tick, {});
    expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("failed");
  });

  it("sweeps run logs after thirty days", async () => {
    const { t, team } = await setup();
    const id = await makeAgent(team.rep);
    const runId = await team.rep.as.mutation(api.agents.runNow, {
      id,
      preview: true,
    });
    await t.run((ctx) =>
      ctx.db.patch(runId, {
        status: "done",
        startedAt: Date.now() - 31 * 24 * 3_600_000,
      }),
    );
    await t.mutation(internal.agents.tick, {});
    expect(await t.run((ctx) => ctx.db.get(runId))).toBeNull();
  });
});
