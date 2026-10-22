import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMIT_STAGES,
  PACE_MIN_SHARE,
  STAGE_PROBABILITY_BPS,
  attain,
  currentPeriod,
  forecastSummary,
  isPeriod,
  isSlipped,
  monthWindow,
  paceOf,
  shiftPeriod,
  weightedAmount,
} from "./forecast.ts";

const inr = (amount) => ({ amount, currency: "INR" });
const deal = (stage, amount, closeDate, currency = "INR") => ({
  stage,
  amount: { amount, currency },
  closeDate,
});

test("stage weights are chances of closing and rise with the stage", () => {
  assert.deepEqual(STAGE_PROBABILITY_BPS, {
    discovery: 1_000,
    demo: 2_500,
    proposal: 5_000,
    onboarding: 9_000,
  });
  assert.equal(weightedAmount(1_00_000, "proposal"), 50_000);
  assert.equal(weightedAmount(333, "discovery"), 33);
  assert.equal(weightedAmount(335, "discovery"), 34);
  assert.deepEqual(COMMIT_STAGES, ["proposal", "onboarding"]);
});

test("pace compares actual with the target scaled to the month elapsed", () => {
  assert.equal(paceOf(60, 100, 0.5), "ahead");
  assert.equal(paceOf(55, 100, 0.5), "ahead");
  assert.equal(paceOf(50, 100, 0.5), "on track");
  assert.equal(paceOf(45, 100, 0.5), "on track");
  assert.equal(paceOf(44, 100, 0.5), "behind");
  assert.equal(paceOf(0, 100, 0.5), "behind");
});

test("pace is withheld when there is nothing to judge", () => {
  assert.equal(paceOf(5, null, 0.5), null);
  assert.equal(paceOf(5, 0, 0.5), null);
  assert.equal(paceOf(0, 100, PACE_MIN_SHARE / 2), null);
  assert.equal(paceOf(0, 100, 0), null);
  assert.equal(paceOf(100, 100, 0.01), "ahead");
  assert.equal(paceOf(100, 100, 1), "ahead");
  assert.equal(paceOf(99, 100, 1), "on track");
  assert.equal(paceOf(80, 100, 1), "behind");
});

test("attainment rounds the percentage and drops an empty target", () => {
  assert.deepEqual(attain(1, 3, 1), {
    actual: 1,
    target: 3,
    pct: 33,
    pace: "behind",
  });
  assert.deepEqual(attain(4, 3, 0.5), {
    actual: 4,
    target: 3,
    pct: 133,
    pace: "ahead",
  });
  assert.deepEqual(attain(7, null, 0.5), {
    actual: 7,
    target: null,
    pct: null,
    pace: null,
  });
  assert.equal(attain(7, 0, 0.5).target, null);
});

test("months are validated and shifted across year ends", () => {
  assert.ok(isPeriod("2026-10"));
  assert.ok(!isPeriod("2026-13"));
  assert.ok(!isPeriod("2026-00"));
  assert.ok(!isPeriod("2026-1"));
  assert.ok(!isPeriod("2026-10-01"));
  assert.equal(shiftPeriod("2026-10", 1), "2026-11");
  assert.equal(shiftPeriod("2026-12", 1), "2027-01");
  assert.equal(shiftPeriod("2026-01", -1), "2025-12");
  assert.equal(shiftPeriod("2026-03", -3), "2025-12");
  assert.equal(shiftPeriod("2026-10", 14), "2027-12");
});

test("month boundaries are midnight India time", () => {
  const start = Date.UTC(2026, 9, 1) - 330 * 60_000;
  const end = Date.UTC(2026, 10, 1) - 330 * 60_000;
  const now = start + 5 * 24 * 3_600_000;
  const window = monthWindow("2026-10", now);
  assert.equal(window.start, start);
  assert.equal(window.end, end);
  assert.equal(window.share, 5 / 31);
  assert.equal(monthWindow("2026-10", start - 1).share, 0);
  assert.equal(monthWindow("2026-10", end).share, 1);
  assert.equal(monthWindow("2026-10", end + 1e9).share, 1);
  assert.equal(
    monthWindow("2027-02", now).end - monthWindow("2027-02", now).start,
    28 * 86_400_000,
  );
});

test("the current month follows the India calendar, not UTC", () => {
  const lateUtc = Date.UTC(2026, 9, 31, 20, 0);
  assert.equal(currentPeriod(lateUtc), "2026-11");
  assert.equal(currentPeriod(Date.UTC(2026, 9, 31, 17, 0)), "2026-10");
});

test("slipped means a close date before today", () => {
  assert.ok(isSlipped({ closeDate: "2026-10-21" }, "2026-10-22"));
  assert.ok(!isSlipped({ closeDate: "2026-10-22" }, "2026-10-22"));
  assert.ok(!isSlipped({ closeDate: undefined }, "2026-10-22"));
});

test("forecast splits commit, best case and slipped, and lands on won plus weighted commit", () => {
  const open = [
    deal("discovery", 1_000_00, "2026-10-28"),
    deal("proposal", 2_000_00, "2026-10-25"),
    deal("onboarding", 4_000_00, "2026-10-22"),
    deal("proposal", 8_000_00, "2026-11-03"),
    deal("demo", 1_600_00, "2026-12-01"),
    deal("proposal", 500_00, "2026-10-10"),
    deal("onboarding", 700_00, "2026-09-30"),
    deal("demo", 300_00),
    deal("proposal", 50_00, "2026-10-26", "USD"),
  ];
  const [inrForecast, usd] = forecastSummary(
    open,
    [inr(3_000_00), inr(1_500_00)],
    "2026-10-22",
  ).sort((a, b) => a.currency.localeCompare(b.currency));
  assert.equal(inrForecast.currency, "INR");

  assert.deepEqual(inrForecast.commit, {
    count: 2,
    amount: 6_000_00,
    weighted: 1_000_00 + 3_600_00,
  });
  assert.deepEqual(inrForecast.bestCase, {
    count: 4,
    amount: 15_000_00,
    weighted: 100_00 + 1_000_00 + 3_600_00 + 4_000_00,
  });
  assert.deepEqual(inrForecast.slipped, {
    count: 2,
    amount: 1_200_00,
    weighted: 250_00 + 630_00,
  });
  assert.equal(inrForecast.wonSoFar, 4_500_00);
  assert.equal(inrForecast.landing, 4_500_00 + 4_600_00);

  const byStage = Object.fromEntries(
    inrForecast.stages.map((slice) => [slice.stage, slice]),
  );
  assert.equal(byStage.discovery.count, 1);
  assert.equal(byStage.demo.count, 2);
  assert.equal(byStage.demo.amount, 1_900_00);
  assert.equal(byStage.proposal.count, 3);
  assert.equal(byStage.onboarding.amount, 4_700_00);

  assert.equal(usd.currency, "USD");
  assert.equal(usd.commit.count, 1);
  assert.equal(usd.landing, 25_00);
});

test("year-end close dates roll into next month's best case", () => {
  const [forecast] = forecastSummary(
    [deal("demo", 100, "2027-01-15"), deal("demo", 100, "2027-02-01")],
    [],
    "2026-12-20",
  );
  assert.equal(forecast.bestCase.count, 1);
  assert.equal(forecast.commit.count, 0);
  assert.equal(forecast.landing, 0);
});

test("a workspace with no deals has no currencies", () => {
  assert.deepEqual(forecastSummary([], [], "2026-10-22"), []);
});
