import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { timeToActivate } from "@/convex/lib/reports";
import type { CsvCell } from "@/lib/csv";
import { DEAL_STAGE_LABEL, STAGE_LABEL } from "@/lib/domain/labels";
import { formatMoney, type Money } from "@/lib/domain/money";

type OverviewData = FunctionReturnType<typeof api.reports.overview>;
type TeamData = FunctionReturnType<typeof api.reports.team>;
type ForecastData = FunctionReturnType<typeof api.forecast.report>;

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
    ["Weighted open pipeline", "", money(report.pipeline.weightedTotals)],
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
    ["Currency", "Line", "Deals", "Value", "Weighted"],
    ...data.currencies.flatMap((item): CsvCell[][] => {
      const m = (amount: number) =>
        formatMoney({ amount, currency: item.currency });
      const line = (label: string, slice: (typeof item)["commit"]) => [
        item.currency,
        label,
        slice.count,
        m(slice.amount),
        m(slice.weighted),
      ];
      return [
        ...item.stages.map((slice) =>
          line(DEAL_STAGE_LABEL[slice.stage], slice),
        ),
        line("Commit (Proposal and later, closing this month)", item.commit),
        line("Best case (closing this or next month)", item.bestCase),
        line("Slipped (past close date)", item.slipped),
        [item.currency, "Won this month", "", m(item.wonSoFar), ""],
        [item.currency, "Expected landing", "", m(item.landing), ""],
      ];
    }),
  ];
}
