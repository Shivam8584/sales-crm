import { dayStart, istDay } from "./day";
import type { DealStage } from "./enums";
import { CURRENCIES, type Currency, type Money } from "./money";

export type OpenDealStage = Exclude<DealStage, "won" | "lost">;

export const OPEN_DEAL_STAGES = [
  "discovery",
  "demo",
  "proposal",
  "onboarding",
] as const satisfies readonly OpenDealStage[];

/**
 * The chance a deal at each stage closes won, in basis points. Working
 * assumptions, not measured win rates: revisit once a quarter of closed deals
 * gives real stage-to-won rates.
 */
export const STAGE_PROBABILITY_BPS: Record<OpenDealStage, number> = {
  discovery: 1_000,
  demo: 2_500,
  proposal: 5_000,
  onboarding: 9_000,
};

/** Open deals at these stages count as commit when they close this month. */
export const COMMIT_STAGES: readonly OpenDealStage[] = [
  "proposal",
  "onboarding",
];

/** Amount × stage probability, rounded to the minor unit. */
export function weightedAmount(amount: number, stage: OpenDealStage) {
  return Math.round((amount * STAGE_PROBABILITY_BPS[stage]) / 10_000);
}

export type ForecastDeal = {
  stage: OpenDealStage;
  amount: Money;
  closeDate?: string;
};

export type Slice = { count: number; amount: number; weighted: number };

export type CurrencyForecast = {
  currency: Currency;
  stages: ({ stage: OpenDealStage } & Slice)[];
  /** Proposal+ deals closing from today to the end of this month. */
  commit: Slice;
  /** Every open deal closing from today to the end of next month. */
  bestCase: Slice;
  slipped: Slice;
  wonSoFar: number;
  /** Won so far plus the stage-weighted commit. */
  landing: number;
};

/** An open deal is slipped once its close date is before today; no date is not slipped. */
export const isSlipped = (
  deal: Pick<ForecastDeal, "closeDate">,
  today: string,
) => deal.closeDate !== undefined && deal.closeDate < today;

/** Per-currency forecast as of `today`; currencies are never mixed. */
export function forecastSummary(
  open: ForecastDeal[],
  won: Money[],
  today: string,
): CurrencyForecast[] {
  const month = today.slice(0, 7);
  const next = shiftPeriod(month, 1);
  const empty = (): Slice => ({ count: 0, amount: 0, weighted: 0 });
  const add = (slice: Slice, deal: ForecastDeal) => {
    slice.count++;
    slice.amount += deal.amount.amount;
    slice.weighted += weightedAmount(deal.amount.amount, deal.stage);
  };
  const currencies = CURRENCIES.filter(
    (currency) =>
      open.some((deal) => deal.amount.currency === currency) ||
      won.some((value) => value.currency === currency),
  );
  return currencies.map((currency) => {
    const stages = OPEN_DEAL_STAGES.map((stage) => ({
      stage,
      ...empty(),
    }));
    const commit = empty();
    const bestCase = empty();
    const slipped = empty();
    for (const deal of open) {
      if (deal.amount.currency !== currency) continue;
      add(stages.find((slice) => slice.stage === deal.stage)!, deal);
      if (isSlipped(deal, today)) add(slipped, deal);
      if (!deal.closeDate || deal.closeDate < today) continue;
      const closes = deal.closeDate.slice(0, 7);
      if (closes === month || closes === next) add(bestCase, deal);
      if (closes === month && COMMIT_STAGES.includes(deal.stage)) {
        add(commit, deal);
      }
    }
    const wonSoFar = won
      .filter((value) => value.currency === currency)
      .reduce((sum, value) => sum + value.amount, 0);
    return {
      currency,
      stages,
      commit,
      bestCase,
      slipped,
      wonSoFar,
      landing: wonSoFar + commit.weighted,
    };
  });
}

export const TARGET_METRICS = [
  "won_take",
  "activations",
  "new_leads_converted",
  "calls_logged",
] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const TARGET_METRIC_LABEL: Record<TargetMetric, string> = {
  won_take: "Won take",
  activations: "Activations",
  new_leads_converted: "Leads converted",
  calls_logged: "Calls and meetings",
};

/** Actual ÷ the target scaled to the time elapsed; at or above this is ahead. */
export const PACE_AHEAD_RATIO = 1.1;
/** Below this is behind. */
export const PACE_BEHIND_RATIO = 0.9;
/** Before this share of the month has passed there is no pace to judge. */
export const PACE_MIN_SHARE = 0.1;

export type Pace = "ahead" | "on track" | "behind";

export function paceOf(
  actual: number,
  target: number | null,
  share: number,
): Pace | null {
  if (!target || target <= 0) return null;
  if (actual >= target) return "ahead";
  if (share < PACE_MIN_SHARE) return null;
  const ratio = actual / (target * share);
  if (ratio >= PACE_AHEAD_RATIO) return "ahead";
  return ratio >= PACE_BEHIND_RATIO ? "on track" : "behind";
}

export function attain(actual: number, target: number | null, share: number) {
  const goal = target && target > 0 ? target : null;
  return {
    actual,
    target: goal,
    pct: goal === null ? null : Math.round((actual / goal) * 100),
    pace: paceOf(actual, goal, share),
  };
}

export type Attainment = ReturnType<typeof attain>;

/** A month as `YYYY-MM`. */
export const isPeriod = (value: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export const currentPeriod = (now = Date.now()) => istDay(now).slice(0, 7);

export function shiftPeriod(period: string, by: number) {
  const index =
    Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1 + by;
  const month = String((index % 12) + 1).padStart(2, "0");
  return `${Math.floor(index / 12)}-${month}`;
}

/** A month in India time: [start, end) in epoch ms, and the share of it elapsed at `now`. */
export function monthWindow(period: string, now: number) {
  const start = dayStart(`${period}-01`);
  const end = dayStart(`${shiftPeriod(period, 1)}-01`);
  const share = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return { start, end, share };
}
