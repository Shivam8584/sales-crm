import { formatMoney } from "./money";
import { LOW_BALANCE_FLOOR_PAISE, marketplaceLabel } from "./platform";

/**
 * Account health v1: a 0–100 score from how a brand is using Hypedrive, with
 * every factor explained, plus the signals that say it's ready to buy more.
 * Pure so the same numbers show in the sidebar, the activation desk and tests.
 */

const DAY = 24 * 60 * 60_000;

export type HealthCampaign = {
  id: string;
  title?: string;
  status: string;
  pauseReason?: string;
  /** Enrolled over the cap, 0–100+; null when uncapped or unknown. */
  fillPct: number | null;
  endedAt?: number;
};

export type HealthInput = {
  now: number;
  /** Spendable balance; null when the platform hasn't been read. */
  balancePaise: number | null;
  wallet: "ok" | "low" | "negative";
  campaigns: HealthCampaign[];
  deposits30dPaise: number;
  deposits90dPaise: number;
  /** Top-ups and bank deposits, all time. */
  fundingCount: number;
  staleReviews: number;
  oldestReviewDays: number | null;
  disputes: number;
  lastActivityAt: number | null;
  marketplaces: { slug: string; firstAt: number }[];
  membersJoined30d: number;
};

export const HEALTH_FACTORS = [
  { id: "funding", label: "Funding", weight: 20 },
  { id: "campaigns", label: "Live campaigns", weight: 25 },
  { id: "fill", label: "Slot fill", weight: 15 },
  { id: "reviews", label: "Review backlog", weight: 15 },
  { id: "disputes", label: "Disputes", weight: 10 },
  { id: "recency", label: "Recent activity", weight: 15 },
] as const;
export type HealthFactorId = (typeof HEALTH_FACTORS)[number]["id"];

export type FactorTone = "good" | "warn" | "bad";

export type HealthFactor = {
  id: HealthFactorId;
  label: string;
  weight: number;
  /** 0–1. */
  score: number;
  points: number;
  detail: string;
  tone: FactorTone;
};

export const HEALTH_BANDS = ["healthy", "watch", "at_risk"] as const;
export type HealthBand = (typeof HEALTH_BANDS)[number];

export const HEALTH_BAND_LABEL: Record<HealthBand, string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At risk",
};

export const EXPANSION_SIGNALS = [
  "sold_out",
  "repeat_topup",
  "new_marketplace",
  "renewal_due",
  "team_growth",
] as const;
export type ExpansionSignalId = (typeof EXPANSION_SIGNALS)[number];

export const EXPANSION_SIGNAL_LABEL: Record<ExpansionSignalId, string> = {
  sold_out: "Sold out",
  repeat_topup: "Repeat top-ups",
  new_marketplace: "New marketplace",
  renewal_due: "Renewal due",
  team_growth: "Team growing",
};

export type ExpansionSignal = {
  id: ExpansionSignalId;
  label: string;
  detail: string;
};

export type Health = {
  score: number;
  band: HealthBand;
  factors: HealthFactor[];
  signals: ExpansionSignal[];
};

export function healthBand(score: number): HealthBand {
  if (score >= 70) return "healthy";
  if (score >= 45) return "watch";
  return "at_risk";
}

const inr = (paise: number) => formatMoney({ amount: paise, currency: "INR" });
const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;
const tone = (score: number): FactorTone =>
  score >= 0.75 ? "good" : score >= 0.4 ? "warn" : "bad";

const OPEN = [
  "live",
  "paused",
  "scheduled",
  "pending_review",
  "draft",
  "changes_requested",
];

type Rated = { score: number; detail: string };

/** Has a campaign ever run; before that, the usage factors have nothing to measure. */
const hasRun = (input: HealthInput) =>
  input.campaigns.some((item) =>
    ["live", "paused", "ended", "archived"].includes(item.status),
  );
const NOT_RUN: Rated = { score: 0.5, detail: "No campaign has run yet" };

function funding(input: HealthInput): Rated {
  if (input.wallet === "negative")
    return { score: 0, detail: "Wallet is negative" };
  if (input.fundingCount === 0 && input.deposits90dPaise === 0)
    return { score: 0, detail: "Never funded" };
  if (
    input.wallet === "low" ||
    (input.balancePaise !== null &&
      input.balancePaise < LOW_BALANCE_FLOOR_PAISE)
  ) {
    return {
      score: 0.35,
      detail:
        input.balancePaise === null
          ? "Balance below ₹5,000"
          : `${inr(input.balancePaise)} left, under ₹5,000`,
    };
  }
  if (input.balancePaise !== null) {
    return {
      score: input.deposits90dPaise > 0 || input.fundingCount > 0 ? 1 : 0.8,
      detail: `${inr(input.balancePaise)} available`,
    };
  }
  if (input.deposits90dPaise > 0) {
    return {
      score: 0.8,
      detail: `${inr(input.deposits90dPaise)} added in 90 days`,
    };
  }
  if (input.fundingCount > 0)
    return { score: 0.5, detail: "No deposits in 90 days" };
  return { score: 0, detail: "Never funded" };
}

