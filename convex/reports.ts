import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { memberQuery } from "./lib/functions";
import { memberIndex } from "./lib/records";
import { leadSlaSeconds } from "./lib/leads";
import { pricingPolicy } from "./lib/settings";
import { STALL_RULES } from "./lib/activation";
import {
  PERIODS,
  UNASSIGNED,
  activationReport,
  buildReport,
  forecastReport,
  revenueReport,
  teamReport,
  type AcceptedProposalInput,
  type ForecastDealInput,
} from "./lib/reports";
import { literals } from "./lib/validators";
import { priceLines } from "../lib/domain/pricing";
import { COMMIT_PROPOSAL_STATUSES } from "../lib/domain/forecast";

const vPeriod = literals(PERIODS);
const REVENUE_MONTHS = 6;
const COHORT_WEEKS = 8;

// Every report reads whole tables, which is fine at pilot scale; move to
// aggregates past ~10k rows per table.

async function names(ctx: QueryCtx) {
  const members = await memberIndex(ctx);
  return (id: string) =>
    id === UNASSIGNED
      ? null
      : (members.get(id as Id<"members">)?.name ?? "Former teammate");
}

async function accountNames(ctx: QueryCtx, ids: Iterable<string>) {
  const map = new Map<string, string>();
  for (const id of new Set(ids)) {
    const account = await ctx.db.get(id as Id<"accounts">);
    map.set(id, account?.name ?? "Deleted account");
  }
  return map;
}

const matchesOwner = (ownerId: string, owner: string | undefined) =>
  !owner || ownerId === owner;

/** Overview, funnel, sources and speed to lead. */
export const overview = memberQuery({
  args: {
    period: vPeriod,
    source: v.optional(v.string()),
    owner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [leads, accounts, people, events, deals, owner] = await Promise.all([
      ctx.db.query("leads").collect(),
      ctx.db.query("accounts").collect(),
      ctx.db.query("people").collect(),
      ctx.db.query("platformEvents").collect(),
      ctx.db.query("deals").collect(),
      names(ctx),
    ]);
    const report = buildReport({
      leads,
      accounts,
      people,
      events,
      deals,
      slaMs: (await leadSlaSeconds(ctx)) * 1000,
      now: Date.now(),
      period: args.period,
      filters: { source: args.source, owner: args.owner },
    });
    return {
      ...report,
      speedByOwner: report.speedByOwner.map((row) => ({
        ...row,
        ownerName: owner(row.ownerId),
      })),
    };
  },
});

function interaction(entry: Doc<"timeline">) {
  return {
    kind: entry.kind,
    actorId: entry.actorId,
    occurredAt: entry.occurredAt,
    automated: entry.automated,
  };
}

/** Rep leaderboard for the period and the one before it. */
export const team = memberQuery({
  args: { period: vPeriod },
  handler: async (ctx, args) => {
    const [leads, tasks, timeline, deals, accounts, people, events, members] =
      await Promise.all([
        ctx.db.query("leads").collect(),
        ctx.db.query("tasks").collect(),
        ctx.db
          .query("timeline")
          .filter((q) =>
            q.or(
              q.eq(q.field("kind"), "call"),
              q.eq(q.field("kind"), "meeting"),
            ),
          )
          .collect(),
        ctx.db.query("deals").collect(),
        ctx.db.query("accounts").collect(),
        ctx.db.query("people").collect(),
        ctx.db.query("platformEvents").collect(),
        ctx.db
          .query("members")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .collect(),
      ]);
    const owner = await names(ctx);
    const report = teamReport({
      leads,
      tasks,
      interactions: timeline.map(interaction),
      deals,
      accounts,
      people,
      events,
      memberIds: members.map((member) => member._id),
      slaMs: (await leadSlaSeconds(ctx)) * 1000,
      now: Date.now(),
      period: args.period,
    });
    return {
      ...report,
      rows: report.rows.map((row) => ({
        ...row,
        ownerName: owner(row.ownerId),
      })),
    };
  },
});

