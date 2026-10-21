import type { DealStage } from "./enums";

/**
 * Sales forecast settings. Weighted pipeline = Σ deal amount × the chance a
 * deal at its stage closes won, in basis points (1% = 100). These are the
 * company's working assumptions, not measured win rates: revisit them once a
 * quarter of closed deals gives real stage-to-won rates.
 */
export const OPEN_DEAL_STAGES = [
  "discovery",
  "demo",
  "proposal",
  "onboarding",
] as const satisfies readonly DealStage[];
export type OpenDealStage = (typeof OPEN_DEAL_STAGES)[number];

export const STAGE_PROBABILITY_BPS: Record<OpenDealStage, number> = {
  discovery: 1_000,
  demo: 2_500,
  proposal: 5_000,
  onboarding: 9_000,
};

/**
 * Commit: open deals whose current proposal has been sent or accepted, so the
 * brand holds a firm price. Best case: every open deal at full value.
 */
export const COMMIT_PROPOSAL_STATUSES = ["sent", "accepted"] as const;

/** How many calendar months the forecast shows before folding the rest into "Later". */
export const FORECAST_MONTHS = 6;

export const isOpenDealStage = (stage: DealStage): stage is OpenDealStage =>
  (OPEN_DEAL_STAGES as readonly string[]).includes(stage);

/** Amount × stage probability, rounded to the minor unit. */
export function weightedAmount(amount: number, stage: OpenDealStage) {
  return Math.round((amount * STAGE_PROBABILITY_BPS[stage]) / 10_000);
}
