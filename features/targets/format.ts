import type { TargetMetric } from "@/lib/domain/forecast";
import {
  DEFAULT_CURRENCY,
  formatMoney,
  money,
  toMajor,
} from "@/lib/domain/money";

const NAME = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  timeZone: "UTC",
});
const NAME_YEAR = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const at = (period: string) => new Date(`${period}-01T00:00:00Z`);

export const monthName = (period: string) => NAME.format(at(period));
export const monthLabel = (period: string) => NAME_YEAR.format(at(period));

/** A figure as the strip and tables show it: compact rupees for take, a count otherwise. */
export function formatFigure(metric: TargetMetric, value: number) {
  return metric === "won_take"
    ? formatMoney(
        { amount: value, currency: DEFAULT_CURRENCY },
        { compact: true },
      )
    : String(value);
}

/** A stored goal as typed in its input: rupees for take, a count otherwise. */
export function goalText(metric: TargetMetric, value: number | null) {
  if (value === null) return "";
  return metric === "won_take"
    ? String(toMajor({ amount: value, currency: DEFAULT_CURRENCY }))
    : String(value);
}

/** Typed text to a stored goal: null (blank or zero) clears it, undefined means it isn't a valid goal. */
export function parseGoal(metric: TargetMetric, text: string) {
  const cleaned = text.replace(/[,\s₹]/g, "");
  if (cleaned === "") return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < 0) return undefined;
  if (metric !== "won_take" && !Number.isInteger(number)) return undefined;
  const goal = metric === "won_take" ? money(number).amount : number;
  return goal === 0 ? null : goal;
}
