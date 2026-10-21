import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIRST_PLATFORM_STEP,
  FUNNEL_STEPS,
  UNASSIGNED,
  bySource,
  sourceOf,
  funnel,
  istDay,
  median,
  orgTimelines,
  percentile,
  periodWindows,
  pipeline,
  teamReport,
  timeToActivate,
} from "./reports.ts";

test("median and nearest-rank percentile", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(percentile([10, 20, 30, 40, 50], 90), 50);
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
});

test("rolling windows compare against the same length before", () => {
  const now = Date.UTC(2026, 4, 20, 12);
  const { current, previous } = periodWindows("7d", now);
  assert.equal(current.end, now);
  assert.equal(previous.end, current.start);
  assert.equal(current.end - current.start, previous.end - previous.start);
});

test("quarters start at midnight IST and compare to the same span last quarter", () => {
  const now = Date.UTC(2026, 4, 20, 12);
  const { current, previous } = periodWindows("quarter", now);
  assert.equal(current.start, Date.UTC(2026, 3, 1) - 330 * 60_000);
  assert.equal(previous.start, Date.UTC(2026, 0, 1) - 330 * 60_000);
  assert.equal(previous.end - previous.start, current.end - current.start);
});

test("the platform funnel has five steps and reads v2 events", () => {
  const platform = FUNNEL_STEPS.slice(FIRST_PLATFORM_STEP).map((s) => s.key);
  assert.deepEqual(platform, [
    "signed_up",
    "org_created",
    "funded",
    "live",
    "activated",
  ]);
  const event = (type, at, data, processed = true) => ({
    type,
    orgId: "org_1",
    userId: data.user_id ?? data.created_by,
    occurredAt: at,
    payload: JSON.stringify(data),
    processedAt: processed ? at : undefined,
  });
  const { orgs } = orgTimelines(
    [
      event("user.signed_up", 1, { user_id: "u1" }),
      event("organization.created", 2, { org_id: "org_1", created_by: "u1" }),
      event("wallet.deposit_received", 3, { org_id: "org_1" }),
      event("campaign.status_changed", 4, {
        campaign_id: "c",
        to: "pending_review",
      }),
      event("campaign.status_changed", 5, { campaign_id: "c", to: "live" }),
      event("enrollment.approved", 6, { campaign_id: "c" }, false),
    ],
    [],
    [],
  );
  assert.deepEqual(orgs.get("org_1"), {
    signed_up: 1,
    org_created: 2,
    funded: 3,
    live: 5,
  });
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Wednesday 21 Oct 2026, 12:00 IST.
const NOW = Date.UTC(2026, 9, 21, 6, 30);

test("IST calendar day", () => {
  assert.equal(istDay(Date.UTC(2026, 9, 20, 19)), "2026-10-21");
  assert.equal(istDay(Date.UTC(2026, 9, 20, 18, 29)), "2026-10-20");
});

test("funnel counts each unit up to its furthest step and finds the worst step", () => {
  const result = funnel([8, 3, 1, 0].map((furthest) => ({ furthest })));
  assert.deepEqual(
    result.steps.map((step) => step.count),
    [4, 3, 2, 2, 1, 1, 1, 1, 1],
  );
  assert.equal(result.steps[0].stepRate, null);
  assert.equal(result.steps[1].stepRate, 0.75);
  assert.equal(result.steps[4].stepRate, 0.5);
  assert.equal(result.steps[4].overallRate, 0.25);
  assert.equal(result.biggestDrop, "signed_up");
});

test("pipeline sums open stages per currency and closes inside the window", () => {
  const window = { start: NOW - 7 * DAY, end: NOW };
  const inr = (amount) => ({ amount, currency: "INR" });
  const result = pipeline(
    [
      { stage: "demo", amount: inr(100), ownerId: "a" },
      { stage: "demo", amount: { amount: 7, currency: "USD" }, ownerId: "a" },
      { stage: "proposal", amount: inr(50), ownerId: "b" },
      { stage: "won", amount: inr(30), ownerId: "a", closedAt: NOW - DAY },
      { stage: "won", amount: inr(40), ownerId: "a", closedAt: NOW - 8 * DAY },
      { stage: "lost", amount: inr(20), ownerId: "a", closedAt: NOW - DAY },
    ],
    "a",
    window,
  );
  const demo = result.open.find((stage) => stage.stage === "demo");
  assert.equal(demo.count, 2);
  assert.deepEqual(demo.totals, [inr(100), { amount: 7, currency: "USD" }]);
  assert.equal(result.open.find((s) => s.stage === "proposal").count, 0);
  assert.deepEqual(result.won, { count: 1, totals: [inr(30)] });
  assert.deepEqual(result.lost, { count: 1, totals: [inr(20)] });
  assert.deepEqual(result.weightedTotals, [
    inr(25),
    { amount: 2, currency: "USD" },
  ]);
});

test("time to activate: medians and p90 for steps completed in the window", () => {
  const orgs = new Map([
    ["o1", { signed_up: 0, org_created: 2 * DAY, funded: NOW - DAY }],
    ["o2", { signed_up: 0, org_created: 4 * DAY }],
    ["o3", { signed_up: 0 }],
  ]);
  const result = timeToActivate(orgs, { start: 0, end: NOW });
  const first = result.steps[0];
  assert.equal(first.completed, 2);
  assert.equal(first.medianMs, 3 * DAY);
  assert.equal(first.p90Ms, 4 * DAY);
  assert.equal(first.waiting, 1);
  assert.equal(result.steps[1].completed, 1);
  assert.equal(result.steps[1].waiting, 1);
  assert.equal(result.overall.completed, 0);
});

const event = (type, orgId, at, data) => ({
  type,
  orgId,
  userId: data.user_id ?? data.created_by,
  occurredAt: at,
  payload: JSON.stringify(data),
  processedAt: at,
});

test("team leaderboard: per-rep period figures, previous period and snapshots", () => {
  const lead = (id, ownerId, ago, kind, touchAfter) => ({
    _id: id,
    _creationTime: NOW - ago,
    kind,
    source: "demo_form",
    utm: {},
    status: touchAfter === undefined ? "new" : "contacted",
    ownerId,
    firstTouchedAt:
      touchAfter === undefined ? undefined : NOW - ago + touchAfter,
  });
  const inr = (amount) => ({ amount, currency: "INR" });
  const report = teamReport({
    leads: [
      lead("l1", "a", DAY, "demo", 2 * MIN),
      lead("l2", "a", 2 * DAY, "contact", 10 * MIN),
      lead("l3", "a", 3 * DAY, "manual"),
      lead("l4", "b", DAY, "demo"),
      lead("l5", "a", 8 * DAY, "demo", MIN),
      lead("l6", undefined, DAY, "signup"),
    ],
    tasks: [
      { assigneeId: "a", status: "done", completedAt: NOW - DAY },
      { assigneeId: "a", status: "done", completedAt: NOW - 10 * DAY },
      { assigneeId: "a", status: "todo", dueDate: "2026-10-20" },
      { assigneeId: "a", status: "todo", dueDate: "2026-10-21" },
      { assigneeId: "b", status: "in_progress", dueDate: "2026-10-01" },
    ],
    interactions: [
      { kind: "call", actorId: "a", occurredAt: NOW - HOUR },
      { kind: "meeting", actorId: "a", occurredAt: NOW - 2 * DAY },
      { kind: "email", actorId: "a", occurredAt: NOW - HOUR },
      { kind: "call", occurredAt: NOW - HOUR },
      { kind: "call", actorId: "a", occurredAt: NOW - HOUR, automated: true },
      { kind: "call", actorId: "b", occurredAt: NOW - 9 * DAY },
    ],
    deals: [
      { stage: "won", amount: inr(100000), ownerId: "a", closedAt: NOW - DAY },
      {
        stage: "won",
        amount: { amount: 5000, currency: "USD" },
        ownerId: "a",
        closedAt: NOW - 2 * DAY,
      },
      { stage: "lost", amount: inr(1), ownerId: "a", closedAt: NOW - DAY },
      {
        stage: "won",
        amount: inr(20000),
        ownerId: "b",
        closedAt: NOW - 8 * DAY,
      },
      { stage: "won", amount: inr(7), ownerId: "a" },
    ],
    accounts: [
      {
        _id: "acc1",
        _creationTime: 0,
        stage: "live",
        ownerId: "a",
        platformOrgId: "org1",
      },
      { _id: "acc2", _creationTime: 0, stage: "prospect", ownerId: "a" },
      { _id: "acc3", _creationTime: 0, stage: "activated", ownerId: "b" },
    ],
    people: [],
    events: [
      event("user.signed_up", undefined, NOW - 20 * DAY, { user_id: "u1" }),
      event("organization.created", "org1", NOW - 19 * DAY, {
        org_id: "org1",
        created_by: "u1",
      }),
      event("enrollment.approved", "org1", NOW - 3 * DAY, {
        org_id: "org1",
        campaign_id: "c",
      }),
    ],
    memberIds: ["a", "b", "c"],
    slaMs: 5 * MIN,
    now: NOW,
    period: "7d",
  });

  assert.deepEqual(
    report.rows.map((row) => row.ownerId),
    ["a", "b", "c", UNASSIGNED],
  );
  const [a, b, c, unassigned] = report.rows;
  assert.equal(a.current.leads, 3);
  assert.equal(a.current.speed.leads, 2);
  assert.equal(a.current.speed.medianMs, 6 * MIN);
  assert.equal(a.current.speed.p90Ms, 10 * MIN);
  assert.equal(a.current.speed.withinRate, 0.5);
  assert.equal(a.previous.leads, 1);
  assert.equal(a.previous.speed.withinRate, 1);
  assert.equal(a.current.tasksDone, 1);
  assert.equal(a.previous.tasksDone, 1);
  assert.equal(a.overdue, 1);
  assert.equal(a.current.calls, 1);
  assert.equal(a.current.meetings, 1);
  assert.equal(a.current.won, 2);
  assert.deepEqual(a.current.wonValue, [
    inr(100000),
    { amount: 5000, currency: "USD" },
  ]);
  assert.equal(a.current.activated, 1);
  assert.equal(a.platformAccounts, 1);
  assert.equal(a.activatedAccounts, 1);

  assert.equal(b.current.leads, 1);
  assert.equal(b.current.speed.medianMs, null);
  assert.equal(b.current.speed.withinRate, 0);
  assert.equal(b.current.speed.waiting, 1);
  assert.equal(b.overdue, 1);
  assert.equal(b.previous.calls, 1);
  assert.equal(b.previous.won, 1);
  assert.equal(b.current.activated, 0);
  assert.equal(b.platformAccounts, 1);
  assert.equal(b.activatedAccounts, 1);

  assert.equal(c.current.leads, 0);
  assert.equal(c.overdue, 0);
  assert.equal(unassigned.current.leads, 1);

  const team = report.team;
  assert.equal(team.current.leads, 5);
  assert.equal(team.current.speed.due, 4);
  assert.equal(team.current.speed.withinRate, 0.25);
  assert.equal(team.current.speed.medianMs, 6 * MIN);
  assert.equal(team.overdue, 2);
  assert.equal(team.platformAccounts, 2);
  assert.equal(team.activatedAccounts, 2);
});

test("sources group by UTM, then by how the lead arrived", () => {
  assert.deepEqual(
    sourceOf({ utm: { source: " Google " }, source: "demo_form" }),
    {
      key: "utm:google",
      label: "google",
    },
  );
  assert.equal(sourceOf({ utm: {}, source: "demo_form" }).key, "direct");
  assert.equal(sourceOf({ utm: {}, source: "calcom" }).key, "src:calcom");
  const unit = (sourceKey, furthest, touch) => ({
    sourceKey,
    sourceLabel: sourceKey,
    furthest,
    createdAt: 0,
    lead: { kind: "demo", _creationTime: 0, firstTouchedAt: touch },
  });
  const rows = bySource([
    unit("utm:google", 8, 4 * MIN),
    unit("utm:google", 1, 2 * MIN),
    unit("utm:google", 0),
    unit("direct", 3, MIN),
  ]);
  assert.deepEqual(rows, [
    {
      key: "utm:google",
      label: "utm:google",
      leads: 3,
      contacted: 2,
      demo: 1,
      converted: 1,
      activated: 1,
      medianSpeedMs: 3 * MIN,
    },
    {
      key: "direct",
      label: "direct",
      leads: 1,
      contacted: 1,
      demo: 1,
      converted: 1,
      activated: 0,
      medianSpeedMs: MIN,
    },
  ]);
});
