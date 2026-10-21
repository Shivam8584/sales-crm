import assert from "node:assert/strict";
import { test } from "node:test";
import { STALL_THRESHOLDS, detectStall, journey } from "./activation.ts";

const HOUR = 60 * 60_000;
const t0 = Date.UTC(2026, 0, 1);
const account = (stage = "lead") => ({ name: "Acme", stage, createdAt: t0 });
const event = (type, hours) => ({ type, occurredAt: t0 + hours * HOUR });

test("journey follows the furthest platform event", () => {
  const current = journey(account(), [
    event("user.signed_up", 0),
    event("organization.created", 2),
  ]);
  assert.equal(current.stage, "org_created");
  assert.equal(current.stageAt, t0 + 2 * HOUR);
});

test("a stage set by hand counts when it is further along", () => {
  assert.equal(
    journey(account("funded"), [event("user.signed_up", 0)]).stage,
    "funded",
  );
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

test("a failed GST check stalls at once", () => {
  const events = [
    event("user.signed_up", 0),
    event("organization.created", 1),
    event("organization.gst_failed", 3),
  ];
  assert.equal(
    detectStall(account(), events, t0 + 3 * HOUR)?.rule.id,
    "gst_failed",
  );
});

test("activated brands are never stuck", () => {
  const events = [
    event("user.signed_up", 0),
    event("enrollment.approved", 100),
  ];
  assert.equal(detectStall(account(), events, t0 + 10_000 * HOUR), null);
});
