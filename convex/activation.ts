import { internalMutation } from "./_generated/server";
import { ACTIVATION_STAGES } from "../lib/domain/platform";
import { PRIORITIES } from "../lib/domain/enums";
import { managerMutation, memberQuery } from "./lib/functions";
import { memberIndex, memberRef } from "./lib/records";
import {
  accountEvents,
  automationKey,
  detectStall,
  journey,
  platformAccounts,
  runActivationChecks,
  stallAccount,
  STALL_RULES,
  STALL_THRESHOLDS,
} from "./lib/activation";

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
