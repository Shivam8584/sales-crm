import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Period } from "@/convex/lib/reports";
import type { CsvCell } from "@/lib/csv";
import { DEAL_STAGE_LABEL, STAGE_LABEL } from "@/lib/domain/labels";
import { formatMoney, type Money } from "@/lib/domain/money";

type ReportData = FunctionReturnType<typeof api.reports.overview>;

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

export function csvFilename(table: string, period: Period) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(Date.now());
  return `hypedrive-${table}-${period}-${day}.csv`;
}

/** One builder per report table; percentages are 0–100 and durations are in the column's unit. */
export const csvRows: Record<string, (report: ReportData) => CsvCell[][]> = {
  funnel: (report) => [
    ["Step", "Count", "From previous step %", "Of leads %", "Previous period"],
    ...report.funnel.steps.map((step, index) => [
      step.label,
      step.count,
      index === 0 ? "" : pct(step.stepRate),
      pct(step.overallRate),
      report.previousFunnel[index] ?? 0,
    ]),
  ],
  sources: (report) => [
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
  speed: (report) => [
    ["Owner", "Leads", "Median (min)", "p90 (min)", "Within SLA %", "Breached"],
    ...report.speedByOwner.map((row) => [
      row.ownerName ?? "Unassigned",
      row.leads,
      minutes(row.medianMs),
      minutes(row.p90Ms),
      pct(row.withinRate),
      row.breached,
    ]),
  ],
  activation: (report) => [
    ["From", "To", "Median (days)", "Completed in period", "Waiting now"],
    ...report.activation.steps.map((step) => [
      STAGE_LABEL[step.from],
      STAGE_LABEL[step.to],
      days(step.medianMs),
      step.completed,
      step.waiting,
    ]),
  ],
  pipeline: (report) => [
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
