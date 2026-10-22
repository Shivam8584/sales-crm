import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProviderFailure,
  confidenceBand,
  mergeWinners,
  needsConfirmation,
  parseOrder,
  runWaterfall,
} from "./waterfall.ts";

const KNOWN = ["gst", "platform", "website"];

function found(value, confidence, source = "x") {
  return { value, confidence, source, fetchedAt: 1 };
}

function provider(id, fields, lookup, extra = {}) {
  const calls = [];
  return {
    id,
    label: id,
    fields,
    isConfigured: () => true,
    needs: () => null,
    lookup: async (input, context) => {
      calls.push(input);
      return lookup(input, context);
    },
    calls,
    ...extra,
  };
}

const context = { env: {}, homepage: async () => ({ ok: false, error: "no" }) };

test("order parsing keeps known ids, drops repeats and falls back", () => {
  assert.deepEqual(parseOrder("website, GST ,gst", KNOWN), ["website", "gst"]);
  assert.deepEqual(parseOrder("nope,,", KNOWN), ["gst", "platform", "website"]);
  assert.deepEqual(parseOrder(undefined, KNOWN), [
    "gst",
    "platform",
    "website",
  ]);
});

test("merge keeps the highest confidence and the earlier provider on a tie", () => {
  const winners = {};
  mergeWinners(winners, "a", "ea", { legalName: found("A", 0.7) }, [
    "legalName",
  ]);
  mergeWinners(winners, "b", "eb", { legalName: found("B", 0.7) }, [
    "legalName",
  ]);
  assert.equal(winners.legalName.provider, "a");
  mergeWinners(winners, "c", "ec", { legalName: found("C", 0.9) }, [
    "legalName",
  ]);
  assert.equal(winners.legalName.value, "C");
  assert.equal(winners.legalName.evidence, "ec");
});

test("merge ignores undeclared fields, blank values and bad confidence", () => {
  const winners = {};
  mergeWinners(
    winners,
    "a",
    "e",
    {
      legalName: found("  ", 1),
      email: found("x@y.in", 1),
      state: found("Bihar", 1.5),
      city: found("Patna", NaN),
      gstStatus: found("Active", 0.5),
    },
    ["legalName", "state", "city", "gstStatus"],
  );
  assert.deepEqual(Object.keys(winners), ["gstStatus"]);
});

test("the chain stops once every wanted field is confident", async () => {
  const first = provider("gst", ["legalName", "state"], async () => ({
    values: { legalName: found("Acme", 1), state: found("Bihar", 1) },
  }));
  const second = provider("website", ["legalName"], async () => ({
    values: {},
  }));
  const result = await runWaterfall({
    providers: [first, second],
    input: {},
    wanted: ["legalName", "state"],
    context,
  });
  assert.equal(second.calls.length, 0);
  assert.deepEqual(
    result.attempts.map((a) => [a.provider, a.status]),
    [["gst", "ok"]],
  );
});

test("a low-confidence value does not stop the chain and loses to a better one", async () => {
  const weak = provider("website", ["legalName"], async () => ({
    values: { legalName: found("Acme", 0.6) },
  }));
  const strong = provider("platform", ["legalName"], async () => ({
    values: { legalName: found("Acme Pvt Ltd", 0.85) },
    evidence: "from platform",
  }));
  const result = await runWaterfall({
    providers: [weak, strong],
    input: {},
    wanted: ["legalName"],
    context,
  });
  assert.equal(weak.calls.length, 1);
  assert.equal(result.winners.legalName.value, "Acme Pvt Ltd");
  assert.equal(result.winners.legalName.evidence, "from platform");
});

test("failures and skips are recorded and never end the chain", async () => {
  const broken = provider("gst", ["legalName"], async () => {
    throw new ProviderFailure("GSTIN not found");
  });
  const crashed = provider("platform", ["legalName"], async () => {
    throw new TypeError("boom");
  });
  const off = provider("website", ["legalName"], async () => ({ values: {} }), {
    isConfigured: () => false,
  });
  const missing = provider("din", ["legalName"], async () => ({ values: {} }), {
    needs: () => "No DIN",
  });
  const irrelevant = provider("x", ["email"], async () => ({ values: {} }));
  const fine = provider("y", ["legalName"], async () => ({
    values: { legalName: found("Acme", 0.9) },
  }));
  const original = console.error;
  console.error = () => {};
  const result = await runWaterfall({
    providers: [broken, crashed, off, missing, irrelevant, fine],
    input: {},
    wanted: ["legalName"],
    context,
  });
  console.error = original;
  assert.deepEqual(
    result.attempts.map((a) => [a.provider, a.status, a.note]),
    [
      ["gst", "failed", "GSTIN not found"],
      ["platform", "failed", "Failed unexpectedly"],
      ["website", "skipped", "Not configured"],
      ["din", "skipped", "No DIN"],
      ["x", "skipped", "Nothing left it could add"],
      ["y", "ok", undefined],
    ],
  );
  assert.equal(result.winners.legalName.value, "Acme");
});

test("an ok provider with no values is noted", async () => {
  const empty = provider("website", ["name"], async () => ({ values: {} }));
  const result = await runWaterfall({
    providers: [empty],
    input: {},
    wanted: ["name"],
    context,
  });
  assert.equal(result.attempts[0].note, "Nothing found");
});

test("only suggestible fields below the bar need confirmation", () => {
  assert.equal(needsConfirmation("gstin", 0.7), true);
  assert.equal(needsConfirmation("gstin", 1), false);
  assert.equal(needsConfirmation("siteDescription", 0.3), false);
  assert.equal(confidenceBand(0.99), "high");
  assert.equal(confidenceBand(0.7), "medium");
  assert.equal(confidenceBand(0.4), "low");
});
