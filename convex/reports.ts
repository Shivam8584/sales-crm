import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { DealStage } from "../lib/domain/enums";
import { memberQuery } from "./lib/functions";
import { memberIndex } from "./lib/records";
import { leadSlaSeconds } from "./lib/leads";
import {
  PERIODS,
  UNASSIGNED,
  buildReport,
  istDay,
  periodWindows,
  teamReport,
} from "./lib/reports";
import { literals } from "./lib/validators";

const vPeriod = literals(PERIODS);

// Reports still read whole accounts, leads and platform-events tables: the
// funnel needs every org's first event per stage and every lead's account link.
// Move those to aggregates past ~10k rows per table.

const OPEN_STAGES = ["discovery", "demo", "proposal", "onboarding"] as const;
const CLOSED_STAGES = ["won", "lost"] as const;

/** Deals closed since `since`, plus the open ones when asked for. */
async function dealsSince(ctx: QueryCtx, since: number, open: boolean) {
  const byStage = (stage: DealStage, from?: number) =>
    ctx.db
      .query("deals")
      .withIndex("by_stage_closed", (q) =>
        from === undefined
          ? q.eq("stage", stage)
          : q.eq("stage", stage).gte("closedAt", from),
      )
      .collect();
  const rows = await Promise.all([
    ...CLOSED_STAGES.map((stage) => byStage(stage, since)),
    ...(open ? OPEN_STAGES.map((stage) => byStage(stage)) : []),
  ]);
  return rows.flat();
}

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
    const now = Date.now();
    const [leads, accounts, people, events, deals, owner] = await Promise.all([
      ctx.db.query("leads").collect(),
      ctx.db.query("accounts").collect(),
      platformPeople(ctx),
      ctx.db.query("platformEvents").collect(),
      dealsSince(ctx, periodWindows(args.period, now).previous.start, true),
      names(ctx),
    ]);
    const report = buildReport({
      leads,
      accounts,
      people,
      events,
      deals,
      slaMs: (await leadSlaSeconds(ctx)) * 1000,
      now,
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
    const today = istDay(now);
    const [leads, tasks, timeline, deals, accounts, people, events, members] =
      await Promise.all([
        ctx.db
          .query("leads")
          .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
          .collect(),
        Promise.all([
          ...(["todo", "in_progress"] as const).map((status) =>
            ctx.db
              .query("tasks")
              .withIndex("by_status_due", (q) =>
                q.eq("status", status).gt("dueDate", "").lt("dueDate", today),
              )
              .collect(),
          ),
          ctx.db
            .query("tasks")
            .withIndex("by_status_completed", (q) =>
              q.eq("status", "done").gte("completedAt", since),
            )
            .collect(),
        ]).then((rows) => rows.flat()),
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
        dealsSince(ctx, since, false),
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
