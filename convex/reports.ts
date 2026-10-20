import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { memberQuery } from "./lib/functions";
import { memberIndex } from "./lib/records";
import { slaSeconds } from "./lib/leads";
import { PERIODS, UNASSIGNED, buildReport } from "./lib/reports";
import { literals } from "./lib/validators";

/**
 * The whole reports page in one query. Reads every lead, account, deal and
 * platform event, which is fine at pilot scale; move to aggregates past ~10k rows.
 */
export const overview = memberQuery({
  args: {
    period: literals(PERIODS),
    source: v.optional(v.string()),
    owner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [leads, accounts, people, events, deals, members] = await Promise.all(
      [
        ctx.db.query("leads").collect(),
        ctx.db.query("accounts").collect(),
        ctx.db.query("people").collect(),
        ctx.db.query("platformEvents").collect(),
        ctx.db.query("deals").collect(),
        memberIndex(ctx),
      ],
    );
    const report = buildReport({
      leads,
      accounts,
      people,
      events,
      deals,
      slaMs: slaSeconds() * 1000,
      now: Date.now(),
      period: args.period,
      filters: { source: args.source, owner: args.owner },
    });
    const owner = (id: string) =>
      id === UNASSIGNED
        ? null
        : (members.get(id as Id<"members">)?.name ?? "Former teammate");
    return {
      ...report,
      speedByOwner: report.speedByOwner.map((row) => ({
        ...row,
        ownerName: owner(row.ownerId),
      })),
    };
  },
});
