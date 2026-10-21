/**
 * Business calendar for the team, which works in India time. Calendar days
 * (`YYYY-MM-DD`) and "today" are always India days, on the server and in the
 * browser, whatever timezone the device or the server runs in.
 */

export const TIME_ZONE = "Asia/Kolkata";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// India has had no daylight saving since 1945, so a fixed offset is exact.
const IST_OFFSET = 330 * MINUTE;

/** SLA clocks only run 09:00–20:00 India time; a lead that lands at night is due next morning. */
export const WORKING_HOURS = { start: 9 * 60, end: 20 * 60 } as const;

/** The India calendar day that `at` falls on. */
export function istDay(at: number) {
  return new Date(at + IST_OFFSET).toISOString().slice(0, 10);
}

/** Today in India, optionally shifted by whole days. */
export function istToday(offsetDays = 0, now = Date.now()) {
  return addDays(istDay(now), offsetDays);
}

/** Epoch ms of 00:00 India time on `day`. */
export function dayStart(day: string) {
  return Date.parse(`${day}T00:00:00Z`) - IST_OFFSET;
}

/** Epoch ms of 00:00 India time on the day `at` falls on. */
export function startOfIstDay(at: number) {
  return Math.floor((at + IST_OFFSET) / DAY) * DAY - IST_OFFSET;
}

export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY,
  );
}

/** Minute of the India-time day, 0–1439. */
export function istMinutes(at: number) {
  return Math.floor(((at + IST_OFFSET) % DAY) / MINUTE);
}

/** When a speed-to-lead clock starts: `at`, or the next 09:00 India time if it lands outside working hours. */
export function slaClockStart(at: number) {
  const minutes = istMinutes(at);
  if (minutes >= WORKING_HOURS.start && minutes < WORKING_HOURS.end) return at;
  const opening = startOfIstDay(at) + WORKING_HOURS.start * MINUTE;
  return minutes < WORKING_HOURS.start ? opening : opening + DAY;
}

/** When a lead created at `createdAt` breaches an SLA of `slaMs`. */
export function slaDueAt(createdAt: number, slaMs: number) {
  return slaClockStart(createdAt) + slaMs;
}

/** A Date whose UTC fields read as the India calendar day, for formatting a `YYYY-MM-DD`. */
export function dayAsDate(day: string) {
  return new Date(`${day}T00:00:00Z`);
}
