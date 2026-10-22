import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { ROLE_RANK } from "../lib/domain/enums";
import {
  TARGET_METRICS,
  attain,
  currentPeriod,
  isPeriod,
  monthWindow,
  type TargetMetric,
} from "../lib/domain/forecast";
import { DEFAULT_CURRENCY } from "../lib/domain/money";
import { invalid } from "./lib/errors";
import { adminMutation, memberQuery } from "./lib/functions";
import { literals } from "./lib/validators";
import { platformAccounts, stageFacts } from "./reports";

const vMetric = literals(TARGET_METRICS);
const vScope = v.union(v.literal("team"), v.id("members"));

const TEAM = "team";

function checkPeriod(period: string) {
  if (!isPeriod(period)) invalid("period", "Pick a month like 2026-10");
}

/** Blank or zero means no goal, so the row is removed; returns the previous value for undo. */
export const set = adminMutation({
  args: {
    period: v.string(),
    scope: vScope,
    metric: vMetric,
    value: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { period, scope, metric, value }) => {
    checkPeriod(period);
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      invalid("value", "Enter a whole number, zero or more");
    }
    if (scope !== TEAM) {
      const member = await ctx.db.get(scope);
      if (!member || member.status !== "active") {
        invalid("scope", "Pick an active teammate");
      }
    }
    const rows = await ctx.db
      .query("targets")
      .withIndex("by_period", (q) => q.eq("period", period))
      .collect();
    const [current, ...extra] = rows.filter(
      (row) => row.scope === scope && row.metric === metric,
    );
    for (const row of extra) await ctx.db.delete(row._id);
    if (!value) {
      if (current) await ctx.db.delete(current._id);
    } else if (current) {
      await ctx.db.patch(current._id, { value });
    } else {
      await ctx.db.insert("targets", { period, scope, metric, value });
    }
    return { previous: current?.value ?? null };
  },
});

/** Reps see the team's goals and their own; managers see everyone's. */
export const list = memberQuery({
  args: { period: v.string() },
  handler: async (ctx, { period }) => {
    checkPeriod(period);
    const rows = await ctx.db
      .query("targets")
      .withIndex("by_period", (q) => q.eq("period", period))
      .collect();
    const all = ROLE_RANK[ctx.viewer.role] >= ROLE_RANK.manager;
    return rows
      .filter(
        (row) => all || row.scope === TEAM || row.scope === ctx.viewer._id,
      )
      .map(({ scope, metric, value }) => ({ scope, metric, value }));
  },
});

type Actuals = Map<string, Record<TargetMetric, number>>;

/**
 * What each member did in a month, with the same definitions as the reports:
 * deals won by close time, accounts by the first time their org went live,
 * calls and meetings a teammate logged themselves. Reads are bounded by the
 * month, plus platform size for activations.
 */
async function monthActuals(ctx: QueryCtx, start: number, end: number) {
  const [won, leads, logged, accounts, facts] = await Promise.all([
    ctx.db
      .query("deals")
      .withIndex("by_stage_closed", (q) =>
        q.eq("stage", "won").gte("closedAt", start).lt("closedAt", end),
      )
      .collect(),
    ctx.db
      .query("leads")
      .withIndex("by_converted", (q) =>
        q.gte("convertedAt", start).lt("convertedAt", end),
      )
      .collect(),
    Promise.all(
      (["call", "meeting"] as const).map((kind) =>
        ctx.db
          .query("timeline")
          .withIndex("by_kind", (q) =>
            q.eq("kind", kind).gte("occurredAt", start).lt("occurredAt", end),
          )
          .collect(),
      ),
    ),
    platformAccounts(ctx),
    stageFacts(ctx),
  ]);

  const actuals: Actuals = new Map();
  const bump = (owner: string | undefined, metric: TargetMetric, by = 1) => {
    for (const scope of owner ? [TEAM, owner] : [TEAM]) {
      const row = actuals.get(scope) ?? {
        won_take: 0,
        activations: 0,
        new_leads_converted: 0,
        calls_logged: 0,
      };
      row[metric] += by;
      actuals.set(scope, row);
    }
  };

  // Other currencies are left out rather than added to rupees unconverted.
  for (const deal of won) {
    if (deal.amount.currency === DEFAULT_CURRENCY) {
      bump(deal.ownerId, "won_take", deal.amount.amount);
    }
  }
  for (const lead of leads) {
    if (lead.status === "converted") bump(lead.ownerId, "new_leads_converted");
  }
  for (const entry of logged.flat()) {
    if (entry.actorId && !entry.automated) bump(entry.actorId, "calls_logged");
  }
  for (const account of accounts) {
    const live = account.platformOrgId
      ? facts.orgs.get(account.platformOrgId)?.live
      : undefined;
    if (
      !account.archivedAt &&
      live !== undefined &&
      live >= start &&
      live < end
    ) {
      bump(account.ownerId, "activations");
    }
  }
  return actuals;
}

/** The viewer's month against their goals; managers also get the team and each teammate. */
export const attainment = memberQuery({
  args: { period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const period = args.period ?? currentPeriod(now);
    checkPeriod(period);
    const { start, end, share } = monthWindow(period, now);
    const manager = ROLE_RANK[ctx.viewer.role] >= ROLE_RANK.manager;
    const [actuals, targets, members] = await Promise.all([
      monthActuals(ctx, start, end),
      ctx.db
        .query("targets")
        .withIndex("by_period", (q) => q.eq("period", period))
        .collect(),
      manager
        ? ctx.db
            .query("members")
            .withIndex("by_status", (q) => q.eq("status", "active"))
            .collect()
        : [],
    ]);
    const row = (scope: string) => {
      const actual = actuals.get(scope);
      return Object.fromEntries(
        TARGET_METRICS.map((metric) => [
          metric,
          attain(
            actual?.[metric] ?? 0,
            targets.find((t) => t.scope === scope && t.metric === metric)
              ?.value ?? null,
            share,
          ),
        ]),
      ) as Record<TargetMetric, ReturnType<typeof attain>>;
    };
    return {
      period,
      share,
      mine: row(ctx.viewer._id),
      team: manager ? row(TEAM) : null,
      members: members
        .map((member) => ({
          _id: member._id as Id<"members">,
          name: member.name,
          metrics: row(member._id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});
