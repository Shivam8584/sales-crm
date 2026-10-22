import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEmail } from "./normalize.ts";

test("ordinary addresses are accepted and lower-cased", () => {
  assert.equal(
    normalizeEmail(" Anu.Rao+crm@Brand.in "),
    "anu.rao+crm@brand.in",
  );
  assert.equal(normalizeEmail("o'brien@brand.co.in"), "o'brien@brand.co.in");
});

test("addresses that add recipients or mailto parameters are refused", () => {
  for (const input of [
    "a@b.com,c@d.com",
    "a@b.com;c@d.com",
    "a@b.com?bcc=c@d.com",
    "Name <a@b.com>",
    "a@b.com\r\nBcc: c@d.com",
    "a@b.com#frag",
  ]) {
    assert.equal(normalizeEmail(input), null, input);
  }
});