/** The proposal that speaks for each deal: the accepted one, else the newest. */
async function currentProposals(ctx: QueryCtx) {
  const proposals = await ctx.db.query("proposals").collect();
  const byDeal = new Map<string, Doc<"proposals">>();
  for (const proposal of proposals) {
    const held = byDeal.get(proposal.dealId);
    if (
      !held ||
      (held.status !== "accepted" &&
        (proposal.status === "accepted" || proposal.version > held.version))
    ) {
      byDeal.set(proposal.dealId, proposal);
    }
  }
  return { proposals, byDeal };
}

/** Open pipeline by close month, commit vs best case, weighted, and slipped deals. */
export const forecast = memberQuery({
  args: { owner: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const deals = await ctx.db.query("deals").collect();
    const { byDeal } = await currentProposals(ctx);
    const commitStatuses: readonly string[] = COMMIT_PROPOSAL_STATUSES;
    const input: ForecastDealInput[] = deals
      .filter((deal) => matchesOwner(deal.ownerId, args.owner))
      .map((deal) => ({
        _id: deal._id,
        title: deal.title,
        accountId: deal.accountId,
        ownerId: deal.ownerId,
        stage: deal.stage,
        amount: deal.amount,
        closeDate: deal.closeDate,
        commit: commitStatuses.includes(byDeal.get(deal._id)?.status ?? ""),
      }));
    const report = forecastReport(input, Date.now());
    const owner = await names(ctx);
    const accounts = await accountNames(
      ctx,
      report.slipped.map((deal) => deal.accountId),
    );
    return {
      ...report,
      slipped: report.slipped.map((deal) => ({
        ...deal,
        accountName: accounts.get(deal.accountId) ?? "",
        ownerName: owner(deal.ownerId),
      })),
    };
  },
});

/** Accepted proposals' take and blended margin against the pricing policy. */
export const revenue = memberQuery({
  args: { period: vPeriod, owner: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const live = await pricingPolicy(ctx);
    const { proposals } = await currentProposals(ctx);
    const items: AcceptedProposalInput[] = [];
    for (const proposal of proposals) {
      if (proposal.status !== "accepted") continue;
      const deal = await ctx.db.get(proposal.dealId);
      if (!deal || !matchesOwner(deal.ownerId, args.owner)) continue;
      const pricing = priceLines(proposal.lines, proposal.policy ?? live);
      items.push({
        _id: proposal._id,
        dealId: deal._id,
        accountId: deal.accountId,
        ownerId: deal.ownerId,
        decidedAt: proposal.decidedAt ?? proposal.updatedAt,
        take: Math.max(0, pricing.total.take),
        margin: pricing.total.margin,
        brandCharge: pricing.total.brandCharge,
        approved: proposal.approval?.state === "approved",
      });
    }
    const report = revenueReport(items, {
      period: args.period,
      now: Date.now(),
      months: REVENUE_MONTHS,
      policy: {
        marginFloorBps: live.marginFloorBps,
        approvalBps: live.approvalBps,
      },
    });
    const owner = await names(ctx);
    const accounts = await accountNames(
      ctx,
      report.byAccount.map((row) => row.key),
    );
    return {
      ...report,
      byAccount: report.byAccount.map((row) => ({
        ...row,
        name: accounts.get(row.key) ?? "",
      })),
      byRep: report.byRep.map((row) => ({ ...row, name: owner(row.key) })),
    };
  },
});

/** Time between activation steps, stall tasks per week and signup cohorts. */
export const activation = memberQuery({
  args: { period: vPeriod },
  handler: async (ctx, args) => {
    const [accounts, people, events, tasks] = await Promise.all([
      ctx.db.query("accounts").collect(),
      ctx.db.query("people").collect(),
      ctx.db.query("platformEvents").collect(),
      ctx.db
        .query("tasks")
        .withIndex("by_automation_key", (q) =>
          q
            .gte("automationKey", "activation:")
            .lt("automationKey", "activation;"),
        )
        .collect(),
    ]);
    return {
      ...activationReport({
        accounts,
        people,
        events,
        tasks,
        ruleIds: STALL_RULES.map((rule) => rule.id),
        now: Date.now(),
        period: args.period,
        weeks: COHORT_WEEKS,
      }),
      rules: STALL_RULES.map((rule) => ({ id: rule.id, label: rule.label })),
    };
  },
});
