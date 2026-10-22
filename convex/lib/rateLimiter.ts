import { MINUTE, HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

const DAY = 24 * HOUR;

/** An IST midnight, so daily windows roll over at 00:00 India time. */
export const IST_MIDNIGHT = Date.UTC(2024, 0, 1) - 5.5 * HOUR;

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  leadForm: { kind: "fixed window", rate: 5, period: MINUTE },
  enrichment: { kind: "fixed window", rate: 20, period: MINUTE },
  fileUpload: { kind: "fixed window", rate: 30, period: MINUTE },
  testEmail: { kind: "fixed window", rate: 10, period: HOUR },
  calls: { kind: "fixed window", rate: 20, period: MINUTE },
  productChecks: { kind: "fixed window", rate: 300, period: HOUR },
  /** Model calls per member per IST day. */
  ai: { kind: "fixed window", rate: 100, period: DAY, start: IST_MIDNIGHT },
  /** One token per message for 30 days: a second delivery of the same message is a duplicate. */
  inboundMessage: {
    kind: "token bucket",
    rate: 1,
    period: 30 * DAY,
    capacity: 1,
  },
});

/** Per-automation daily send cap, counted per IST day. */
export function dailySendCap(rate: number) {
  return {
    kind: "fixed window",
    rate,
    period: DAY,
    start: IST_MIDNIGHT,
  } as const;
}