function campaigns(input: HealthInput): Rated {
  const by = (status: string) =>
    input.campaigns.filter((item) => item.status === status);
  const starved = by("paused").filter(
    (item) => item.pauseReason === "insufficient_funds",
  );
  if (starved.length)
    return {
      score: 0,
      detail: `${plural(starved.length, "campaign")} paused for funds`,
    };
  const live = by("live").length;
  if (live) return { score: 1, detail: `${live} live` };
  const coming = by("scheduled").length + by("pending_review").length;
  if (coming) return { score: 0.6, detail: `${coming} in review or scheduled` };
  const stalled = by("paused").length + by("changes_requested").length;
  if (stalled) return { score: 0.3, detail: `${stalled} paused or sent back` };
  return { score: 0, detail: "Nothing live" };
}

function fill(input: HealthInput): Rated {
  if (!hasRun(input)) return NOT_RUN;
  const live = input.campaigns.filter(
    (item) => item.status === "live" && item.fillPct !== null,
  );
  if (live.length === 0) return { score: 0.5, detail: "No live slots to fill" };
  const average =
    live.reduce((sum, item) => sum + Math.min(100, item.fillPct!), 0) /
    live.length;
  return {
    score: Math.min(1, average / 70),
    detail: `${Math.round(average)}% filled on average`,
  };
}

function reviews(input: HealthInput): Rated {
  if (!hasRun(input)) return NOT_RUN;
  if (input.staleReviews <= 0)
    return { score: 1, detail: "No results waiting" };
  const days = input.oldestReviewDays ?? 3;
  const score = days >= 14 ? 0 : days >= 7 ? 0.3 : 0.6;
  return {
    score,
    detail: `${input.staleReviews} waiting, oldest ${days} days`,
  };
}

function disputes(input: HealthInput): Rated {
  if (!hasRun(input)) return NOT_RUN;
  const open = input.disputes;
  const score = open === 0 ? 1 : open === 1 ? 0.6 : open <= 3 ? 0.3 : 0;
  return { score, detail: open === 0 ? "None open" : `${open} open` };
}

function recency(input: HealthInput): Rated {
  if (input.lastActivityAt === null)
    return { score: 0, detail: "No activity yet" };
  const days = Math.max(
    0,
    Math.floor((input.now - input.lastActivityAt) / DAY),
  );
  const score =
    days <= 7 ? 1 : days <= 14 ? 0.7 : days <= 30 ? 0.4 : days <= 60 ? 0.15 : 0;
  return {
    score,
    detail:
      days === 0 ? "Active today" : `Last active ${plural(days, "day")} ago`,
  };
}

const RATERS: Record<HealthFactorId, (input: HealthInput) => Rated> = {
  funding,
  campaigns,
  fill,
  reviews,
  disputes,
  recency,
};

export function expansionSignals(input: HealthInput): ExpansionSignal[] {
  const signals: ExpansionSignal[] = [];
  const add = (id: ExpansionSignalId, detail: string) =>
    signals.push({ id, label: EXPANSION_SIGNAL_LABEL[id], detail });

  const full = input.campaigns.filter(
    (item) => item.status === "live" && (item.fillPct ?? 0) >= 100,
  );
  if (full.length) {
    add(
      "sold_out",
      full.length === 1 && full[0].title
        ? `“${full[0].title}” has no slots left`
        : `${plural(full.length, "live campaign")} with no slots left`,
    );
  }
  if (input.fundingCount >= 3) {
    add("repeat_topup", `${input.fundingCount} top-ups and deposits so far`);
  }
  const markets = [...input.marketplaces].sort((a, b) => a.firstAt - b.firstAt);
  const fresh = markets
    .slice(1)
    .filter((item) => input.now - item.firstAt <= 30 * DAY);
  if (fresh.length) {
    add(
      "new_marketplace",
      `Started listing on ${fresh.map((item) => marketplaceLabel(item.slug)).join(", ")}`,
    );
  }
  const open = input.campaigns.some((item) => OPEN.includes(item.status));
  const ended = input.campaigns
    .filter((item) => item.status === "ended" && item.endedAt)
    .sort((a, b) => b.endedAt! - a.endedAt!)[0];
  if (!open && ended && input.now - ended.endedAt! <= 30 * DAY) {
    const days = Math.floor((input.now - ended.endedAt!) / DAY);
    add(
      "renewal_due",
      `Last campaign ended ${days === 0 ? "today" : `${plural(days, "day")} ago`}`,
    );
  }
  if (input.membersJoined30d > 0) {
    add(
      "team_growth",
      `${plural(input.membersJoined30d, "new team member")} in 30 days`,
    );
  }
  return signals;
}

export function accountHealth(input: HealthInput): Health {
  const factors = HEALTH_FACTORS.map((factor) => {
    const rated = RATERS[factor.id](input);
    const score = Math.max(0, Math.min(1, rated.score));
    return {
      id: factor.id,
      label: factor.label,
      weight: factor.weight,
      score,
      points: Math.round(score * factor.weight * 10) / 10,
      detail: rated.detail,
      tone: tone(score),
    };
  });
  const score = Math.round(
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0),
  );
  return {
    score,
    band: healthBand(score),
    factors,
    signals: expansionSignals(input),
  };
}

/** The factors costing the most points, worst first. */
export function weakestFactors(health: Health, limit = 2) {
  return [...health.factors]
    .filter((factor) => factor.score < 0.75)
    .sort(
      (a, b) =>
        (1 - b.score) * b.weight - (1 - a.score) * a.weight ||
        b.weight - a.weight,
    )
    .slice(0, limit);
}
