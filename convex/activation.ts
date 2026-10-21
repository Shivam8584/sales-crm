import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { accountHealth, weakestFactors } from "../lib/domain/health";
import { ACTIVATION_STAGES } from "../lib/domain/platform";
import { PRIORITIES, ROLE_RANK } from "../lib/domain/enums";
import { fail } from "./lib/errors";
import type { Doc } from "./_generated/dataModel";
import {
  managerMutation,
  memberMutation,
  memberQuery,
  type Viewer,
} from "./lib/functions";
import { memberIndex, memberRef, requireAccount } from "./lib/records";
import { healthInput, latestSnapshot } from "./lib/platform";
import {
  accountEvents,
  accountStall,
  automationKey,
  detectStall,
  journey,
  platformAccounts,
  runActivationChecks,
  stallAccount,
  STALL_RULES,
  STALL_THRESHOLDS,
  syncAccountActivation,
} from "./lib/activation";

function canManageAccount(viewer: Viewer, account: Doc<"accounts">) {
  return (
    account.ownerId === viewer._id ||
    ROLE_RANK[viewer.role] >= ROLE_RANK.manager
  );
}

/** The activation funnel across linked brands, and every brand stuck on a step. */
export const desk = memberQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const members = await memberIndex(ctx);
    const accounts = await platformAccounts(ctx);
    const reached = ACTIVATION_STAGES.map(() => 0);
    const rows = [];

    for (const account of accounts) {
      const events = await accountEvents(ctx, account);
      const input = stallAccount(account);
      const current = journey(input, events);
      const index = current.stage
        ? ACTIVATION_STAGES.indexOf(current.stage)
        : -1;
      for (let step = 0; step <= index; step++) reached[step]++;

      const stall = detectStall(input, events, now);
      if (!stall || !current.stage) continue;
      const task = await ctx.db
        .query("tasks")
        .withIndex("by_automation_key", (q) =>
          q.eq("automationKey", automationKey(stall.rule.id, account._id)),
        )
        .first();
      rows.push({
        _id: account._id,
        account: {
          _id: account._id,
          name: account.name,
          domain: account.domain ?? null,
          logoUrl: account.logoUrl ?? null,
        },
        stage: current.stage,
        ruleId: stall.rule.id,
        title: stall.title,
        since: stall.since,
        severity: PRIORITIES.indexOf(stall.rule.priority),
        owner: memberRef(members, account.ownerId),
        task: task
          ? {
              _id: task._id,
              status: task.status,
              assignee: memberRef(members, task.assigneeId),
              completedAt: task.completedAt ?? null,
            }
          : null,
        lastEventAt: current.lastEventAt,
        canOpenTask: canManageAccount(ctx.viewer, account),
      });
    }

    const funnel = ACTIVATION_STAGES.map((stage, step) => ({
      stage,
      count: reached[step],
      conversion:
        step === 0 || reached[step - 1] === 0
          ? null
          : reached[step] / reached[step - 1],
    }));
    const leak = funnel.reduce<number | null>((worst, item, step) => {
      if (item.conversion === null || item.conversion >= 1) return worst;
      if (worst === null) return step;
      const other = funnel[worst];
      if (item.conversion !== other.conversion) {
        return item.conversion < other.conversion! ? step : worst;
      }
      const drop = reached[step - 1] - item.count;
      return drop > reached[worst - 1] - other.count ? step : worst;
    }, null);

    return {
      rules: STALL_RULES.map((rule) => ({
        id: rule.id,
        label: rule.label,
        description: rule.description,
        playbook: rule.playbook,
        priority: rule.priority,
        threshold: STALL_THRESHOLDS[rule.id],
      })),
      funnel,
      leak,
      linked: accounts.length,
      rows,
    };
  },
});

/** What the account is stuck on right now, with its rep task; null when it isn't stuck. */
export const forAccount = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    const stall = await accountStall(ctx, account, Date.now());
    if (!stall) return null;
    const members = await memberIndex(ctx);
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_automation_key", (q) =>
        q.eq("automationKey", automationKey(stall.rule.id, account._id)),
      )
      .first();
    return {
      stage: stall.stage,
      since: stall.since,
      canOpenTask: canManageAccount(ctx.viewer, account),
      title: stall.title,
      rule: {
        id: stall.rule.id,
        label: stall.rule.label,
        description: stall.rule.description,
        playbook: stall.rule.playbook,
        priority: stall.rule.priority,
      },
      task: task
        ? {
            _id: task._id,
            title: task.title,
            status: task.status,
            dueDate: task.dueDate ?? null,
            assignee: memberRef(members, task.assigneeId),
            completedAt: task.completedAt ?? null,
          }
        : null,
    };
  },
});

/** Opens (or finds) the rep task for the account's current stall; null when it isn't stuck. */
export const ensureTask = memberMutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await requireAccount(ctx, accountId);
    if (!canManageAccount(ctx.viewer, account)) {
      fail("forbidden", "Only the account owner or a manager can do that");
    }
    const { key } = await syncAccountActivation(ctx, accountId, Date.now());
    if (!key) return null;
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_automation_key", (q) => q.eq("automationKey", key))
      .first();
    return task?._id ?? null;
  },
});

/** Health for every brand linked to an organisation, riskiest first, with their expansion signals. */
export const health = memberQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const members = await memberIndex(ctx);
    const accounts = (await platformAccounts(ctx)).filter(
      (account) => account.platformOrgId,
    );
    const rows = [];
    for (const account of accounts) {
      const events = await accountEvents(ctx, account);
      const snapshot = await latestSnapshot(ctx, account._id);
      const input = healthInput(account, events, snapshot, now);
      const result = accountHealth(input);
      rows.push({
        _id: account._id,
        account: {
          _id: account._id,
          name: account.name,
          domain: account.domain ?? null,
          logoUrl: account.logoUrl ?? null,
        },
        stage: journey(stallAccount(account), events).stage,
        owner: memberRef(members, account.ownerId),
        score: result.score,
        band: result.band,
        factors: result.factors,
        weakest: weakestFactors(result),
        signals: result.signals,
        balance:
          input.balancePaise === null
            ? null
            : { amount: input.balancePaise, currency: "INR" as const },
        wallet: input.wallet,
        live: input.campaigns.filter((item) => item.status === "live").length,
        fetchedAt: snapshot?.fetchedAt ?? null,
        lastActivityAt: input.lastActivityAt,
        canOpenTask: canManageAccount(ctx.viewer, account),
      });
    }
    rows.sort((a, b) => a.score - b.score);
    return rows;
  },
});

/** Runs the hourly activation checks immediately and reports what changed. */
export const runNow = managerMutation({
  args: {},
  handler: async (ctx) => await runActivationChecks(ctx, Date.now()),
});

export const check = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await runActivationChecks(ctx, Date.now());
    return {
      checked: result.checked,
      stuck: result.stuck,
      changes: result.changes.length,
    };
  },
});
