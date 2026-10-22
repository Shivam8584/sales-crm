import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { applyToRecord, factsFor, recordValue, summarize } from "./enrichment";
import { generate } from "./lib/ai";
import { fail, invalid, notFound } from "./lib/errors";
import { sameValue, sourceFamily } from "./lib/enrichment/kyc";
import {
  adminMutation,
  internalMutation,
  memberMutation,
  memberQuery,
} from "./lib/functions";
import { rateLimiter } from "./lib/rateLimiter";
import { analyse, type Analysis } from "./lib/research/analyse";
import { KEYS, researchConfig, write } from "./lib/research/config";
import {
  discover,
  enqueue,
  lease,
  researchable,
  taskFor,
} from "./lib/research/queue";
import { SUMMARY, type SummaryOut } from "./lib/research/summary";
import { getSecret, secretEnv } from "./lib/secrets";
import { istToday } from "../lib/domain/day";
import {
  AGENT_SOURCES,
  AUTO_FIELDS,
  BATCH,
  LEASE_MS,
  LIMITS,
  MAX_ATTEMPTS,
  SUMMARY_OUTPUT_TOKENS,
  nextCheck,
} from "../lib/domain/research";

const vSubject = v.union(
  v.object({ accountId: v.id("accounts") }),
  v.object({ personId: v.id("people") }),
);

const AI_KEY = "OPENAI_API_KEY";

async function requireEnabled(ctx: Parameters<typeof researchConfig>[0]) {
  const config = await researchConfig(ctx);
  if (!config.enabled) fail("unavailable", "The research agent is turned off");
  return config;
}

/** The switches and today's use, for the System page and for hiding the Agent section. */
export const status = memberQuery({
  args: {},
  handler: async (ctx) => ({
    ...(await researchConfig(ctx)),
    ai: Boolean(await getSecret(ctx, AI_KEY)),
  }),
});

export const setConfig = adminMutation({
  args: {
    enabled: v.optional(v.boolean()),
    dailyCap: v.optional(v.number()),
    staleDays: v.optional(v.number()),
  },
  handler: async (ctx, { enabled, dailyCap, staleDays }) => {
    for (const [key, value] of [
      ["dailyCap", dailyCap],
      ["staleDays", staleDays],
    ] as const) {
      const { min, max } = LIMITS[key];
      if (
        value !== undefined &&
        !(Number.isInteger(value) && value >= min && value <= max)
      ) {
        invalid(key, `Enter a whole number from ${min} to ${max}`);
      }
    }
    if (enabled !== undefined)
      await write(ctx, KEYS.enabled, enabled ? "1" : "0");
    if (dailyCap !== undefined)
      await write(ctx, KEYS.dailyCap, String(dailyCap));
    if (staleDays !== undefined)
      await write(ctx, KEYS.staleDays, String(staleDays));
  },
});

/** What the agent found and is waiting on for one record; null while the agent is off. */
export const forRecord = memberQuery({
  args: { subject: vSubject },
  handler: async (ctx, { subject }) => {
    const config = await researchConfig(ctx);
    if (!config.enabled) return null;
    const now = Date.now();
    const [task, facts] = await Promise.all([
      taskFor(ctx, subject),
      factsFor(ctx, subject),
    ]);
    const mine = (
      await summarize(
        ctx,
        facts.filter((fact) =>
          (AGENT_SOURCES as readonly string[]).includes(
            sourceFamily(fact.source),
          ),
        ),
        [],
      )
    ).facts;
    const filled = [];
    const current: Record<string, string> = {};
    for (const fact of mine) {
      const value = await recordValue(ctx, { ...subject, field: fact.field });
      if (value) current[fact.field] = value;
      if (fact.status === "applied" && sameValue(value, fact.value)) {
        filled.push(fact);
      }
    }
    return {
      task: task && {
        reason: task.reason,
        dueAt: task.dueAt,
        due: task.dueAt <= now,
        note: task.note ?? null,
        lastRunAt: task.lastRunAt ?? null,
        summary: task.summary ?? null,
        running: Boolean(task.leaseUntil && task.leaseUntil > now),
      },
      filled,
      current,
      review: mine.filter((fact) => fact.status === "suggested"),
    };
  },
});

/** Checks this record now instead of waiting for its turn. */
export const requestNow = memberMutation({
  args: { subject: vSubject },
  handler: async (ctx, { subject }) => {
    await requireEnabled(ctx);
    const record =
      "accountId" in subject
        ? await ctx.db.get(subject.accountId)
        : await ctx.db.get(subject.personId);
    if (!record) notFound("accountId" in subject ? "Account" : "Person");
    if (!researchable(record)) {
      fail("conflict", "This record can't be researched");
    }
    const { ok, retryAfter } = await rateLimiter.limit(ctx, "enrichment", {
      key: ctx.viewer._id,
    });
    if (!ok) {
      fail(
        "rate_limited",
        `Too many checks in a minute. Try again in ${Math.ceil(retryAfter / 1000)} s.`,
      );
    }
    const now = Date.now();
    const id = await enqueue(ctx, subject, "manual", now, 0);
    const task = (await ctx.db.get(id))!;
    if (task.leaseUntil && task.leaseUntil > now) {
      fail("conflict", "A check is already running for this record");
    }
    await ctx.db.patch(id, { leaseUntil: now + LEASE_MS });
    await ctx.scheduler.runAfter(0, internal.research.runTasks, {
      taskIds: [id],
    });
  },
});

