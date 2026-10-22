import assert from "node:assert/strict";
import { test } from "node:test";
import { routes } from "../../lib/routes.ts";
import { weeklyReport } from "./weeklyReport.ts";

const IST_DAY = 24 * 60 * 60_000;
const end = Date.parse("2026-10-26T04:00:00Z");

const data = {
  name: "Asha",
  window: { start: end - 7 * IST_DAY, end },
  slaMs: 30 * 60_000,
  leads: { current: 12, previous: 9 },
  converted: { current: 4, previous: 5 },
  speed: {
    current: { medianMs: 12 * 60_000, withinRate: 5 / 6 },
    previous: { medianMs: null, withinRate: null },
  },
  dealsCreated: { current: 5, previous: 1 },
  won: {
    current: {
      count: 2,
      totals: [
        { amount: 30_000_000, currency: "INR" },
        { amount: 100_000, currency: "USD" },
      ],
    },
    previous: { count: 0, totals: [] },
  },
  lost: {
    current: { count: 1, totals: [{ amount: 5_000_000, currency: "INR" }] },
    previous: { count: 0, totals: [] },
  },
  open: { count: 9, totals: [{ amount: 120_000_000, currency: "INR" }] },
  topReps: [
    { name: "Ravi K", touches: 14 },
    { name: "Mina S", touches: 9 },
  ],
  stuck: 3,
  overdue: 7,
  live: { current: 2, previous: 1 },
  reportsUrl: `https://crm.example${routes.reports}`,
  activityUrl: `https://crm.example${routes.activity}`,
};

test("compares each figure with the week before", () => {
  const { subject, body } = weeklyReport(data);
  assert.equal(subject, "Hypedrive weekly report: 12 new leads, 2 deals won");
  assert.match(body, /^Hi Asha,/);
  assert.match(body, /19 Oct to 26 Oct/);
  assert.match(body, /New leads: 12 \(was 9\)/);
  assert.match(body, /Converted: 4 \(was 5\)/);
  assert.match(body, /Created: 5 \(was 1\)/);
  assert.match(body, /Speed to lead: median 12 min, 83% in SLA \(was n\/a\)/);
  assert.match(body, /Accounts that went live: 2 \(was 1\)/);
});

test("amounts are written per currency in Indian grouping", () => {
  const { body } = weeklyReport(data);
  assert.match(body, /Won: 2 · ₹3,00,000 \+ \$1,000 \(was 0\)/);
  assert.match(body, /Lost: 1 · ₹50,000 \(was 0\)/);
  assert.match(body, /Open pipeline: ₹12,00,000 across 9 deals/);
});

test("lists the top reps and links to the report and the feed", () => {
  const { body } = weeklyReport(data);
  assert.match(
    body,
    /Top reps by calls and meetings: Ravi K \(14\), Mina S \(9\)/,
  );
  assert.match(body, /Brands stuck in onboarding: 3/);
  assert.match(body, /Overdue tasks: 7/);
  assert.match(body, /https:\/\/crm\.example\/insights\/reports/);
  assert.match(body, /https:\/\/crm\.example\/insights\/activity/);
});

test("a quiet week still reads cleanly", () => {
  const quiet = {
    ...data,
    name: "",
    leads: { current: 0, previous: 0 },
    speed: {
      current: { medianMs: null, withinRate: null },
      previous: { medianMs: null, withinRate: null },
    },
    won: {
      current: { count: 1, totals: [] },
      previous: { count: 0, totals: [] },
    },
    open: { count: 0, totals: [] },
    topReps: [],
  };
  const { subject, body } = weeklyReport(quiet);
  assert.equal(subject, "Hypedrive weekly report: 0 new leads, 1 deal won");
  assert.match(body, /^Hi there,/);
  assert.match(body, /Open pipeline: no open deals/);
  assert.match(body, /Top reps by calls and meetings: none logged/);
  assert.match(body, /Won: 1 · ₹0 \(was 0\)/);
});

test("long waits read in hours and days", () => {
  const slow = (medianMs) =>
    weeklyReport({
      ...data,
      speed: {
        current: { medianMs, withinRate: null },
        previous: { medianMs: null, withinRate: null },
      },
    }).body;
  assert.match(slow(5 * 3_600_000), /median 5 h \(/);
  assert.match(slow(3 * 24 * 3_600_000), /median 3 days \(/);
  assert.match(slow(20_000), /median under a minute/);
});
