import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { memberQuery } from "./lib/functions";
import { memberIndex } from "./lib/records";
import { leadSlaSeconds } from "./lib/leads";
import {
  PERIODS,
  UNASSIGNED,
  buildReport,
  periodWindows,
  teamReport,
} from "./lib/reports";
import { literals } from "./lib/validators";

const vPeriod = literals(PERIODS);

// Reports read whole accounts and events tables (the overview also leads and
// deals), fine at pilot scale; move to aggregates past ~10k rows per table.

async function names(ctx: QueryCtx) {
  const members = await memberIndex(ctx);
  return (id: string) =>
    id === UNASSIGNED
      ? null
      : (members.get(id as Id<"members">)?.name ?? "Former teammate");
}

/** Only people with a platform user feed the reports, through their signups. */
function platformPeople(ctx: QueryCtx) {
  return ctx.db
    .query("people")
    .withIndex("by_platform_user", (q) => q.gt("platformUserId", ""))
    .collect();
}

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
      platformPeople(ctx),
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
    const now = Date.now();
    const since = periodWindows(args.period, now).previous.start;
    const [leads, tasks, timeline, deals, accounts, people, events, members] =
      await Promise.all([
        ctx.db
          .query("leads")
          .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
          .collect(),
        ctx.db.query("tasks").collect(),
        Promise.all(
          (["call", "meeting"] as const).map((kind) =>
            ctx.db
              .query("timeline")
              .withIndex("by_kind", (q) =>
                q.eq("kind", kind).gte("occurredAt", since),
              )
              .collect(),
          ),
        ).then((rows) => rows.flat()),
        Promise.all(
          (["won", "lost"] as const).map((stage) =>
            ctx.db
              .query("deals")
              .withIndex("by_stage_closed", (q) =>
                q.eq("stage", stage).gte("closedAt", since),
              )
              .collect(),
          ),
        ).then((rows) => rows.flat()),
        ctx.db.query("accounts").collect(),
        platformPeople(ctx),
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
      now,
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
