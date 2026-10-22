import { istDay } from "../../lib/domain/day";
import { formatMoney, type Money } from "../../lib/domain/money";

type Pair<T> = { current: T; previous: T };
export type Deals = { count: number; totals: Money[] };

export type WeeklyReportData = {
  /** First name of the recipient. */
  name: string;
  window: { start: number; end: number };
  slaMs: number;
  leads: Pair<number>;
  converted: Pair<number>;
  speed: Pair<{ medianMs: number | null; withinRate: number | null }>;
  dealsCreated: Pair<number>;
  won: Pair<Deals>;
  lost: Pair<Deals>;
  open: Deals;
  topReps: { name: string; touches: number }[];
  stuck: number;
  overdue: number;
  live: Pair<number>;
  reportsUrl: string;
  activityUrl: string;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function dayLabel(at: number) {
  const [, month, day] = istDay(at).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

function duration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 90) return `${minutes} min`;
  const hours = ms / 3_600_000;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

const amount = (totals: Money[]) =>
  totals.length ? totals.map((item) => formatMoney(item)).join(" + ") : "₹0";

const dealsText = ({ count, totals }: Deals) =>
  count === 0 ? "0" : `${count} · ${amount(totals)}`;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function speedText(speed: WeeklyReportData["speed"]["current"]) {
  if (speed.medianMs === null) return "n/a";
  const within =
    speed.withinRate === null ? "" : `, ${percent(speed.withinRate)} in SLA`;
  return `median ${duration(speed.medianMs)}${within}`;
}

/** Plain-text weekly summary for managers: the last 7 days against the 7 before. */
export function weeklyReport(data: WeeklyReportData) {
  const { leads, converted, dealsCreated, won, lost, live } = data;
  const compared = (label: string, pair: Pair<number>) =>
    `${label}: ${pair.current} (was ${pair.previous})`;

  const reps = data.topReps.length
    ? data.topReps.map((rep) => `${rep.name} (${rep.touches})`).join(", ")
    : "none logged";

  const body = [
    `Hi ${data.name || "there"},`,
    "",
    `Your week at Hypedrive, ${dayLabel(data.window.start)} to ${dayLabel(data.window.end)}, against the 7 days before.`,
    "",
    "Leads",
    compared("New leads", leads),
    compared("Converted", converted),
    `Speed to lead: ${speedText(data.speed.current)} (was ${speedText(data.speed.previous)})`,
    "",
    "Deals",
    compared("Created", dealsCreated),
    `Won: ${dealsText(won.current)} (was ${dealsText(won.previous)})`,
    `Lost: ${dealsText(lost.current)} (was ${dealsText(lost.previous)})`,
    `Open pipeline: ${data.open.count === 0 ? "no open deals" : `${amount(data.open.totals)} across ${plural(data.open.count, "deal", "deals")}`}`,
    "",
    "Team",
    `Top reps by calls and meetings: ${reps}`,
    `Brands stuck in onboarding: ${data.stuck}`,
    `Overdue tasks: ${data.overdue}`,
    compared("Accounts that went live", live),
    "",
    `Full report: ${data.reportsUrl}`,
    `What changed this week: ${data.activityUrl}`,
    "",
    "Turn off this report in Settings → Profile.",
  ].join("\n");

  const subject = `Hypedrive weekly report: ${plural(leads.current, "new lead", "new leads")}, ${plural(won.current.count, "deal won", "deals won")}`;
  return { subject, body };
}
