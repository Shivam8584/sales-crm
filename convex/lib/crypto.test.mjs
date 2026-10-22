import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  encryptionConfigured,
} from "./crypto.ts";

const MASTER = "a-long-random-master-key-of-32+chars";

function withKey(value, run) {
  const before = process.env.KEYS_ENCRYPTION_KEY;
  if (value === undefined) delete process.env.KEYS_ENCRYPTION_KEY;
  else process.env.KEYS_ENCRYPTION_KEY = value;
  return Promise.resolve(run()).finally(() => {
    if (before === undefined) delete process.env.KEYS_ENCRYPTION_KEY;
    else process.env.KEYS_ENCRYPTION_KEY = before;
  });
}

test("a value round-trips and the payload hides it", () =>
  withKey(MASTER, async () => {
    const payload = await encryptSecret("sk-live-1234", "OPENAI_API_KEY");
    assert.match(payload, /^v1\.[\w+/=]+\.[\w+/=]+$/);
    assert.ok(!payload.includes("sk-live-1234"));
    assert.equal(
      await decryptSecret(payload, "OPENAI_API_KEY"),
      "sk-live-1234",
    );
  }));

test("every encryption uses a fresh IV", () =>
  withKey(MASTER, async () => {
    assert.notEqual(await encryptSecret("same"), await encryptSecret("same"));
  }));

test("unicode survives", () =>
  withKey(MASTER, async () => {
    assert.equal(
      await decryptSecret(await encryptSecret("₹ कुंजी")),
      "₹ कुंजी",
    );
  }));

test("a payload is bound to its context", () =>
  withKey(MASTER, async () => {
    const payload = await encryptSecret("x", "KYC_API_TOKEN");
    await assert.rejects(() => decryptSecret(payload, "EXOTEL_API_TOKEN"));
  }));

test("tampering and a different master key are rejected", () =>
  withKey(MASTER, async () => {
    const payload = await encryptSecret("x", "A");
    const [version, iv, sealed] = payload.split(".");
    const flipped = sealed.startsWith("A")
      ? `B${sealed.slice(1)}`
      : `A${sealed.slice(1)}`;
    await assert.rejects(() =>
      decryptSecret(`${version}.${iv}.${flipped}`, "A"),
    );
    await assert.rejects(() => decryptSecret("v2.a.b", "A"));
    await withKey(`${MASTER}-rotated`, () =>
      assert.rejects(() => decryptSecret(payload, "A")),
    );
  }));

test("without a long enough master key nothing is encrypted", async () => {
  await withKey(undefined, async () => {
    assert.equal(encryptionConfigured(), false);
    await assert.rejects(() => encryptSecret("x"), /KEYS_ENCRYPTION_KEY/);
  });
  await withKey("too-short", async () => {
    assert.equal(encryptionConfigured(), false);
    await assert.rejects(() => encryptSecret("x"));
  });
  await withKey(MASTER, async () => assert.equal(encryptionConfigured(), true));
});
