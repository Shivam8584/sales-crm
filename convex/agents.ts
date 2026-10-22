import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation as rawInternalMutation,
  type MutationCtx,
} from "./_generated/server";
import {
  CAPS,
  DEFAULTS,
  LIMITS,
  LOG_RESULT,
  MAX_AGENTS,
  MAX_INSTRUCTION,
  MAX_NAME,
  RUN_RETENTION_MS,
  SLACK_TOOL,
  STALE_RUN_MS,
  agentName,
  agentTools,
  estimateTokens,
  nextRunAt,
  parseCalls,
  systemPrompt,
  triggerProblem,
  turnInput,
  type Plan,
  type Turn,
} from "../lib/domain/agents";
import { istToday } from "../lib/domain/day";
import { checkInput, clip, findTool } from "../lib/domain/mcp";
import { routes } from "../lib/routes";
import { generate, list as listOf, object, text } from "./lib/ai";
import { KEYS, agentsConfig, write } from "./lib/agents/config";
import { queueRun, skipRun } from "./lib/agents/queue";
import { assertInScope } from "./lib/agents/scope";
import { vRunStatus, vScope, vTrigger } from "./lib/agents/validators";
import { sha256Hex } from "./lib/crypto";
import { fail, invalid, notFound } from "./lib/errors";
import {
  adminMutation,
  internalMutation,
  memberMutation,
  memberQuery,
} from "./lib/functions";
import { viaToken } from "./lib/mcp";
import { READ, WRITE } from "./lib/mcpTools";
import { postToSlack } from "./lib/slack";
import { getSecret, secretEnv } from "./lib/secrets";
import { notify } from "./notifications";

const AI_KEY = "OPENAI_API_KEY";
const SWEEP = 100;

const PLAN = {
  name: "agent_turn",
  json: object({
    summary: text,
    calls: listOf(object({ tool: text, argsJson: text })),
  }),
};

async function ownAgent(
  ctx: { db: MutationCtx["db"] },
  viewer: Doc<"members">,
  id: Id<"agents">,
) {
  const agent = await ctx.db.get(id);
  if (!agent || agent.ownerId !== viewer._id) notFound("Agent");
  return agent;
}

function check(
  viewer: Doc<"members">,
  fields: {
    instruction?: string;
    name?: string;
    trigger?: Doc<"agents">["trigger"];
    scope?: Doc<"agents">["scope"];
    dailyRuns?: number;
  },
) {
  const { instruction, name, trigger, scope, dailyRuns } = fields;
  if (instruction !== undefined) {
    if (!instruction.trim())
      invalid("instruction", "Say what the agent should do");
    if (instruction.length > MAX_INSTRUCTION) {
      invalid("instruction", `Keep it under ${MAX_INSTRUCTION} characters`);
    }
  }
  if (name !== undefined && name.length > MAX_NAME) {
    invalid("name", "Keep the name shorter");
  }
  const problem = trigger && triggerProblem(trigger);
  if (problem) invalid("trigger", problem);
  if (scope === "team" && viewer.role !== "admin") {
    fail("forbidden", "Only admins can point an agent at the whole team");
  }
  const { min, max } = LIMITS.dailyRuns;
  if (
    dailyRuns !== undefined &&
    !(Number.isInteger(dailyRuns) && dailyRuns >= min && dailyRuns <= max)
  ) {
    invalid("dailyRuns", `Enter a whole number from ${min} to ${max}`);
  }
}

/** What the page needs to decide whether to show agents at all. */
export const status = memberQuery({
  args: {},
  handler: async (ctx) => ({
    ...(await agentsConfig(ctx)),
    ai: Boolean(await getSecret(ctx, AI_KEY)),
    canTeam: ctx.viewer.role === "admin",
    max: MAX_AGENTS,
    defaultRuns: DEFAULTS.dailyRuns,
  }),
});

export const setConfig = adminMutation({
  args: { enabled: v.optional(v.boolean()), dailyCap: v.optional(v.number()) },
  handler: async (ctx, { enabled, dailyCap }) => {
    const { min, max } = LIMITS.globalDailyRuns;
    if (
      dailyCap !== undefined &&
      !(Number.isInteger(dailyCap) && dailyCap >= min && dailyCap <= max)
    ) {
      invalid("dailyCap", `Enter a whole number from ${min} to ${max}`);
    }
    if (enabled !== undefined)
      await write(ctx, KEYS.enabled, enabled ? "1" : "0");
    if (dailyCap !== undefined)
      await write(ctx, KEYS.dailyCap, String(dailyCap));
  },
});

