import assert from "node:assert/strict";
import { test } from "node:test";
import { accountHealth, healthBand, weakestFactors } from "./health.ts";

const DAY = 24 * 60 * 60_000;
const now = Date.UTC(2026, 5, 1);

const base = (overrides = {}) => ({
  now,
  balancePaise: 4_000_000,
  wallet: "ok",
  campaigns: [{ id: "c1", status: "live", fillPct: 80 }],
  deposits30dPaise: 2_500_000,
  deposits90dPaise: 5_000_000,
  fundingCount: 2,
  staleReviews: 0,
  oldestReviewDays: null,
  disputes: 0,
  lastActivityAt: now - DAY,
  marketplaces: [{ slug: "amazon", firstAt: now - 200 * DAY }],
  membersJoined30d: 0,
  ...overrides,
});

test("a funded brand with a filling live campaign is healthy", () => {
  const health = accountHealth(base());
  assert.equal(health.score, 100);
  assert.equal(health.band, "healthy");
  assert.equal(health.factors.length, 6);
  assert.equal(
    health.factors.reduce((sum, factor) => sum + factor.weight, 0),
    100,
  );
});

test("a campaign paused for funds with a negative wallet is at risk", () => {
  const health = accountHealth(
    base({
      wallet: "negative",
      balancePaise: -20_000,
      campaigns: [
        {
          id: "c1",
          status: "paused",
          pauseReason: "insufficient_funds",
          fillPct: 40,
        },
      ],
      staleReviews: 6,
      oldestReviewDays: 15,
      lastActivityAt: now - 20 * DAY,
    }),
  );
  assert.equal(health.band, "at_risk");
  const [worst] = weakestFactors(health);
  assert.equal(worst.id, "campaigns");
  assert.equal(
    health.factors.find((factor) => factor.id === "funding").detail,
    "Wallet is negative",
  );
});

test("bands split at 70 and 45", () => {
  assert.equal(healthBand(70), "healthy");
  assert.equal(healthBand(69), "watch");
  assert.equal(healthBand(45), "watch");
  assert.equal(healthBand(44), "at_risk");
});

test("without a platform read, funding falls back to recent deposits", () => {
  const health = accountHealth(base({ balancePaise: null }));
  const funding = health.factors.find((factor) => factor.id === "funding");
  assert.equal(funding.score, 0.8);
});

test("expansion signals: sold out, repeat top-ups, a new marketplace, team growth", () => {
  const health = accountHealth(
    base({
      campaigns: [{ id: "c1", title: "Launch", status: "live", fillPct: 100 }],
      fundingCount: 3,
      marketplaces: [
        { slug: "amazon", firstAt: now - 200 * DAY },
        { slug: "flipkart", firstAt: now - 4 * DAY },
      ],
      membersJoined30d: 1,
    }),
  );
  assert.deepEqual(
    health.signals.map((signal) => signal.id),
    ["sold_out", "repeat_topup", "new_marketplace", "team_growth"],
  );
  assert.match(health.signals[2].detail, /Flipkart/);
});

test("a first marketplace isn't expansion, and renewal needs a recent end", () => {
  const fresh = accountHealth(
    base({ marketplaces: [{ slug: "amazon", firstAt: now - DAY }] }),
  );
  assert.equal(fresh.signals.length, 0);
  const ended = (days) =>
    accountHealth(
      base({
        campaigns: [
          { id: "c1", status: "ended", fillPct: 90, endedAt: now - days * DAY },
        ],
      }),
    ).signals.map((signal) => signal.id);
  assert.deepEqual(ended(9), ["renewal_due"]);
  assert.deepEqual(ended(45), []);
});

test("a brand that never funded or ran a campaign is at risk, not healthy by default", () => {
  const health = accountHealth(
    base({
      balancePaise: 0,
      campaigns: [],
      deposits30dPaise: 0,
      deposits90dPaise: 0,
      fundingCount: 0,
    }),
  );
  assert.equal(health.band, "at_risk");
  assert.equal(
    health.factors.find((factor) => factor.id === "funding").detail,
    "Never funded",
  );
  assert.equal(
    health.factors.find((factor) => factor.id === "reviews").score,
    0.5,
  );
});
