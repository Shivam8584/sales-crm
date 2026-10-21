import assert from "node:assert/strict";
import { test } from "node:test";
import { STALL_THRESHOLDS, detectStall, journey } from "./activation.ts";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const t0 = Date.UTC(2026, 0, 1);
const account = (stage = "lead") => ({ name: "Acme", stage, createdAt: t0 });
const event = (type, hours, data) => ({
  type,
  occurredAt: t0 + hours * HOUR,
  data,
});
const status = (hours, campaign_id, to, extra = {}) =>
  event("campaign.status_changed", hours, {
    org_id: "org",
    campaign_id,
    to,
    ...extra,
  });
const at = (hours) => t0 + hours * HOUR;

const live = [
  event("user.signed_up", 0),
  event("organization.created", 1, { gstin: "27AAPFU0939F1ZV" }),
  event("wallet.deposit_received", 2, { amount_paise: 5_000_000 }),
  status(3, "c1", "pending_review"),
  status(4, "c1", "live"),
];

test("the path has five steps and org creation carries GST", () => {
  const current = journey(account(), live.slice(0, 2));
  assert.equal(current.stage, "org_created");
  assert.equal(current.stageAt, at(1));
  assert.equal(journey(account(), live).stage, "live");
});

test("a bank deposit funds the wallet like a top-up", () => {
  assert.equal(journey(account(), live.slice(0, 3)).stage, "funded");
});

test("a stage set by hand counts, and v1 gst_verified reads as org created", () => {
  assert.equal(
    journey(account("funded"), [event("user.signed_up", 0)]).stage,
    "funded",
  );
  assert.equal(journey(account("gst_verified"), []).stage, "org_created");
  assert.equal(journey(account("prospect"), []).stage, null);
});

test("signup without an organisation stalls after the threshold", () => {
  const events = [event("user.signed_up", 0)];
  const just = t0 + STALL_THRESHOLDS.signup_no_org - 1;
  assert.equal(detectStall(account(), events, just), null);
  const stall = detectStall(
    account(),
    events,
    t0 + STALL_THRESHOLDS.signup_no_org,
  );
  assert.equal(stall?.rule.id, "signup_no_org");
  assert.equal(stall?.since, t0);
});

test("a user-level GST failure stalls at once, and an org clears it", () => {
  const failed = [
    event("user.signed_up", 0),
    event("organization.gst_failed", 3, { user_id: "u", reason: "Cancelled" }),
  ];
  assert.equal(detectStall(account(), failed, at(3))?.rule.id, "gst_failed");
  const recovered = [...failed, event("organization.created", 5)];
  assert.equal(detectStall(account(), recovered, at(6)), null);
});

test("an org without GST is never a stall on its own", () => {
  const events = [event("user.signed_up", 0), event("organization.created", 1)];
  assert.equal(detectStall(account(), events, at(30)), null);
  assert.equal(
    detectStall(account(), events, at(1) + STALL_THRESHOLDS.verified_no_topup)
      ?.rule.id,
    "verified_no_topup",
  );
});

test("a campaign paused for funds is urgent, even after a top-up", () => {
  const paused = [
    ...live,
    status(10, "c1", "paused", { pause_reason: "insufficient_funds" }),
  ];
  const stall = detectStall(account(), paused, at(11));
  assert.equal(stall?.rule.id, "paused_no_funds");
  assert.equal(stall?.rule.priority, "urgent");
  assert.match(stall.title, /top up and resume/);
  const toppedUp = [
    ...paused,
    event("wallet.topup_succeeded", 12, { amount_paise: 1_000_000 }),
  ];
  const still = detectStall(account(), toppedUp, at(13));
  assert.equal(still?.rule.id, "paused_no_funds");
  assert.match(still.title, /still paused/);
  const resumed = [...toppedUp, status(14, "c1", "live")];
  assert.notEqual(
    detectStall(account(), resumed, at(15))?.rule.id,
    "paused_no_funds",
  );
});

test("a brand pause is not a funds rescue", () => {
  const paused = [
    ...live,
    status(10, "c1", "paused", { pause_reason: "brand_paused" }),
  ];
  assert.notEqual(
    detectStall(account(), paused, at(11))?.rule.id,
    "paused_no_funds",
  );
});

test("low balance only matters while campaigns are live", () => {
  const low = [...live, event("wallet.low_balance", 20, { balance_paise: 1 })];
  assert.equal(detectStall(account(), low, at(21))?.rule.id, "low_balance");
  const ended = [...low, status(22, "c1", "ended")];
  assert.notEqual(
    detectStall(account(), ended, at(23))?.rule.id,
    "low_balance",
  );
  const recovered = [
    ...low,
    event("wallet.recovered", 22, { balance_paise: 9e6 }),
  ];
  assert.notEqual(
    detectStall(account(), recovered, at(23))?.rule.id,
    "low_balance",
  );
});

test("review backlog stalls at 3 days and escalates at 14", () => {
  const overdue = (days) => [
    ...live,
    event("enrollment.review_overdue", 200, {
      campaign_id: "c1",
      count: 4,
      oldest_days: days,
    }),
  ];
  assert.equal(
    detectStall(account(), overdue(5), at(201))?.rule.id,
    "review_backlog",
  );
  const escalated = detectStall(account(), overdue(15), at(201));
  assert.equal(escalated?.rule.id, "review_escalation");
  assert.equal(escalated?.rule.priority, "urgent");
  assert.notEqual(
    detectStall(account(), overdue(5), at(200) + 3 * DAY)?.rule.id,
    "review_backlog",
    "an old report no longer describes the queue",
  );
});

test("changes requested and not resubmitted for 48 hours", () => {
  const events = [
    ...live.slice(0, 3),
    status(3, "c1", "pending_review"),
    status(5, "c1", "changes_requested"),
  ];
  assert.equal(detectStall(account(), events, at(6))?.rule.id, undefined);
  assert.equal(
    detectStall(account(), events, at(5) + STALL_THRESHOLDS.changes_requested)
      ?.rule.id,
    "changes_requested",
  );
  const resubmitted = [...events, status(30, "c1", "pending_review")];
  assert.notEqual(
    detectStall(account(), resubmitted, at(5) + 2 * DAY)?.rule.id,
    "changes_requested",
  );
});

test("renewal is due a week after the last campaign ended", () => {
  const events = [
    ...live,
    event("enrollment.approved", 10, { campaign_id: "c1" }),
    status(100, "c1", "ended"),
  ];
  assert.equal(detectStall(account(), events, at(101)), null);
  assert.equal(
    detectStall(account(), events, at(100) + 7 * DAY)?.rule.id,
    "renewal_due",
  );
  const next = [...events, status(120, "c2", "draft")];
  assert.equal(detectStall(account(), next, at(100) + 8 * DAY), null);
});

test("activated brands with nothing wrong are never stuck", () => {
  const events = [
    ...live,
    event("enrollment.approved", 100, { campaign_id: "c1" }),
  ];
  assert.equal(detectStall(account(), events, t0 + 10_000 * HOUR), null);
});
