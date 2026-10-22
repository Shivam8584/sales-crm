import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  EVENT_LABEL,
  dailyUsed,
  type AgentEvent,
} from "../../../lib/domain/agents";
import { istToday } from "../../../lib/domain/day";
import { clip } from "../../../lib/domain/mcp";
import { agentsConfig, countRun } from "./config";

const EVENT_IN_FLIGHT = 3;

type Queued =
  | { ok: true; runId: Id<"agentRuns"> }
  | { ok: false; reason: string };

/**
 * Files a run for the worker to pick up, if the kill switch, the daily limits
 * and the owner's standing allow it; otherwise says why not.
 */
export async function queueRun(
  ctx: MutationCtx,
  agent: Doc<"agents">,
  options: {
    trigger: Doc<"agentRuns">["trigger"];
    context?: string;
    preview?: boolean;
  },
): Promise<Queued> {
  const config = await agentsConfig(ctx);
  if (!config.enabled) return { ok: false, reason: "Agents are switched off" };
  const owner = await ctx.db.get(agent.ownerId);
  if (owner?.status !== "active") {
    return { ok: false, reason: "The owner is no longer active" };
  }
  if (agent.scope === "team" && owner.role !== "admin") {
    return { ok: false, reason: "Team scope needs an admin owner" };
  }
  const today = istToday();
  if (config.usedToday >= config.dailyCap) {
    return { ok: false, reason: "The workspace reached its daily agent limit" };
  }
  if (dailyUsed(agent.usage, today) >= agent.dailyRuns) {
    return { ok: false, reason: `Reached ${agent.dailyRuns} runs today` };
  }
  const recent = await ctx.db
    .query("agentRuns")
    .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
    .order("desc")
    .take(EVENT_IN_FLIGHT);
  const pending = recent.filter(
    (run) => run.status === "queued" || run.status === "running",
  ).length;
  if (pending >= (options.trigger === "event" ? EVENT_IN_FLIGHT : 1)) {
    return { ok: false, reason: "A run is already in progress" };
  }

  const now = Date.now();
  const runId = await ctx.db.insert("agentRuns", {
    agentId: agent._id,
    ownerId: agent.ownerId,
    trigger: options.preview ? "preview" : options.trigger,
    context: options.context && clip(options.context, 300),
    dryRun: Boolean(options.preview) || !agent.allowChanges,
    status: "queued",
    startedAt: now,
    steps: 0,
    toolCalls: 0,
    tokens: 0,
    log: [],
    writeIds: [],
  });
  await ctx.db.patch(agent._id, {
    usage: { day: today, runs: dailyUsed(agent.usage, today) + 1 },
  });
  await countRun(ctx, config.usedToday);
  await ctx.scheduler.runAfter(0, internal.agents.execute, { runId });
  return { ok: true, runId };
}

/** A run that never started, kept so the owner can see why a scheduled run didn't happen. */
export async function skipRun(
  ctx: MutationCtx,
  agent: Doc<"agents">,
  trigger: Doc<"agentRuns">["trigger"],
  reason: string,
) {
  const now = Date.now();
  await ctx.db.insert("agentRuns", {
    agentId: agent._id,
    ownerId: agent.ownerId,
    trigger,
    dryRun: true,
    status: "skipped",
    startedAt: now,
    finishedAt: now,
    steps: 0,
    toolCalls: 0,
    tokens: 0,
    log: [],
    note: reason,
    writeIds: [],
  });
  await ctx.db.patch(agent._id, { lastRunAt: now, lastStatus: "skipped" });
}

type Refs = {
  leadId?: Id<"leads">;
  dealId?: Id<"deals">;
  personId?: Id<"people">;
  accountId?: Id<"accounts">;
};

async function describeRecord(ctx: MutationCtx, refs: Refs) {
  if (refs.leadId) {
    const lead = await ctx.db.get(refs.leadId);
    return (
      lead && {
        ownerId: lead.ownerId,
        text: `lead ${lead.name} (id ${lead._id})`,
      }
    );
  }
  if (refs.dealId) {
    const deal = await ctx.db.get(refs.dealId);
    return (
      deal && {
        ownerId: deal.ownerId,
        text: `deal ${deal.title} (id ${deal._id})`,
      }
    );
  }
  if (refs.personId) {
    const person = await ctx.db.get(refs.personId);
    return (
      person && {
        ownerId: person.ownerId,
        text: `person ${person.firstName} ${person.lastName ?? ""} (id ${person._id})`.replace(
          "  ",
          " ",
        ),
      }
    );
  }
  if (refs.accountId) {
    const account = await ctx.db.get(refs.accountId);
    return (
      account && {
        ownerId: account.ownerId,
        text: `account ${account.name} (id ${account._id})`,
      }
    );
  }
  return null;
}

/** Queues a run for every enabled agent listening for `event`. Never throws, so the change that caused it always goes through. */
export async function fireAgentEvent(
  ctx: MutationCtx,
  event: AgentEvent,
  refs: Refs,
) {
  try {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(200);
    const listening = agents.filter(
      (agent) =>
        agent.trigger.kind === "event" && agent.trigger.event === event,
    );
    if (listening.length === 0) return;
    const record = await describeRecord(ctx, refs);
    if (!record) return;
    for (const agent of listening) {
      if (agent.scope === "own" && record.ownerId !== agent.ownerId) continue;
      await queueRun(ctx, agent, {
        trigger: "event",
        context: `${EVENT_LABEL[event]}: ${record.text}`,
      });
    }
  } catch (error) {
    console.error("Agent event failed", event, error);
  }
}

const FROM_TRIGGER: Record<string, AgentEvent> = {
  lead_created: "lead_created",
  deal_stage_changed: "deal_stage_changed",
};

/** The hook for automation triggers: only the ones agents can listen for do anything. */
export async function fireAgentsFor(
  ctx: MutationCtx,
  kind: string,
  refs: Refs,
) {
  const event = FROM_TRIGGER[kind];
  if (event) await fireAgentEvent(ctx, event, refs);
}