export const list = memberQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.viewer._id))
      .order("desc")
      .take(MAX_AGENTS + 5),
});

export const get = memberQuery({
  args: { id: v.id("agents") },
  handler: async (ctx, { id }) => {
    const agent = await ctx.db.get(id);
    return agent?.ownerId === ctx.viewer._id ? agent : null;
  },
});

const RUNS = 20;

export const runs = memberQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (agent?.ownerId !== ctx.viewer._id) return [];
    const rows = await ctx.db
      .query("agentRuns")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(RUNS);
    return rows.map(({ log, writeIds, ...row }) => ({
      ...row,
      changes: writeIds.length,
      calls: log.length,
    }));
  },
});

/** One run with every step and the changes it made, live while it runs. */
export const run = memberQuery({
  args: { id: v.id("agentRuns") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.ownerId !== ctx.viewer._id) return null;
    const changes = [];
    for (const writeId of row.writeIds) {
      const write = await ctx.db.get(writeId);
      if (!write) continue;
      changes.push({
        _id: write._id,
        summary: write.summary,
        undoable: write.undo !== undefined && write.undoneAt === undefined,
        undone: write.undoneAt !== undefined,
      });
    }
    return { ...row, changes };
  },
});

export const create = memberMutation({
  args: {
    name: v.optional(v.string()),
    instruction: v.string(),
    trigger: vTrigger,
    scope: vScope,
  },
  handler: async (ctx, args) => {
    check(ctx.viewer, args);
    if (!(await getSecret(ctx, AI_KEY))) {
      fail("unavailable", "Agents need an AI key. Ask an admin to add one.");
    }
    const own = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.viewer._id))
      .take(MAX_AGENTS);
    if (own.length >= MAX_AGENTS) {
      fail("conflict", `You can have ${MAX_AGENTS} agents. Delete one first.`);
    }
    const now = Date.now();
    return await ctx.db.insert("agents", {
      ownerId: ctx.viewer._id,
      name: agentName(args.name, args.instruction),
      instruction: args.instruction.trim(),
      trigger: args.trigger,
      scope: args.scope,
      allowChanges: false,
      enabled: true,
      dailyRuns: DEFAULTS.dailyRuns,
      nextRunAt: nextRunAt(args.trigger, now),
      updatedAt: now,
    });
  },
});

