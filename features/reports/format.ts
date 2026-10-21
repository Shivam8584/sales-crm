import { compactSpan } from "@/features/leads/lead-meta";
import { CURRENCIES, formatMoney, type Money } from "@/lib/domain/money";

const DAY_MS = 24 * 60 * 60 * 1000;
const NUMBER = new Intl.NumberFormat("en-IN");
const RANGE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

export const count = (value: number) => NUMBER.format(value);

export function percent(rate: number | null | undefined) {
  if (rate === null || rate === undefined) return "—";
  if (rate > 0 && rate < 0.01) return "<1%";
  return `${Math.round(rate * 100)}%`;
}

export function rate(part: number, whole: number) {
  return whole === 0 ? null : part / whole;
}

export function duration(ms: number | null | undefined) {
  return ms === null || ms === undefined ? "—" : compactSpan(ms);
}

/** Days with one decimal under ten days, so short activation steps stay distinguishable. */
export function days(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  if (ms < DAY_MS) return compactSpan(ms);
  const value = ms / DAY_MS;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}d`;
}

export function totals(values: Money[], empty = "—") {
  const list = values
    .filter((value) => value.amount !== 0)
    .sort(
      (a, b) => CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency),
    );
  return list.length === 0
    ? empty
    : list.map((value) => formatMoney(value, { compact: true })).join(" · ");
}

/** "1 Oct – 21 Oct"; the end is exclusive, so the last day shown is the one before it. */
export function range(window: { start: number; end: number }) {
  return `${RANGE.format(window.start)} – ${RANGE.format(window.end - 1)}`;
}

export type Trend = "good" | "bad" | "flat";

/** Direction of a change, where `higherIsBetter` says which way is good. */
export function trend(
  current: number | null,
  previous: number | null,
  higherIsBetter = true,
): Trend {
  if (current === null || previous === null || current === previous) {
    return "flat";
  }
  return current > previous === higherIsBetter ? "good" : "bad";
}

export function signed(value: number, unit = "") {
  if (value === 0) return `0${unit}`;
  return `${value > 0 ? "+" : "−"}${NUMBER.format(Math.abs(value))}${unit}`;
}

/** "+3" next to a figure, against the previous period. */
export function change(current: number, previous: number) {
  return current === previous ? "±0" : signed(current - previous);
}
