/**
 * The results report for one brand account: what the Hypedrive platform
 * recorded in a month or quarter, in India time. Pure, so the page, the
 * monthly email and the tests share one definition of every number.
 */
import { dayStart, istDay } from "./day";
import { formatMoney } from "./money";
import {
  CAMPAIGN_STATUS_LABEL,
  isFundingEvent,
  type ActivationStage,
  type CampaignStatus,
} from "./platform";
import {
  isOpenCampaign,
  platformState,
  type StateEvent,
} from "./platform-state";

export const REPORT_KINDS = ["month", "quarter"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportPeriod = {
  kind: ReportKind;
  /** `2026-09` for a month, `2026-Q3` for a quarter. */
  key: string;
  label: string;
  /** Start of the first day, and start of the day after the last (exclusive). */
  from: number;
  to: number;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (value: number) => String(value).padStart(2, "0");
const firstOfMonth = (year: number, month: number) =>
  `${year}-${pad(month)}-01`;

/** `month` is 1 to 12; the span covers `months` calendar months from it. */
function span(
  kind: ReportKind,
  year: number,
  month: number,
  months: number,
): ReportPeriod {
  const end = new Date(Date.UTC(year, month - 1 + months, 1));
  const first = MONTHS[month - 1].slice(0, 3);
  const last = MONTHS[(month + months - 2) % 12].slice(0, 3);
  return {
    kind,
    key:
      kind === "month"
        ? `${year}-${pad(month)}`
        : `${year}-Q${Math.floor((month - 1) / 3) + 1}`,
    label:
      kind === "month"
        ? `${MONTHS[month - 1]} ${year}`
        : `${first}–${last} ${year}`,
    from: dayStart(firstOfMonth(year, month)),
    to: dayStart(firstOfMonth(end.getUTCFullYear(), end.getUTCMonth() + 1)),
  };
}

export function periodFor(kind: ReportKind, key: string): ReportPeriod | null {
  if (kind === "month") {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
    return match ? span(kind, Number(match[1]), Number(match[2]), 1) : null;
  }
  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  return match
    ? span(kind, Number(match[1]), (Number(match[2]) - 1) * 3 + 1, 3)
    : null;
}

export function periodAt(kind: ReportKind, at: number): ReportPeriod {
  const [year, month] = istDay(at).split("-").map(Number);
  return kind === "month"
    ? span(kind, year, month, 1)
    : span(kind, year, Math.floor((month - 1) / 3) * 3 + 1, 3);
}

export function previousPeriod(period: ReportPeriod): ReportPeriod {
  return periodAt(period.kind, period.from - 1);
}

/** The period containing `now`, then the ones before it, newest first. */
export function recentPeriods(kind: ReportKind, now: number, count = 6) {
  const list = [periodAt(kind, now)];
  while (list.length < count) list.push(previousPeriod(list[list.length - 1]));
  return list;
}

/** The last finished month, which the monthly email reports on. */
export const lastMonth = (now: number) =>
  previousPeriod(periodAt("month", now));

/** The monthly email goes out from the 2nd of the month, India time. */
export const MONTHLY_SEND_DAY = 2;

/** The month the daily run should be sending, or null before the 2nd. */
export function dueMonth(now: number) {
  return Number(istDay(now).slice(8)) >= MONTHLY_SEND_DAY
    ? lastMonth(now).key
    : null;
}

/** The report the next monthly email will carry, and the day it goes. */
export function nextMonthly(lastKey: string, now: number) {
  const [year, month] = lastKey.split("-").map(Number);
  const next = span("month", year, month + 1, 1);
  const after = istDay(next.to).slice(0, 8) + pad(MONTHLY_SEND_DAY);
  const today = istDay(now);
  return { period: next, day: after > today ? after : today };
}

export type ReportSnapshot = {
  fetchedAt: number;
  balancePaise?: number;
  heldPaise?: number;
  staleReviews: number;
  oldestReviewDays?: number;
  disputes: number;
  campaigns: { id: string; enrolled: number; max?: number }[];
};

export type ReportCampaign = {
  id: string;
  title: string;
  status: CampaignStatus;
  statusLabel: string;
  approved: number;
  launched: boolean;
  slots: { enrolled: number; max: number | null } | null;
};

export type ReportMilestone = {
  stage: ActivationStage;
  label: string;
  at: number;
  inPeriod: boolean;
};

export type Count = { value: number; previous: number };

export type BrandReport = {
  period: ReportPeriod;
  /** The period is not over yet, so its numbers are still moving. */
  ongoing: boolean;
  funding: { addedPaise: number; count: number; previousPaise: number };
  results: Count & { feePaise: number };
  campaigns: {
    launched: number;
    ended: number;
    submitted: number;
    liveAtEnd: number;
    rows: ReportCampaign[];
  };
  wallet: {
    status: "ok" | "low" | "negative";
    balancePaise: number | null;
    heldPaise: number | null;
    asOf: number | null;
  };
  reviews: { waiting: number; oldestDays: number | null; disputes: number };
  milestones: ReportMilestone[];
};

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const within = (at: number, from: number, to: number) => at >= from && at < to;

export function buildReport(input: {
  period: ReportPeriod;
  events: StateEvent[];
  snapshot: ReportSnapshot | null;
  milestones: { stage: ActivationStage; label: string; at: number | null }[];
  now: number;
}): BrandReport {
  const { period, events, snapshot, now } = input;
  const before = previousPeriod(period);
  const inPeriod = events.filter((event) =>
    within(event.occurredAt, period.from, period.to),
  );
  const inBefore = events.filter((event) =>
    within(event.occurredAt, before.from, before.to),
  );

  const funding = (list: StateEvent[]) => {
    const rows = list.filter((event) => isFundingEvent(event.type));
    return {
      count: rows.length,
      paise: rows.reduce(
        (sum, event) => sum + num(event.data?.amount_paise),
        0,
      ),
    };
  };
  const approvals = (list: StateEvent[]) =>
    list.filter((event) => event.type === "enrollment.approved");
  const approvedHere = approvals(inPeriod);
  const added = funding(inPeriod);

  const asOf = Math.min(now, period.to);
  const state = platformState(
    events.filter((event) => event.occurredAt < period.to),
    asOf,
  );
  const approvedBy = new Map<string, number>();
  for (const event of approvedHere) {
    const id = event.data?.campaign_id;
    if (typeof id === "string")
      approvedBy.set(id, (approvedBy.get(id) ?? 0) + 1);
  }
  const slots = new Map(
    (snapshot?.campaigns ?? []).map((item) => [item.id, item]),
  );
  const startedHere = (at: number | undefined) =>
    at !== undefined && within(at, period.from, period.to);

  const rows = state.campaigns
    .filter(
      (item) =>
        (isOpenCampaign(item) && item.status !== "draft") ||
        startedHere(item.endedAt) ||
        approvedBy.has(item.id),
    )
    .map<ReportCampaign>((item) => {
      const slot = slots.get(item.id);
      return {
        id: item.id,
        title: item.title?.trim() || "Untitled campaign",
        status: item.status,
        statusLabel: CAMPAIGN_STATUS_LABEL[item.status],
        approved: approvedBy.get(item.id) ?? 0,
        launched: startedHere(item.liveAt),
        slots: slot ? { enrolled: slot.enrolled, max: slot.max ?? null } : null,
      };
    })
    .sort((a, b) => b.approved - a.approved || a.title.localeCompare(b.title));

  const walletStatus =
    (snapshot?.balancePaise ?? 0) < 0 ? "negative" : state.wallet.status;

  return {
    period,
    ongoing: period.to > now,
    funding: {
      addedPaise: added.paise,
      count: added.count,
      previousPaise: funding(inBefore).paise,
    },
    results: {
      value: approvedHere.length,
      previous: approvals(inBefore).length,
      feePaise: approvedHere.reduce(
        (sum, event) => sum + num(event.data?.platform_fee_paise),
        0,
      ),
    },
    campaigns: {
      launched: state.campaigns.filter((item) => startedHere(item.liveAt))
        .length,
      ended: state.campaigns.filter((item) => startedHere(item.endedAt)).length,
      submitted: state.campaigns.filter((item) => startedHere(item.submittedAt))
        .length,
      liveAtEnd: state.campaigns.filter((item) => item.status === "live")
        .length,
      rows,
    },
    wallet: {
      status: walletStatus,
      balancePaise: snapshot?.balancePaise ?? state.wallet.balancePaise ?? null,
      heldPaise: snapshot?.heldPaise ?? null,
      asOf: snapshot?.fetchedAt ?? null,
    },
    reviews: {
      waiting: snapshot?.staleReviews ?? 0,
      oldestDays: snapshot?.oldestReviewDays ?? null,
      disputes: snapshot?.disputes ?? 0,
    },
    milestones: input.milestones
      .filter((item): item is typeof item & { at: number } => item.at !== null)
      .map((item) => ({
        ...item,
        inPeriod: within(item.at, period.from, period.to),
      })),
  };
}

const inr = (paise: number) => formatMoney({ amount: paise, currency: "INR" });
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;
const shortDay = (at: number) =>
  new Date(`${istDay(at)}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** Plain facts, in the order a brand reads them. */
export function highlights(report: BrandReport) {
  const { funding, results, campaigns } = report;
  const before = previousPeriod(report.period).label;
  const lines: string[] = [];
  lines.push(
    funding.count
      ? `Wallet: ${inr(funding.addedPaise)} added in ${plural(funding.count, "top-up")}${funding.previousPaise ? ` (${inr(funding.previousPaise)} in ${before})` : ""}.`
      : `Wallet: no top-ups${funding.previousPaise ? ` (${inr(funding.previousPaise)} in ${before})` : ""}.`,
  );
  lines.push(
    `Results: ${plural(results.value, "approved result")}${results.previous ? ` (${results.previous.toLocaleString("en-IN")} in ${before})` : ""}.`,
  );
  const moves = [
    campaigns.launched && `${campaigns.launched} went live`,
    campaigns.ended && `${campaigns.ended} ended`,
    campaigns.submitted && `${campaigns.submitted} sent for review`,
  ].filter(Boolean);
  lines.push(
    `Campaigns: ${moves.length ? `${moves.join(", ")}; ` : ""}${campaigns.liveAtEnd} live ${report.ongoing ? "now" : "at the end of the period"}.`,
  );
  for (const item of report.milestones.filter((step) => step.inPeriod)) {
    lines.push(`Reached “${item.label}” on ${shortDay(item.at)}.`);
  }
  return lines;
}

/** Things worth raising in a quarterly review, each backed by a number in the report. */
export function talkingPoints(report: BrandReport) {
  const { wallet, reviews, results, campaigns, funding } = report;
  const points: string[] = [];
  if (wallet.status === "negative") {
    points.push(
      "The wallet is negative: agree how and when it will be topped up.",
    );
  } else if (wallet.status === "low") {
    points.push(
      `The wallet balance is low${wallet.balancePaise !== null ? ` (${inr(wallet.balancePaise)})` : ""}: agree a top-up date.`,
    );
  }
  if (reviews.waiting > 0) {
    points.push(
      `${plural(reviews.waiting, "submission")} waiting for review${reviews.oldestDays ? `, the oldest for ${plural(reviews.oldestDays, "day")}` : ""}: ask who reviews them.`,
    );
  }
  if (reviews.disputes > 0) {
    points.push(
      `${plural(reviews.disputes, "dispute")} open: walk through them.`,
    );
  }
  if (campaigns.liveAtEnd === 0) {
    points.push("No campaign is live: ask about the next launch.");
  }
  if (results.previous > 0 && results.value < results.previous) {
    points.push(
      `Approved results fell from ${results.previous} to ${results.value}: ask what changed.`,
    );
  } else if (results.value > results.previous && results.value > 0) {
    points.push(
      `Approved results rose from ${results.previous} to ${results.value}: ask what worked.`,
    );
  }
  if (funding.count === 0 && campaigns.liveAtEnd > 0) {
    points.push("No top-ups in the period while campaigns ran: check budget.");
  }
  points.push("Agree goals and campaigns for the next period.");
  return points.slice(0, 6);
}

export function reportEmail(
  report: BrandReport,
  who: { firstName: string; accountName: string; ownerFirstName: string },
) {
  const campaigns = report.campaigns.rows
    .slice(0, 8)
    .map(
      (item) =>
        `- ${item.title}: ${item.statusLabel.toLowerCase()}, ${plural(item.approved, "approved result")}`,
    );
  return {
    subject: `Your Hypedrive results for ${report.period.label}`,
    body: [
      `Hi ${who.firstName},`,
      `Here is how ${who.accountName} did on Hypedrive in ${report.period.label}.`,
      highlights(report)
        .map((line) => `- ${line}`)
        .join("\n"),
      ...(campaigns.length ? [`Campaigns\n${campaigns.join("\n")}`] : []),
      "Reply to this email if you'd like to go through it together.",
      who.ownerFirstName,
    ].join("\n\n"),
  };
}

/** Nothing happened worth a monthly email. */
export const isQuiet = (report: BrandReport) =>
  report.funding.count === 0 &&
  report.results.value === 0 &&
  report.campaigns.launched +
    report.campaigns.ended +
    report.campaigns.submitted ===
    0 &&
  report.campaigns.liveAtEnd === 0;
