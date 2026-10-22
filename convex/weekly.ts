import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { istDay } from "../lib/domain/day";
import { ROLE_RANK } from "../lib/domain/enums";
import { accountStall, platformAccounts } from "./lib/activation";
import { deliver, emailProvider } from "./lib/automations/delivery";
import { siteUrl } from "./lib/http";
import {
  FUNNEL_STEPS,
  UNASSIGNED,
  periodWindows,
  pipeline,
} from "./lib/reports";
import { weeklyReport, type WeeklyReportData } from "./lib/weeklyReport";
import { dealsSince, overviewReport, teamData } from "./reports";

const TOP_REPS = 3;
const CONVERTED = FUNNEL_STEPS.findIndex((step) => step.key === "converted");

// The three reads run as separate queries so each stays inside its own read limits.

export const leadSide = internalQuery({
  args: {},
  handler: async (ctx) => {
    const report = await overviewReport(ctx, { period: "7d" });
    return {
      slaMs: report.slaMs,
      leads: {
        current: report.funnel.steps[0].count,
        previous: report.previousFunnel[0],
      },
      converted: {
        current: report.funnel.steps[CONVERTED].count,
        previous: report.previousFunnel[CONVERTED],
      },
      speed: {
        current: {
          medianMs: report.speed.medianMs,
          withinRate: report.speed.withinRate,
        },
        previous: {
          medianMs: report.previousSpeed.medianMs,
          withinRate: report.previousSpeed.withinRate,
        },
      },
    };
  },
});

export const teamSide = internalQuery({
  args: {},
  handler: async (ctx) => {
    const report = await teamData(ctx, { period: "7d" });
    return {
      overdue: report.team.overdue,
      topReps: report.rows
        .filter((row) => row.ownerId !== UNASSIGNED)
        .map((row) => ({
          name: row.ownerName ?? "Former teammate",
          touches: row.current.calls + row.current.meetings,
        }))
        .filter((rep) => rep.touches > 0)
        .sort((a, b) => b.touches - a.touches)
        .slice(0, TOP_REPS),
    };
  },
});

export const dealSide = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const { current, previous } = periodWindows("7d", now);
    const [deals, created, accounts, stages] = await Promise.all([
      dealsSince(ctx, previous.start, true),
      ctx.db
        .query("deals")
        .withIndex("by_creation_time", (q) =>
          q.gte("_creationTime", previous.start),
        )
        .collect(),
      platformAccounts(ctx),
      ctx.db.query("activationStages").collect(),
    ]);
    const thisWeek = pipeline(deals, undefined, current);
    const lastWeek = pipeline(deals, undefined, previous);

    let stuck = 0;
    for (const account of accounts) {
      if (await accountStall(ctx, account, now)) stuck++;
    }
    const orgs = new Set(
      accounts.flatMap((account) => account.platformOrgId ?? []),
    );
    const wentLive = (window: { start: number; end: number }) =>
      stages.filter((row) => {
        const at = row.stages.live;
        return (
          row.orgId !== undefined &&
          orgs.has(row.orgId) &&
          at !== undefined &&
          at >= window.start &&
          at < window.end
        );
      }).length;
    const createdIn = (window: { start: number; end: number }) =>
      created.filter(
        (deal) =>
          deal._creationTime >= window.start && deal._creationTime < window.end,
      ).length;

    return {
      window: current,
      dealsCreated: {
        current: createdIn(current),
        previous: createdIn(previous),
      },
      won: { current: thisWeek.won, previous: lastWeek.won },
      lost: { current: thisWeek.lost, previous: lastWeek.lost },
      open: {
        count: thisWeek.open.reduce((sum, stage) => sum + stage.count, 0),
        totals: thisWeek.openTotals,
      },
      stuck,
      live: { current: wentLive(current), previous: wentLive(previous) },
    };
  },
});

export const recipients = internalQuery({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(200);
    return members
      .filter(
        (member) =>
          ROLE_RANK[member.role] >= ROLE_RANK.manager &&
          member.weeklyOff !== true,
      )
      .map(({ _id, name, email }) => ({ _id, name, email }));
  },
});

async function gather(ctx: ActionCtx): Promise<Omit<WeeklyReportData, "name">> {
  const [lead, team, deal] = await Promise.all([
    ctx.runQuery(internal.weekly.leadSide, {}),
    ctx.runQuery(internal.weekly.teamSide, {}),
    ctx.runQuery(internal.weekly.dealSide, {}),
  ]);
  return {
    ...lead,
    ...team,
    ...deal,
    reportsUrl: siteUrl("/reports"),
    activityUrl: siteUrl("/activity"),
  };
}

/** The email a manager would get now, without sending it. */
export const preview = internalAction({
  args: { memberId: v.optional(v.id("members")) },
  handler: async (
    ctx,
    { memberId },
  ): Promise<{ subject: string; body: string }> => {
    const people = await ctx.runQuery(internal.weekly.recipients, {});
    const member = people.find((item) => item._id === memberId);
    return weeklyReport({
      ...(await gather(ctx)),
      name: member?.name.split(" ")[0] ?? "",
    });
  },
});

export const send = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    try {
      const { provider, problem } = emailProvider();
      if (provider === "outbox") {
        console.log(
          `Weekly report skipped: no email provider${problem ? ` (${problem})` : ""}`,
        );
        return;
      }
      const people = await ctx.runQuery(internal.weekly.recipients, {});
      if (people.length === 0) return;
      const data = await gather(ctx);
      const day = istDay(Date.now());
      for (const member of people) {
        const { subject, body } = weeklyReport({
          ...data,
          name: member.name.split(" ")[0],
        });
        const result = await deliver(ctx, {
          channel: "email",
          provider,
          stepKey: `weekly-${member._id}-${day}`,
          recipientId: member._id,
          to: member.email,
          subject,
          body,
        });
        if (!result.ok) {
          console.error(
            `Weekly report to ${member._id} failed: ${result.error}`,
          );
        }
      }
    } catch (error) {
      console.error("Weekly report failed:", error);
    }
  },
});