export const update = memberMutation({
  args: {
    id: v.id("agents"),
    patch: v.object({
      name: v.optional(v.string()),
      instruction: v.optional(v.string()),
      trigger: v.optional(vTrigger),
      scope: v.optional(vScope),
      allowChanges: v.optional(v.boolean()),
      enabled: v.optional(v.boolean()),
      dailyRuns: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const agent = await ownAgent(ctx, ctx.viewer, id);
    check(ctx.viewer, patch);
    const next = { ...agent, ...patch };
    const fields: Partial<Doc<"agents">> = {
      ...patch,
      ...(patch.instruction !== undefined
        ? { instruction: patch.instruction.trim() }
        : {}),
      ...(patch.name !== undefined
        ? { name: agentName(patch.name, next.instruction) }
        : {}),
      updatedAt: Date.now(),
    };
    if (patch.trigger !== undefined || patch.enabled !== undefined) {
      fields.nextRunAt = next.enabled
        ? nextRunAt(next.trigger, Date.now())
        : undefined;
    }
    await ctx.db.patch(id, fields);
  },
});

export const remove = memberMutation({
  args: { id: v.id("agents") },
  handler: async (ctx, { id }) => {
    await ownAgent(ctx, ctx.viewer, id);
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_agent", (q) => q.eq("agentId", id))
      .take(SWEEP);
    for (const row of runs) await ctx.db.delete(row._id);
    await ctx.db.delete(id);
  },
});

/** A preview plans without writing; a normal run follows the agent's "allow changes" switch. */
export const runNow = memberMutation({
  args: { id: v.id("agents"), preview: v.boolean() },
  handler: async (ctx, { id, preview }) => {
    const agent = await ownAgent(ctx, ctx.viewer, id);
    if (!(await getSecret(ctx, AI_KEY))) {
      fail("unavailable", "Agents need an AI key. Ask an admin to add one.");
    }
    const queued = await queueRun(ctx, agent, { trigger: "manual", preview });
    if (!queued.ok) fail("conflict", queued.reason);
    return queued.runId;
  },
});

async function conclude(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  status: Doc<"agentRuns">["status"],
  extra: { summary?: string; note?: string } = {},
) {
  const now = Date.now();
  await ctx.db.patch(run._id, { status, finishedAt: now, ...extra });
  const agent = await ctx.db.get(run.agentId);
  if (!agent) return;
  await ctx.db.patch(agent._id, { lastRunAt: now, lastStatus: status });
  if (status === "failed") {
    await notify(ctx, agent.ownerId, {
      kind: "automation",
      title: `Agent “${clip(agent.name, 60)}” failed`,
      body: extra.note,
      href: routes.agent(agent._id),
    });
  }
}

/** Cron: starts what is due, ends runs that never reported back and sweeps old logs. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("agents")
      .withIndex("by_due", (q) => q.gt("nextRunAt", 0).lte("nextRunAt", now))
      .take(SWEEP);
    for (const agent of due) {
      await ctx.db.patch(agent._id, {
        nextRunAt: nextRunAt(agent.trigger, now),
      });
      const queued = await queueRun(ctx, agent, { trigger: "schedule" });
      if (!queued.ok) await skipRun(ctx, agent, "schedule", queued.reason);
    }
    for (const state of ["running", "queued"] as const) {
      const stuck = await ctx.db
        .query("agentRuns")
        .withIndex("by_status", (q) =>
          q.eq("status", state).lt("startedAt", now - STALE_RUN_MS),
        )
        .take(SWEEP);
      for (const row of stuck) {
        await conclude(ctx, row, "failed", { note: "The run timed out" });
      }
    }
    const old = await ctx.db
      .query("agentRuns")
      .withIndex("by_started", (q) => q.lt("startedAt", now - RUN_RETENTION_MS))
      .take(SWEEP);
    for (const row of old) await ctx.db.delete(row._id);
  },
});

const FINAL = ["done", "failed", "capped", "skipped"];

export const begin = internalMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, { runId }) => {
    const row = await ctx.db.get(runId);
    if (row?.status !== "queued") return null;
    const agent = await ctx.db.get(row.agentId);
    const owner = agent && (await ctx.db.get(agent.ownerId));
    const refuse = async (status: "failed" | "skipped", note: string) => {
      await conclude(ctx, row, status, { note });
      return null;
    };
    if (!agent || owner?.status !== "active") {
      return await refuse("failed", "The agent or its owner is gone");
    }
    if (!(await agentsConfig(ctx)).enabled) {
      return await refuse("skipped", "Agents are switched off");
    }
    const manual = row.trigger === "manual" || row.trigger === "preview";
    if (!manual && !agent.enabled) {
      return await refuse("skipped", "The agent was turned off");
    }
    if (agent.scope === "team" && owner.role !== "admin") {
      return await refuse("failed", "Team scope needs an admin owner");
    }
    await ctx.db.patch(runId, { status: "running" });
    return {
      name: agent.name,
      instruction: agent.instruction,
      context: row.context ?? null,
      dryRun: row.dryRun,
      slack: Boolean(
        (await getSecret(ctx, "SLACK_BOT_TOKEN")) ||
        (await getSecret(ctx, "SLACK_WEBHOOK_URL")),
      ),
    };
  },
});

async function append(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  entry: Omit<Doc<"agentRuns">["log"][number], "at">,
  writeId?: Id<"mcpWrites">,
) {
  await ctx.db.patch(run._id, {
    log: [...run.log, { ...entry, at: Date.now() }],
    toolCalls: run.toolCalls + 1,
    ...(writeId ? { writeIds: [...run.writeIds, writeId] } : {}),
  });
}

async function liveRun(ctx: MutationCtx, runId: Id<"agentRuns">) {
  const row = await ctx.db.get(runId);
  if (row?.status !== "running") fail("conflict", "This run has ended");
  if (row.toolCalls >= CAPS.toolCalls) {
    fail("conflict", `Reached ${CAPS.toolCalls} tool calls`);
  }
  return row;
}

const vEntry = {
  runId: v.id("agentRuns"),
  step: v.number(),
  tool: v.string(),
  input: v.any(),
};

/**
 * The raw builder on purpose, like `mcp.write`: the app mutations a tool runs wrap
 * `ctx.db` with the count triggers themselves. A tool that throws leaves no trace
 * here; the worker records the failure with `note`.
 */
export const execTool = rawInternalMutation({
  args: vEntry,
  handler: async (ctx, { runId, step, tool, input }) => {
    const run = await liveRun(ctx, runId);
    const agent = await ctx.db.get(run.agentId);
    const member = agent && (await ctx.db.get(agent.ownerId));
    if (!agent || member?.status !== "active") {
      fail("unauthenticated", "The owner is no longer active");
    }
    const def = findTool(tool);
    if (!def) fail("not_found", "Unknown tool");
    const args = { ...(input as Record<string, unknown>) };
    delete args.idempotencyKey;
    const problem = checkInput(def.inputSchema, args);
    if (problem) fail("invalid", problem);
    const argsText = clip(JSON.stringify(args), 600);
    if (
      run.log.some(
        (entry) =>
          entry.tool === tool &&
          entry.args === argsText &&
          entry.status !== "error",
      )
    ) {
      fail("conflict", "You already made this exact call in this run");
    }

    await assertInScope(ctx, member, agent.scope, tool, args);

    if (def.access === "read") {
      const out = JSON.stringify(await READ[tool](ctx, member, args));
      await append(ctx, run, {
        step,
        tool,
        args: argsText,
        status: "ok",
        result: clip(out, LOG_RESULT),
      });
      return { status: "ok" as const, text: out };
    }
    if (run.dryRun) {
      const note = "Planned only. Nothing was changed.";
      await append(ctx, run, {
        step,
        tool,
        args: argsText,
        status: "planned",
        result: note,
      });
      return { status: "planned" as const, text: note };
    }
    const done = await WRITE[tool](
      viaToken(ctx, `agent ${clip(agent.name, 40)}`),
      member,
      args,
    );
    const out = JSON.stringify(done.result);
    const writeId = await ctx.db.insert("mcpWrites", {
      agentId: agent._id,
      memberId: member._id,
      tool,
      inputHash: await sha256Hex(`${tool}:${argsText}`),
      result: out,
      summary: done.summary,
      undo: done.undo,
      at: Date.now(),
    });
    await append(
      ctx,
      run,
      {
        step,
        tool,
        args: argsText,
        status: "ok",
        result: clip(done.summary, LOG_RESULT),
      },
      writeId,
    );
    return { status: "ok" as const, text: out };
  },
});

/** Records a call that failed, was refused or ran in the worker. */
export const logCall = internalMutation({
  args: {
    ...vEntry,
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("planned")),
    result: v.string(),
  },
  handler: async (ctx, { runId, step, tool, input, status, result }) => {
    const run = await liveRun(ctx, runId);
    await append(ctx, run, {
      step,
      tool,
      args: clip(
        typeof input === "string" ? input : JSON.stringify(input),
        600,
      ),
      status,
      result: clip(result, LOG_RESULT),
    });
  },
});

export const progress = internalMutation({
  args: { runId: v.id("agentRuns"), steps: v.number(), tokens: v.number() },
  handler: async (ctx, { runId, steps, tokens }) => {
    const run = await ctx.db.get(runId);
    if (run?.status === "running") await ctx.db.patch(runId, { steps, tokens });
  },
});

export const finish = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    status: vRunStatus,
    summary: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { runId, status, summary, note }) => {
    const run = await ctx.db.get(runId);
    if (!run || FINAL.includes(run.status)) return;
    await conclude(ctx, run, status, {
      summary: summary && clip(summary, 1000),
      note: note && clip(note, 300),
    });
  },
});