/** Takes back something the agent filled in: clears it and never fills that value again. */
export const undoFill = memberMutation({
  args: { factId: v.id("facts") },
  handler: async (ctx, { factId }) => {
    const fact = await ctx.db.get(factId);
    if (!fact) notFound("Finding");
    const automatic =
      fact.status === "applied" &&
      Boolean(fact.personId) &&
      (AUTO_FIELDS as readonly string[]).includes(fact.field) &&
      (AGENT_SOURCES as readonly string[]).includes(sourceFamily(fact.source));
    if (!automatic)
      fail("conflict", "That value wasn't filled in by the agent");
    if (sameValue(await recordValue(ctx, fact), fact.value)) {
      await applyToRecord(ctx, fact, null, ctx.viewer._id);
    }
    await ctx.db.patch(fact._id, {
      status: "rejected",
      decidedById: ctx.viewer._id,
    });
  },
});

/** Dispatcher step: queue what's new, then lease a bounded batch within today's cap. */
export const claim = internalMutation({
  args: {},
  handler: async (ctx): Promise<Id<"researchTasks">[]> => {
    const config = await researchConfig(ctx);
    if (!config.enabled) return [];
    const now = Date.now();
    await discover(ctx, now);
    const room = config.dailyCap - config.usedToday;
    if (room <= 0) return [];
    const tasks = await lease(
      ctx,
      now,
      Math.min(BATCH, room),
      config.staleDays,
    );
    if (tasks.length > 0) {
      await write(
        ctx,
        KEYS.usage,
        `${istToday()}:${config.usedToday + tasks.length}`,
      );
    }
    return tasks.map((task) => task._id);
  },
});

const vAnalysis = v.object({
  unanswered: v.number(),
  jobChange: v.boolean(),
  missing: v.array(v.string()),
});

export const begin = internalMutation({
  args: { taskId: v.id("researchTasks") },
  handler: async (ctx, { taskId }): Promise<Analysis | null> => {
    const task = await ctx.db.get(taskId);
    const analysis = task ? await analyse(ctx, task) : null;
    if (analysis && analysis.hash === task?.summaryHash) analysis.input = null;
    return analysis;
  },
});

export const finish = internalMutation({
  args: {
    taskId: v.id("researchTasks"),
    failed: v.boolean(),
    analysis: v.optional(vAnalysis),
    summary: v.optional(v.object({ text: v.string(), hash: v.string() })),
  },
  handler: async (ctx, { taskId, failed, analysis, summary }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return;
    const config = await researchConfig(ctx);
    const now = Date.now();
    const attempts = failed ? task.attempts + 1 : 0;
    const next = nextCheck({
      now,
      staleDays: config.staleDays,
      failed,
      attempts,
      unanswered: analysis?.unanswered ?? 0,
      jobChange: analysis?.jobChange ?? false,
      missing: analysis?.missing ?? [],
    });
    await ctx.db.patch(taskId, {
      reason: "recheck",
      rank: 1,
      attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
      dueAt: next.dueAt,
      note: next.note,
      leaseUntil: undefined,
      ...(failed ? {} : { lastRunAt: now }),
      ...(summary ? { summary: summary.text, summaryHash: summary.hash } : {}),
    });
  },
});

async function summarise(ctx: ActionCtx, input: string) {
  const env = await secretEnv(ctx);
  if (!env[AI_KEY]?.trim()) return null;
  const out = await generate<SummaryOut>(
    {
      model: "fast",
      system: SUMMARY.system,
      input,
      schema: SUMMARY.schema,
      maxOutputTokens: SUMMARY_OUTPUT_TOKENS,
    },
    fetch,
    env,
  );
  return out.summary.trim().slice(0, 400) || null;
}

export const runTasks = internalAction({
  args: { taskIds: v.array(v.id("researchTasks")) },
  handler: async (ctx, { taskIds }): Promise<void> => {
    for (const taskId of taskIds) {
      let failed = false;
      let analysis: Awaited<ReturnType<typeof analyse>> = null;
      let summary: { text: string; hash: string } | undefined;
      try {
        analysis = await ctx.runMutation(internal.research.begin, { taskId });
        if (!analysis) continue;
        if (analysis.lookUp) {
          await ctx.runAction(internal.enrichment.agentEnrich, {
            accountId: analysis.lookUp,
          });
        }
      } catch (error) {
        console.error("Research task failed", error);
        failed = true;
      }
      if (analysis?.input && analysis.hash) {
        try {
          const text = await summarise(ctx, analysis.input);
          if (text) summary = { text, hash: analysis.hash };
        } catch (error) {
          console.error("Research summary failed", error);
        }
      }
      await ctx.runMutation(internal.research.finish, {
        taskId,
        failed,
        analysis: analysis
          ? {
              unanswered: analysis.unanswered,
              jobChange: analysis.jobChange,
              missing: analysis.missing,
            }
          : undefined,
        summary,
      });
    }
  },
});

/** Cron entry: runs one bounded batch of due checks. */
export const tick = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const taskIds = await ctx.runMutation(internal.research.claim, {});
    if (taskIds.length > 0) {
      await ctx.runAction(internal.research.runTasks, { taskIds });
    }
  },
});
