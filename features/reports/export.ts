import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { timeToActivate } from "@/convex/lib/reports";
import type { CsvCell } from "@/lib/csv";
import { OPEN_DEAL_STAGES } from "@/lib/domain/forecast";
import { DEAL_STAGE_LABEL, STAGE_LABEL } from "@/lib/domain/labels";
import { formatMoney, toMajor, type Money } from "@/lib/domain/money";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STEP_LABEL,
} from "@/lib/domain/platform";
import { PROPOSAL_CURRENCY } from "@/lib/domain/pricing";

type OverviewData = FunctionReturnType<typeof api.reports.overview>;
type TeamData = FunctionReturnType<typeof api.reports.team>;
type ForecastData = FunctionReturnType<typeof api.reports.forecast>;
type RevenueData = FunctionReturnType<typeof api.reports.revenue>;
type ActivationData = FunctionReturnType<typeof api.reports.activation>;

const pct = (rate: number | null | undefined) =>
  rate === null || rate === undefined ? "" : Math.round(rate * 1000) / 10;
const minutes = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? "" : Math.round(ms / 60_000);
const days = (ms: number | null | undefined) =>
  ms === null || ms === undefined
    ? ""
    : Math.round((ms / 86_400_000) * 10) / 10;
const money = (values: Money[]) =>
  values
    .filter((value) => value.amount !== 0)
    .map((value) => formatMoney(value))
    .join(" + ");
/** Major units as a plain number, so spreadsheets can sum the column. */
const major = (amount: number, currency: Money["currency"]) =>
  toMajor({ amount, currency });
const isoDay = (at: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);

export function csvFilename(table: string, scope: string) {
  return `hypedrive-${table}-${scope}-${isoDay(Date.now())}.csv`;
}

/** One builder per table; percentages are 0–100 and durations are in the column's unit. */
export const csvRows = {
  funnel: (report: OverviewData): CsvCell[][] => [
    ["Step", "Count", "From previous step %", "Of leads %", "Previous period"],
    ...report.funnel.steps.map((step, index) => [
      step.label,
      step.count,
      index === 0 ? "" : pct(step.stepRate),
      pct(step.overallRate),
      report.previousFunnel[index] ?? 0,
    ]),
  ],
  sources: (report: OverviewData): CsvCell[][] => [
    [
      "Source",
      "Leads",
      "Contacted",
      "Demo",
      "Converted",
      "Activated",
      "Median speed to lead (min)",
    ],
    ...report.bySource.map((row) => [
      row.label,
      row.leads,
      row.contacted,
      row.demo,
      row.converted,
      row.activated,
      minutes(row.medianSpeedMs),
    ]),
  ],
  activation: (activation: ReturnType<typeof timeToActivate>): CsvCell[][] => [
    [
      "From",
      "To",
      "Median (days)",
      "p90 (days)",
      "Completed in period",
      "Waiting now",
    ],
    ...activation.steps.map((step) => [
      STAGE_LABEL[step.from],
      STAGE_LABEL[step.to],
      days(step.medianMs),
      days(step.p90Ms),
      step.completed,
      step.waiting,
    ]),
  ],
  pipeline: (report: OverviewData): CsvCell[][] => [
    ["Stage", "Deals", "Value"],
    ...report.pipeline.open.map((stage) => [
      DEAL_STAGE_LABEL[stage.stage],
      stage.count,
      money(stage.totals),
    ]),
    [
      "Won in period",
      report.pipeline.won.count,
      money(report.pipeline.won.totals),
    ],
    [
      "Lost in period",
      report.pipeline.lost.count,
      money(report.pipeline.lost.totals),
    ],
  ],
};

export function teamCsv(data: TeamData): CsvCell[][] {
  const rows = [
    ...data.rows.map((row) => ({
      ...row,
      name: row.ownerName ?? "Unassigned",
    })),
    { ...data.team, name: "Team" },
  ];
  return [
    [
      "Rep",
      "Leads",
      "Leads (previous)",
      "Median speed to lead (min)",
      "p90 speed to lead (min)",
      "Within SLA %",
      "Tasks done",
      "Tasks done (previous)",
      "Overdue tasks now",
      "Calls",
      "Calls (previous)",
      "Meetings",
      "Meetings (previous)",
      "Deals won",
      "Deals won (previous)",
      "Won value",
      "Accounts on platform",
      "Accounts activated",
      "Activated in period",
    ],
    ...rows.map((row) => [
      row.name,
      row.current.leads,
      row.previous.leads,
      minutes(row.current.speed.medianMs),
      minutes(row.current.speed.p90Ms),
      pct(row.current.speed.withinRate),
      row.current.tasksDone,
      row.previous.tasksDone,
      row.overdue,
      row.current.calls,
      row.previous.calls,
      row.current.meetings,
      row.previous.meetings,
      row.current.won,
      row.previous.won,
      money(row.current.wonValue),
      row.platformAccounts,
      row.activatedAccounts,
      row.current.activated,
    ]),
  ];
}