function messageOf(error: unknown) {
  const data = error instanceof ConvexError ? (error.data as unknown) : null;
  if (data && typeof data === "object" && "message" in data) {
    return clip(String(data.message), 200);
  }
  console.error("agent step failed", error);
  return "Something went wrong";
}

/** Runs one queued run: the model proposes tool calls, the server checks and executes each. */
export const execute = internalAction({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, { runId }): Promise<void> => {
    const begun = await ctx.runMutation(internal.agents.begin, { runId });
    if (!begun) return;
    const tools = agentTools(begun.slack);
    const system = systemPrompt(tools, begun.dryRun);
    const turns: Turn[] = [];
    let tokens = 0;
    let calls = 0;
    let summary = "";
    let stop: string | undefined;

    try {
      const env = await secretEnv(ctx);
      let step = 0;
      for (; step < CAPS.steps; step++) {
        const input = turnInput({
          instruction: begun.instruction,
          context: begun.context,
          today: istToday(),
          turns,
          stepsLeft: CAPS.steps - step,
          callsLeft: CAPS.toolCalls - calls,
        });
        if (tokens + estimateTokens(system, input) > CAPS.tokens) {
          stop = "Reached the token budget";
          break;
        }
        const plan = await generate<Plan>(
          {
            model: "main",
            system,
            input,
            schema: PLAN,
            maxOutputTokens: CAPS.stepOutputTokens,
          },
          fetch,
          env,
        );
        tokens += estimateTokens(system, input, JSON.stringify(plan));
        summary = plan.summary;
        await ctx.runMutation(internal.agents.progress, {
          runId,
          steps: step + 1,
          tokens,
        });
        if (plan.calls.length === 0) break;

        const parsed = parseCalls(
          plan.calls.slice(0, CAPS.callsPerStep),
          tools,
        );
        for (const [index, call] of parsed.entries()) {
          if (calls >= CAPS.toolCalls) {
            stop = `Reached ${CAPS.toolCalls} tool calls`;
            break;
          }
          calls++;
          const raw = plan.calls[index];
          const turn = (
            status: Turn["status"],
            result: string,
            argsText: string,
          ) =>
            turns.push({
              step: step + 1,
              tool: raw.tool,
              args: clip(argsText, 400),
              status,
              result,
            });

          if (!call.ok) {
            await ctx.runMutation(internal.agents.logCall, {
              runId,
              step: step + 1,
              tool: call.name,
              input: raw.argsJson,
              status: "error",
              result: call.problem,
            });
            turn("error", call.problem, raw.argsJson);
            continue;
          }
          const argsText = JSON.stringify(call.args);
          try {
            if (call.tool.name === SLACK_TOOL.name) {
              const outcome = begun.dryRun
                ? ({
                    status: "planned",
                    text: "Planned only. Nothing was posted.",
                  } as const)
                : await postSlack(ctx, call.args);
              await ctx.runMutation(internal.agents.logCall, {
                runId,
                step: step + 1,
                tool: raw.tool,
                input: call.args,
                status: outcome.status,
                result: outcome.text,
              });
              turn(outcome.status, outcome.text, argsText);
              continue;
            }
            const out = await ctx.runMutation(internal.agents.execTool, {
              runId,
              step: step + 1,
              tool: call.tool.name,
              input: call.args,
            });
            turn(out.status, out.text, argsText);
          } catch (error) {
            const message = messageOf(error);
            await ctx.runMutation(internal.agents.logCall, {
              runId,
              step: step + 1,
              tool: raw.tool,
              input: call.args,
              status: "error",
              result: message,
            });
            turn("error", message, argsText);
          }
        }
        if (stop) break;
      }
      if (!stop && step >= CAPS.steps)
        stop = `Stopped after ${CAPS.steps} steps`;
      await ctx.runMutation(internal.agents.finish, {
        runId,
        status: stop ? "capped" : "done",
        summary,
        note: stop,
      });
    } catch (error) {
      await ctx.runMutation(internal.agents.finish, {
        runId,
        status: "failed",
        summary: summary || undefined,
        note: messageOf(error),
      });
    }
  },
});

async function postSlack(
  ctx: Parameters<typeof postToSlack>[0],
  args: Record<string, unknown>,
) {
  const result = await postToSlack(ctx, {
    channel: typeof args.channel === "string" ? args.channel : undefined,
    text: String(args.text),
    event: "agent_output",
  });
  return result.ok
    ? ({ status: "ok", text: "Posted to Slack" } as const)
    : ({
        status: "error",
        text: `Slack did not take it (${result.reason})`,
      } as const);
}
