import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { DealStage } from "../lib/domain/enums";
import { ACTIVATION_STAGES } from "../lib/domain/platform";
import { memberQuery } from "./lib/functions";
import { uniqueById } from "./lib/lists";
import { memberIndex } from "./lib/records";
import { leadSlaSeconds } from "./lib/leads";
import {
  PERIODS,
  UNASSIGNED,
  buildReport,
  factsOfRows,
  istDay,
  periodWindows,
  sourceOf,
  teamReport,
} from "./lib/reports";
import { literals } from "./lib/validators";

const vPeriod = literals(PERIODS);

// Reads are bounded by the two periods compared (leads, accounts and deals
// created in them) and by platform size (platform accounts, people and the
// `activationStages` rows), never by the size of the leads, accounts or
// platform-events tables.

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

const leadsSince = (ctx: QueryCtx, since: number) =>
  ctx.db
    .query("leads")
    .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
    .collect();

const accountsSince = (ctx: QueryCtx, since: number) =>
  ctx.db
    .query("accounts")
    .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
    .collect();

function platformAccounts(ctx: QueryCtx) {
  return ctx.db
    .query("accounts")
    .withIndex("by_platform_org", (q) => q.gt("platformOrgId", ""))
    .collect();
}

async function stageFacts(ctx: QueryCtx) {
  return factsOfRows(await ctx.db.query("activationStages").collect());
}

/**
 * The source of each converted account's first lead. One range read: reading
 * per account would exceed the per-query read-call limit.
 */
async function firstLeadSources(ctx: QueryCtx) {
  const leads = await ctx.db
    .query("leads")
    .withIndex("by_account", (q) => q.gt("accountId", "" as Id<"accounts">))
    .collect();
  const sources = new Map<string, string>();
  for (const lead of leads) {
    if (lead.accountId && !sources.has(lead.accountId)) {
      sources.set(lead.accountId, sourceOf(lead).key);
    }
  }
  return sources;
}

async function accountsById(ctx: QueryCtx, ids: Id<"accounts">[]) {
  const found = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return found.filter((account) => account !== null);
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
    const since = periodWindows(args.period, now).previous.start;
    const [
      leads,
      created,
      onPlatform,
      people,
      facts,
      accountSource,
      deals,
      owner,
    ] = await Promise.all([
      leadsSince(ctx, since),
      accountsSince(ctx, since),
      platformAccounts(ctx),
      platformPeople(ctx),
      stageFacts(ctx),
      firstLeadSources(ctx),
      dealsSince(ctx, since, true),
      names(ctx),
    ]);
    const known = uniqueById([...created, ...onPlatform]);
    const seen = new Set<string>(known.map((account) => account._id));
    const linked = [...new Set(leads.flatMap((lead) => lead.accountId ?? []))];
    const accounts = [
      ...known,
      ...(await accountsById(
        ctx,
        linked.filter((id) => !seen.has(id)),
      )),
    ];
    const report = buildReport({
      leads,
      accounts,
      people,
      facts,
      accountSource,
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

/**
 * Accounts that can sit past "converted" on the funnel: those in a platform
 * stage, with a platform org, or with a platform user.
 */
async function platformReached(
  ctx: QueryCtx,
  onPlatform: Doc<"accounts">[],
  people: Doc<"people">[],
) {
  const byStage = await Promise.all(
    [...ACTIVATION_STAGES, "expanding" as const].map((stage) =>
      ctx.db
        .query("accounts")
        .withIndex("by_stage", (q) => q.eq("stage", stage))
        .collect(),
    ),
  );
  const known = uniqueById([...onPlatform, ...byStage.flat()]);
  const seen = new Set<string>(known.map((account) => account._id));
  const missing = people.flatMap((person) =>
    person.accountId && !seen.has(person.accountId) ? person.accountId : [],
  );
  return [...known, ...(await accountsById(ctx, [...new Set(missing)]))];
}

/** Rep leaderboard for the period and the one before it. */
export const team = memberQuery({
  args: { period: vPeriod },
  handler: async (ctx, args) => {
    const now = Date.now();
    const since = periodWindows(args.period, now).previous.start;
    const today = istDay(now);
    const [leads, tasks, timeline, deals, onPlatform, people, facts, members] =
      await Promise.all([
        leadsSince(ctx, since),
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
        platformAccounts(ctx),
        platformPeople(ctx),
        stageFacts(ctx),
        ctx.db
          .query("members")
          .withIndex("by_status", (q) => q.eq("status", "active"))
          .collect(),
      ]);
    const owner = await names(ctx);
    const accounts = await platformReached(ctx, onPlatform, people);
    const report = teamReport({
      leads,
      tasks,
      interactions: timeline.map(interaction),
      deals,
      accounts,
      people,
      facts,
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
