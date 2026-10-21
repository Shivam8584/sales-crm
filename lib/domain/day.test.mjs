import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  dayStart,
  daysBetween,
  istDay,
  istMinutes,
  istToday,
  slaClockStart,
  slaDueAt,
  startOfIstDay,
} from "./day.ts";

// 21 Oct 2026 00:00 IST is 20 Oct 18:30 UTC.
const midnightIst = Date.UTC(2026, 9, 20, 18, 30);
const HOUR = 60 * 60_000;
const MINUTE = 60_000;

test("between 00:00 and 05:30 IST the day is already the India day, not the UTC one", () => {
  for (const offset of [0, 1, 2 * HOUR, 5 * HOUR + 29 * MINUTE]) {
    const at = midnightIst + offset;
    assert.equal(new Date(at).toISOString().slice(0, 10), "2026-10-20");
    assert.equal(istDay(at), "2026-10-21");
    assert.equal(istToday(0, at), "2026-10-21");
  }
  assert.equal(istDay(midnightIst - 1), "2026-10-20");
  assert.equal(istToday(1, midnightIst + HOUR), "2026-10-22");
  assert.equal(istToday(-1, midnightIst + HOUR), "2026-10-20");
});

test("an India day starts at 18:30 UTC the evening before", () => {
  assert.equal(dayStart("2026-10-21"), midnightIst);
  assert.equal(startOfIstDay(midnightIst + 3 * HOUR), midnightIst);
  assert.equal(startOfIstDay(midnightIst - 1), midnightIst - 24 * HOUR);
  assert.equal(istMinutes(midnightIst + 90 * MINUTE), 90);
});

test("day arithmetic crosses months and years", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-10-21", "2026-11-04"), 14);
});

test("the SLA clock waits for 09:00 IST when a lead lands at night", () => {
  const nineIst = midnightIst + 9 * HOUR;
  assert.equal(slaClockStart(midnightIst + 2 * HOUR), nineIst);
  assert.equal(slaClockStart(midnightIst + 5 * HOUR + 30 * MINUTE), nineIst);
  assert.equal(slaClockStart(nineIst - 1), nineIst);
  assert.equal(slaClockStart(nineIst), nineIst);
  const afternoon = midnightIst + 15 * HOUR;
  assert.equal(slaClockStart(afternoon), afternoon);
  const lateEvening = midnightIst + 21 * HOUR;
  assert.equal(slaClockStart(lateEvening), nineIst + 24 * HOUR);
  assert.equal(slaDueAt(afternoon, 5 * MINUTE), afternoon + 5 * MINUTE);
  assert.equal(slaDueAt(midnightIst + HOUR, 5 * MINUTE), nineIst + 5 * MINUTE);
});
