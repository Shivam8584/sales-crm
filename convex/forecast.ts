import { v } from "convex/values";
import { daysBetween, istDay } from "../lib/domain/day";
import {
  forecastSummary,
  isSlipped,
  monthWindow,
  type ForecastDeal,
  type OpenDealStage,
} from "../lib/domain/forecast";
import { memberQuery } from "./lib/functions";
import { memberIndex } from "./lib/records";
import { dealsSince } from "./reports";

const SLIPPED_SHOWN = 5;

/**
 * Open pipeline and where this month is likely to land. Reads the open deals
 * plus this month's closed ones through the stage/closed index, so it grows
 * with the open pipeline, not with deal history.
 */
export const report = memberQuery({
  args: { owner: v.optional(v.string()) },
  handler: async (ctx, { owner }) => {
    const now = Date.now();
    const today = istDay(now);
    const period = today.slice(0, 7);
    const [rows, members, targets] = await Promise.all([
      dealsSince(ctx, monthWindow(period, now).start, true),
      memberIndex(ctx),
      ctx.db
        .query("targets")
        .withIndex("by_period", (q) => q.eq("period", period))
        .collect(),
    ]);
    const deals = rows.filter((deal) => !owner || deal.ownerId === owner);
    const open = deals.flatMap((deal) =>
      deal.stage === "won" || deal.stage === "lost"
        ? []
        : [{ deal, stage: deal.stage as OpenDealStage }],
    );
    const input: ForecastDeal[] = open.map(({ deal, stage }) => ({
      stage,
      amount: deal.amount,
      closeDate: deal.closeDate,
    }));
    const slipped = open
      .filter((_, index) => isSlipped(input[index], today))
      .map(({ deal, stage }) => ({
        deal,
        stage,
        daysLate: daysBetween(deal.closeDate!, today),
      }))
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, SLIPPED_SHOWN);
    const accounts = await Promise.all(
      slipped.map(({ deal }) => ctx.db.get(deal.accountId)),
    );

    return {
      today,
      currencies: forecastSummary(
        input,
        deals.filter((deal) => deal.stage === "won").map((deal) => deal.amount),
        today,
      ),
      slipped: slipped.map(({ deal, stage, daysLate }, index) => ({
        _id: deal._id,
        title: deal.title,
        stage,
        amount: deal.amount,
        closeDate: deal.closeDate!,
        daysLate,
        accountName: accounts[index]?.name ?? "",
        ownerName: members.get(deal.ownerId)?.name ?? "Former teammate",
      })),
      target:
        targets.find(
          (row) => row.metric === "won_take" && row.scope === (owner ?? "team"),
        )?.value ?? null,
    };
  },
});
