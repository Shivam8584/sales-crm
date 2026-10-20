import {
  CURRENCIES,
  formatMoney,
  sumMoney,
  type Money,
} from "@/lib/domain/money";

/** Today's calendar day in the viewer's timezone, as `YYYY-MM-DD`. */
export function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const SHORT_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});
const LONG_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDay(day: string) {
  const date = new Date(`${day}T00:00:00`);
  return date.getFullYear() === new Date().getFullYear()
    ? SHORT_DAY.format(date)
    : LONG_DAY.format(date);
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
