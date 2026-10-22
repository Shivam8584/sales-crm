import assert from "node:assert/strict";
import { test } from "node:test";
import { emailType, leadSlaMs, scoreBand, scoreLead } from "./scoring.ts";

const base = (overrides = {}) => ({
  kind: "contact",
  source: "demo_form",
  utm: {},
  ...overrides,
});

test("a best-case demo request is hot and explains itself in four reasons", () => {
  const result = scoreLead(
    base({
      kind: "demo",
      utm: { source: "google", medium: "cpc" },
      landingPage: "https://hypedrive.in/demo",
      email: "priya@brand.in",
      website: "brand.in",
      gstin: "27AAPFU0939F1ZV",
      gstVerified: true,
      companyName: "Brand Pvt Ltd",
      name: "Priya",
      message: "We want a demo and pricing for a campaign next month",
    }),
  );
  assert.equal(result.score, 100);
  assert.equal(result.band, "hot");
  assert.equal(result.reasons.length, 4);
  assert.deepEqual(result.reasons.slice(0, 2), [
    "Demo request",
    "GST verified",
  ]);
});

test("a bare contact form from a free email is cold", () => {
  const result = scoreLead(
    base({ email: "x@gmail.com", companyName: "x", name: "x" }),
  );
  assert.equal(result.band, "cold");
  assert.equal(result.score, 15);
  assert.deepEqual(result.reasons, ["Contact form"]);
});

test("demo request with a company email and website is warm", () => {
  const result = scoreLead(
    base({
      kind: "demo",
      email: "a@brand.in",
      website: "brand.in",
      companyName: "Brand",
      name: "A",
    }),
  );
  assert.equal(result.score, 35 + 10 + 8 + 4);
  assert.equal(result.band, "warm");
});

test("band thresholds", () => {
  assert.equal(scoreBand(70), "hot");
  assert.equal(scoreBand(69), "warm");
  assert.equal(scoreBand(40), "warm");
  assert.equal(scoreBand(39), "cold");
});

test("an unverified GSTIN counts for less than a verified one", () => {
  const given = scoreLead(base({ gstin: "27AAPFU0939F1ZV" }));
  const verified = scoreLead(
    base({ gstin: "27AAPFU0939F1ZV", gstVerified: true }),
  );
  assert.ok(verified.score > given.score);
  assert.ok(given.reasons.includes("GSTIN given"));
  assert.ok(verified.reasons.includes("GST verified"));
  assert.equal(verified.reasons.includes("GSTIN given"), false);
});

test("a verified flag without a GSTIN adds nothing", () => {
  assert.equal(
    scoreLead(base({ gstVerified: true })).score,
    scoreLead(base()).score,
  );
});

test("intent words, repeats and platform links raise the score", () => {
  const plain = scoreLead(base());
  assert.ok(
    scoreLead(base({ message: "what is your pricing?" })).score > plain.score,
  );
  assert.ok(scoreLead(base({ repeats: 1 })).score > plain.score);
  assert.ok(
    scoreLead(base({ platform: "org" })).score >
      scoreLead(base({ platform: "user" })).score,
  );
});

test("intent words match word starts, not the middle of a word", () => {
  assert.equal(
    scoreLead(base({ message: "undemocratic prices" })).reasons.includes(
      "Mentions price",
    ),
    true,
  );
  assert.equal(
    scoreLead(base({ message: "undemocratic" })).score,
    scoreLead(base()).score,
  );
});

test("paid medium beats a plain referral", () => {
  const paid = scoreLead(base({ utm: { source: "google", medium: "CPC" } }));
  const referred = scoreLead(base({ utm: { source: "newsletter" } }));
  assert.ok(paid.score > referred.score);
  assert.ok(referred.score > scoreLead(base()).score);
});

test("company name only counts when it differs from the person's name", () => {
  const same = scoreLead(base({ name: "Priya", companyName: "priya" }));
  const named = scoreLead(base({ name: "Priya", companyName: "Brand" }));
  assert.equal(named.score - same.score, 4);
});

test("email type", () => {
  assert.equal(emailType("a@Gmail.com"), "free");
  assert.equal(emailType("a@brand.in"), "company");
  assert.equal(emailType(undefined), null);
  assert.equal(emailType("nodomain"), null);
});

test("hot leads get the shorter SLA window, others the normal one", () => {
  assert.equal(leadSlaMs(300_000, 70, 0.5), 150_000);
  assert.equal(leadSlaMs(300_000, 69, 0.5), 300_000);
  assert.equal(leadSlaMs(300_000, undefined, 0.5), 300_000);
  assert.equal(leadSlaMs(300_000, 90, 1), 300_000);
});
