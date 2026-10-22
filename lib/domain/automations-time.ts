import { DAY, HOUR, IST_OFFSET, MINUTE } from "./automations-internal";
import type { WaitConfig, WaitUnit } from "./automations-model";

// ── Time (India) ────────────────────────────────────────────────────────────

export const QUIET_HOURS = { start: 9 * 60, end: 20 * 60 } as const;

export const UNIT_MS: Record<WaitUnit, number> = {
  minutes: MINUTE,
  hours: HOUR,
  days: DAY,
};

export const WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** India-time weekday (1 = Monday), minute of day and the epoch ms of that day's midnight. */
export function istClock(at: number) {
  const shifted = at + IST_OFFSET;
  const dayStart = Math.floor(shifted / DAY) * DAY - IST_OFFSET;
  const weekday = ((new Date(shifted).getUTCDay() + 6) % 7) + 1;
  return { weekday, minutes: Math.floor((shifted % DAY) / MINUTE), dayStart };
}

export function istDay(at: number) {
  return new Date(at + IST_OFFSET).toISOString().slice(0, 10);
}

export function parseTime(time: string | undefined) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Next moment after `now` that falls on one of `days` at `time`, India time. */
export function nextWeekdayTime(now: number, days: number[], time: string) {
  const minutes = parseTime(time) ?? 0;
  const { dayStart } = istClock(now);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = dayStart + offset * DAY + minutes * MINUTE;
    if (candidate <= now) continue;
    if (days.length === 0 || days.includes(istClock(candidate).weekday)) {
      return candidate;
    }
  }
  return dayStart + 7 * DAY + minutes * MINUTE;
}

/** `at`, or the start of the next 9:00–20:00 India-time window. */
export function sendWindow(at: number) {
  const { minutes, dayStart } = istClock(at);
  if (minutes >= QUIET_HOURS.start && minutes < QUIET_HOURS.end) return at;
  const start = dayStart + QUIET_HOURS.start * MINUTE;
  return minutes < QUIET_HOURS.start ? start : start + DAY;
}

/** Start of the next India-time day's send window, for a hit daily cap. */
export function nextDayWindow(at: number) {
  return istClock(at).dayStart + DAY + QUIET_HOURS.start * MINUTE;
}

/** When a duration or weekday wait ends; null for event waits. */
export function waitUntil(config: WaitConfig, now: number): number | null {
  if (config.mode === "duration") {
    return now + (config.amount ?? 0) * UNIT_MS[config.unit ?? "days"];
  }
  if (config.mode === "until") {
    return nextWeekdayTime(now, config.days ?? [], config.time ?? "09:00");
  }
  return null;
}

export function waitTimeout(config: WaitConfig, now: number) {
  return (
    now + (config.timeoutAmount ?? 0) * UNIT_MS[config.timeoutUnit ?? "days"]
  );
}

const plural = (count: number, unit: string) =>
  `${count} ${count === 1 ? unit.replace(/s$/, "") : unit}`;

export function describeDuration(
  amount: number | undefined,
  unit: WaitUnit | undefined,
) {
  return plural(amount ?? 0, unit ?? "days");
}
