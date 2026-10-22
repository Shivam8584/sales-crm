import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_SECRET_LENGTH,
  SECRET_KEYS,
  checkSecretValue,
  hintFor,
  secretKey,
} from "./secrets.ts";

test("names are unique and only registered keys resolve", () => {
  const names = SECRET_KEYS.map((key) => key.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(secretKey("OPENAI_API_KEY")?.secret, true);
  assert.equal(secretKey("JWT_PRIVATE_KEY"), undefined);
  assert.equal(secretKey("AUTH_LOGTO_SECRET"), undefined);
});

test("secrets show only their last four characters", () => {
  assert.equal(hintFor(secretKey("OPENAI_API_KEY"), "sk-abcdef1234"), "1234");
  assert.equal(hintFor(secretKey("AI_MODEL"), "gpt-6.1-sol"), "gpt-6.1-sol");
});

test("values are trimmed and checked", () => {
  const token = secretKey("KYC_API_TOKEN");
  assert.deepEqual(checkSecretValue(token, "  abc  "), {
    ok: true,
    value: "abc",
  });
  assert.equal(checkSecretValue(token, "   ").ok, false);
  assert.equal(checkSecretValue(token, "two words").ok, false);
  assert.equal(checkSecretValue(token, "line\nbreak").ok, false);
  assert.equal(
    checkSecretValue(token, "x".repeat(MAX_SECRET_LENGTH + 1)).ok,
    false,
  );
});

test("URL keys need an http(s) URL", () => {
  const url = secretKey("OPENAI_BASE_URL");
  assert.equal(checkSecretValue(url, "https://proxy.example/v1").ok, true);
  assert.equal(checkSecretValue(url, "proxy.example/v1").ok, false);
  assert.equal(checkSecretValue(url, "javascript:alert(1)").ok, false);
  assert.equal(checkSecretValue(url, "ftp://x.example").ok, false);
});
