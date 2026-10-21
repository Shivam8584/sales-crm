import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIRST_PLATFORM_STEP,
  FUNNEL_STEPS,
  median,
  orgTimelines,
  percentile,
  periodWindows,
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
