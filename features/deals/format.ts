import { dayAsDate, istToday } from "@/lib/domain/day";
import {
  CURRENCIES,
  formatMoney,
  sumMoney,
  type Money,
} from "@/lib/domain/money";

/** Today in India, where the team works, as `YYYY-MM-DD`. */
export function today() {
  return istToday();
}

const SHORT_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const LONG_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDay(day: string) {
  return day.slice(0, 4) === istToday().slice(0, 4)
    ? SHORT_DAY.format(dayAsDate(day))
    : LONG_DAY.format(dayAsDate(day));
}

/** One compact total per currency; currencies are never added together. */
export function formatTotals(values: Money[], empty = "—") {
  const totals = sumMoney(values).filter((total) => total.amount > 0);
  if (totals.length === 0) return empty;
  return totals
    .sort(
      (a, b) => CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency),
    )
    .map((total) => formatMoney(total, { compact: true }))
    .join(" · ");
}
