import { v, type Validator } from "convex/values";
import * as enums from "../../lib/domain/enums";
import { CURRENCIES } from "../../lib/domain/money";

export function literals<const T extends readonly [string, ...string[]]>(
  values: T,
): Validator<T[number]> {
  const [first, second, ...rest] = values.map((value) => v.literal(value));
  return (second ? v.union(first, second, ...rest) : first) as Validator<
    T[number]
  >;
}

export const vRole = literals(enums.ROLES);
export const vMemberStatus = literals(enums.MEMBER_STATUSES);
export const vLifecycleStage = literals(enums.LIFECYCLE_STAGES);
export const vLeadKind = literals(enums.LEAD_KINDS);
export const vLeadStatus = literals(enums.LEAD_STATUSES);
export const vFactStatus = literals(enums.FACT_STATUSES);
export const vRunStatus = literals(enums.RUN_STATUSES);
export const vDisqualifyReason = literals(enums.DISQUALIFY_REASONS);
export const vDealStage = literals(enums.DEAL_STAGES);
export const vTaskStatus = literals(enums.TASK_STATUSES);
export const vPriority = literals(enums.PRIORITIES);
export const vTimelineKind = literals(enums.TIMELINE_KINDS);
export const vCallOutcome = literals(enums.CALL_OUTCOMES);
export const vChannel = literals(enums.CHANNELS);
export const vCurrency = literals(CURRENCIES);

/** Integer minor units; mutations check it with `assertMoney`. */
export const vMoney = v.object({ amount: v.number(), currency: vCurrency });

/** Calendar day as `YYYY-MM-DD`, for due and close dates that have no time. */
export const vDay = v.string();

export const vUtm = v.object({
  source: v.optional(v.string()),
  medium: v.optional(v.string()),
  campaign: v.optional(v.string()),
  term: v.optional(v.string()),
  content: v.optional(v.string()),
});
