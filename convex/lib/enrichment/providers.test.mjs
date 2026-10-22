import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_WANTED, accountChain } from "./providers.ts";
import { runWaterfall } from "./waterfall.ts";

const context = {
  env: { ENRICHMENT_SANDBOX: "1" },
  homepage: async () => {
    throw new Error("the sandbox must not fetch");
  },
};

function run(input, env = context.env) {
  return runWaterfall({
    providers: accountChain(env),
    input,
    wanted: ACCOUNT_WANTED,
    context: { ...context, env },
  });
}

test("the chain defaults to gst, platform, website and honours ENRICHMENT_ORDER", () => {
  const ids = (env) => accountChain(env).map((provider) => provider.id);
  assert.deepEqual(ids({}), ["gst", "platform", "website"]);
  assert.deepEqual(ids({ ENRICHMENT_ORDER: "website,gst" }), [
    "website",
    "gst",
  ]);
  assert.deepEqual(ids({ ENRICHMENT_ORDER: "bogus" }), [
    "gst",
    "platform",
    "website",
  ]);
});

test("sandbox: registry first, then the website only for what is still missing", async () => {
  const { attempts, winners } = await run({
    gstin: "10BSDPG0911J1ZG",
    domain: "kesarleaf.in",
    platform: { legalName: "Kesar Leaf Pvt Ltd" },
  });
  assert.deepEqual(
    attempts.map((a) => [a.provider, a.status]),
    [
      ["gst", "ok"],
      ["platform", "skipped"],
      ["website", "ok"],
    ],
  );
  assert.equal(winners.legalName.source, "gst:sandbox");
  assert.equal(winners.siteDescription.source, "website:sandbox");
  assert.equal(winners.gstin.source, "gst:sandbox");
});

test("sandbox: without a GSTIN the platform and website fill in", async () => {
  const { attempts, winners } = await run({
    domain: "kesarleaf.in",
    platform: { legalName: "Kesar Leaf Pvt Ltd" },
  });
  assert.equal(attempts[0].status, "skipped");
  assert.equal(winners.legalName.source, "platform");
  assert.equal(winners.legalName.confidence, 0.85);
  assert.equal(winners.gstin.value, "10BSDPG0911J1ZG");
  assert.equal(winners.gstin.confidence, 0.7);
  assert.equal(winners.name.value, "Kesarleaf");
});

test("without sandbox or KYC settings the registry is skipped, not failed", async () => {
  const env = {};
  const { attempts } = await runWaterfall({
    providers: accountChain(env),
    input: { gstin: "10BSDPG0911J1ZG", platform: { legalName: "A Ltd" } },
    wanted: ACCOUNT_WANTED,
    context: { env, homepage: async () => ({ ok: false, error: "offline" }) },
  });
  assert.deepEqual(
    attempts.map((a) => [a.provider, a.status]),
    [
      ["gst", "skipped"],
      ["platform", "ok"],
      ["website", "skipped"],
    ],
  );
});