export function forecastCsv(data: ForecastData): CsvCell[][] {
  return [
    [
      "Currency",
      "Close month",
      "Deals",
      ...OPEN_DEAL_STAGES.map((stage) => DEAL_STAGE_LABEL[stage]),
      "Best case",
      "Commit",
      "Weighted",
    ],
    ...data.currencies.flatMap((item) =>
      item.buckets.map((bucket) => [
        item.currency,
        bucket.key,
        bucket.count,
        ...bucket.stages.map((slice) => major(slice.amount, item.currency)),
        major(bucket.total, item.currency),
        major(bucket.commit, item.currency),
        major(bucket.weighted, item.currency),
      ]),
    ),
  ];
}

export function slippedCsv(rows: ForecastData["slipped"]): CsvCell[][] {
  return [
    [
      "Deal",
      "Account",
      "Owner",
      "Stage",
      "Currency",
      "Amount",
      "Close date",
      "Days late",
      "Commit",
    ],
    ...rows.map((row) => [
      row.title,
      row.accountName,
      row.ownerName ?? "",
      DEAL_STAGE_LABEL[row.stage],
      row.amount.currency,
      major(row.amount.amount, row.amount.currency),
      row.closeDate,
      row.daysLate,
      row.commit ? "Yes" : "No",
    ]),
  ];
}

const REVENUE_HEADER = [
  "Proposals",
  `Billed (${PROPOSAL_CURRENCY})`,
  `Take (${PROPOSAL_CURRENCY})`,
  `Margin (${PROPOSAL_CURRENCY})`,
  "Blended margin %",
  "Below floor",
  "Below approval",
  "Approved",
];

type RevenueFigures = RevenueData["current"];
const revenueCells = (row: RevenueFigures): CsvCell[] => [
  row.count,
  major(row.brandCharge, PROPOSAL_CURRENCY),
  major(row.take, PROPOSAL_CURRENCY),
  major(row.margin, PROPOSAL_CURRENCY),
  pct(row.marginRate),
  row.belowFloor,
  row.belowApproval,
  row.approved,
];

export const revenueCsv = {
  monthly: (data: RevenueData): CsvCell[][] => [
    ["Month", ...REVENUE_HEADER],
    ...data.monthly.map((row) => [row.month, ...revenueCells(row)]),
  ],
  byAccount: (data: RevenueData): CsvCell[][] => [
    ["Account", ...REVENUE_HEADER],
    ...data.byAccount.map((row) => [row.name, ...revenueCells(row)]),
  ],
  byRep: (data: RevenueData): CsvCell[][] => [
    ["Rep", ...REVENUE_HEADER],
    ...data.byRep.map((row) => [row.name ?? "", ...revenueCells(row)]),
  ],
};

export const activationCsv = {
  steps: (data: ActivationData) => csvRows.activation(data.steps),
  cohorts: (data: ActivationData): CsvCell[][] => [
    [
      "Signup week",
      "Brands",
      ...ACTIVATION_STAGES.map((stage) => ACTIVATION_STEP_LABEL[stage]),
      ...ACTIVATION_STAGES.map((stage) => `${ACTIVATION_STEP_LABEL[stage]} %`),
    ],
    ...data.cohorts.map((row) => [
      isoDay(row.weekStart),
      row.size,
      ...row.reached,
      ...row.reached.map((reached) =>
        row.size === 0 ? "" : pct(reached / row.size),
      ),
    ]),
  ],
  stalls: (data: ActivationData): CsvCell[][] => {
    const labels = new Map<string, string>(
      data.rules.map((rule) => [rule.id, rule.label]),
    );
    return [
      [
        "Rule",
        ...data.weeks.map((week) => `Week of ${isoDay(week)}`),
        "Total",
        "Open now",
      ],
      ...data.stalls.map((row) => [
        labels.get(row.ruleId) ?? row.ruleId,
        ...row.counts,
        row.total,
        row.open,
      ]),
    ];
  },
};
