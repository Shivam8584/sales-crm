import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReport,
  dueMonth,
  highlights,
  isQuiet,
  lastMonth,
  nextMonthly,
  periodAt,
  periodFor,
  previousPeriod,
  recentPeriods,
  reportEmail,
  talkingPoints,
} from "./brand-report.ts";
import { dayStart } from "./day.ts";

const at = (day, time = "12:00:00") => Date.parse(`${day}T${time}+05:30`);

test("months and quarters run on India calendar boundaries", () => {
  const sept = periodFor("month", "2026-09");
  assert.equal(sept.label, "September 2026");
  assert.equal(sept.from, dayStart("2026-09-01"));
  assert.equal(sept.to, dayStart("2026-10-01"));
  assert.equal(periodAt("month", at("2026-09-30", "23:59:00")).key, "2026-09");
  assert.equal(periodAt("month", at("2026-10-01", "00:01:00")).key, "2026-10");

  const q3 = periodFor("quarter", "2026-Q3");
  assert.equal(q3.label, "Jul–Sep 2026");
  assert.equal(q3.from, dayStart("2026-07-01"));
  assert.equal(q3.to, dayStart("2026-10-01"));
  assert.equal(periodAt("quarter", at("2026-12-31")).key, "2026-Q4");
});

test("odd period keys are refused", () => {
  for (const key of ["2026-13", "2026-00", "2026-9", "2026-Q5", "x"]) {
    assert.equal(periodFor("month", key), null);
    assert.equal(periodFor("quarter", key), null);
  }
});

test("previous periods step back across years", () => {
  assert.equal(previousPeriod(periodFor("month", "2026-01")).key, "2025-12");
  assert.equal(previousPeriod(periodFor("quarter", "2026-Q1")).key, "2025-Q4");
  assert.deepEqual(
    recentPeriods("month", at("2026-02-10"), 3).map((item) => item.key),
    ["2026-02", "2026-01", "2025-12"],
  );
});

test("the monthly email is due from the 2nd, for the month before", () => {
  assert.equal(dueMonth(at("2026-10-01")), null);
  assert.equal(dueMonth(at("2026-10-02", "00:30:00")), "2026-09");
  assert.equal(dueMonth(at("2026-01-15")), "2025-12");
  assert.equal(lastMonth(at("2026-03-05")).key, "2026-02");
});

test("the next monthly report follows the last one sent", () => {
  const next = nextMonthly("2026-09", at("2026-10-10"));
  assert.equal(next.period.key, "2026-10");
  assert.equal(next.day, "2026-11-02");
  const late = nextMonthly("2026-07", at("2026-10-10"));
  assert.equal(late.period.key, "2026-08");
  assert.equal(late.day, "2026-10-10");
});

const event = (type, day, data = {}) => ({
  type,
  occurredAt: at(day),
  data,
});

const events = [
  event("wallet.topup_succeeded", "2026-08-12", { amount_paise: 100_000 }),
  event("enrollment.approved", "2026-08-20", {
    campaign_id: "c1",
    title: "Old",
  }),
  event("campaign.status_changed", "2026-09-03", {
    campaign_id: "c1",
    title: "Diwali launch",
    to: "live",
  }),
  event("wallet.topup_succeeded", "2026-09-04", { amount_paise: 500_000 }),
  event("wallet.deposit_received", "2026-09-18", { amount_paise: 250_000 }),
  event("enrollment.approved", "2026-09-10", {
    campaign_id: "c1",
    platform_fee_paise: 1_000,
  }),
  event("enrollment.approved", "2026-09-11", { campaign_id: "c1" }),
  event("enrollment.approved", "2026-10-02", { campaign_id: "c1" }),
];

const sept = (extra = {}) =>
  buildReport({
    period: periodFor("month", "2026-09"),
    events,
    snapshot: null,
    milestones: [
      { stage: "signed_up", label: "Signed up", at: at("2026-08-01") },
      { stage: "funded", label: "Funded", at: at("2026-09-04") },
      { stage: "live", label: "Live", at: null },
    ],
    now: at("2026-10-05"),
    ...extra,
  });

test("a report counts only what happened inside the period", () => {
  const report = sept();
  assert.equal(report.ongoing, false);
  assert.deepEqual(report.funding, {
    addedPaise: 750_000,
    count: 2,
    previousPaise: 100_000,
  });
  assert.equal(report.results.value, 2);
  assert.equal(report.results.previous, 1);
  assert.equal(report.results.feePaise, 1_000);
  assert.equal(report.campaigns.launched, 1);
  assert.equal(report.campaigns.liveAtEnd, 1);
  assert.deepEqual(
    report.campaigns.rows.map((row) => [row.title, row.approved, row.launched]),
    [["Diwali launch", 2, true]],
  );
});

test("milestones without a date are left out and in-period ones flagged", () => {
  assert.deepEqual(
    sept().milestones.map((item) => [item.stage, item.inPeriod]),
    [
      ["signed_up", false],
      ["funded", true],
    ],
  );
});

test("a month that hasn't ended is marked as in progress", () => {
  assert.equal(sept({ now: at("2026-09-20") }).ongoing, true);
});

test("highlights state facts and compare with the period before", () => {
  const lines = highlights(sept());
  assert.match(
    lines[0],
    /^Wallet: ₹7,500 added in 2 top-ups \(₹1,000 in August 2026\)\.$/,
  );
  assert.match(
    lines[1],
    /^Results: 2 approved results \(1 in August 2026\)\.$/,
  );
  assert.match(lines[2], /1 went live; 1 live at the end of the period\.$/);
  assert.ok(lines.some((line) => /Reached “Funded” on 4 Sep/.test(line)));
});

test("quiet months are detected so no empty email goes out", () => {
  const quiet = buildReport({
    period: periodFor("month", "2026-06"),
    events,
    snapshot: null,
    milestones: [],
    now: at("2026-10-05"),
  });
  assert.equal(isQuiet(quiet), true);
  assert.equal(isQuiet(sept()), false);
});

test("talking points come from the numbers and always end on next steps", () => {
  const report = buildReport({
    period: periodFor("quarter", "2026-Q3"),
    events,
    snapshot: {
      fetchedAt: at("2026-10-01"),
      balancePaise: -500,
      staleReviews: 4,
      oldestReviewDays: 6,
      disputes: 1,
      campaigns: [],
    },
    milestones: [],
    now: at("2026-10-05"),
  });
  const points = talkingPoints(report);
  assert.match(points[0], /wallet is negative/);
  assert.ok(points.some((point) => point.startsWith("4 submissions waiting")));
  assert.ok(points.some((point) => point.startsWith("1 dispute open")));
  assert.equal(points.at(-1), "Agree goals and campaigns for the next period.");
  assert.ok(points.length <= 6);
});

test("the email is plain text built from the same facts", () => {
  const mail = reportEmail(sept(), {
    firstName: "Asha",
    accountName: "Kesar Foods",
    ownerFirstName: "Dev",
  });
  assert.equal(mail.subject, "Your Hypedrive results for September 2026");
  assert.ok(mail.body.startsWith("Hi Asha,"));
  assert.ok(
    mail.body.includes(
      "Here is how Kesar Foods did on Hypedrive in September 2026.",
    ),
  );
  assert.ok(mail.body.includes("- Diwali launch: live, 2 approved results"));
  assert.ok(mail.body.trimEnd().endsWith("Dev"));
  assert.ok(!mail.body.includes("{{"));
});
