import type { DealStage } from "./enums";

export type OpenDealStage = Exclude<DealStage, "won" | "lost">;

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

/** Amount × stage probability, rounded to the minor unit. */
export function weightedAmount(amount: number, stage: OpenDealStage) {
  return Math.round((amount * STAGE_PROBABILITY_BPS[stage]) / 10_000);
}
