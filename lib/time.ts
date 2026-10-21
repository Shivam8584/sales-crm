import { TIME_ZONE, istDay, istToday } from "./domain/day";

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
// Business times read in India time on every device, like the server writes them.
const SHORT_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});
const LONG_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60_000],
  ["month", 30 * 24 * 60 * 60_000],
  ["week", 7 * 24 * 60 * 60_000],
  ["day", 24 * 60 * 60_000],
  ["hour", 60 * 60_000],
  ["minute", 60_000],
];

/** "3 days ago", "in 2 hours", "just now". */
export function relativeTime(at: number, now = Date.now()) {
  const delta = at - now;
  for (const [unit, size] of STEPS) {
    if (Math.abs(delta) >= size)
      return RELATIVE.format(Math.round(delta / size), unit);
  }
  return "just now";
}

export function shortDate(at: number) {
  const date = new Date(at);
  return istDay(at).slice(0, 4) === istToday().slice(0, 4)
    ? SHORT_DATE.format(date)
    : LONG_DATE.format(date);
}

export function dateTime(at: number) {
  return DATE_TIME.format(new Date(at));
}
