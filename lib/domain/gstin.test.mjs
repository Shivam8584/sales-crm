import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGstin, gstinCheckChar, panRoot } from "./gstin.ts";

test("accepts real GSTINs in any spacing or case", () => {
  for (const gstin of [
    "10BSDPG0911J1ZG",
    "29AAACI4798L1ZU",
    " 29aaaci4798l1zu ",
    "29-AAACI-4798L1ZU",
  ]) {
    assert.equal(checkGstin(gstin).ok, true, gstin);
  }
  assert.equal(gstinCheckChar("29AAACI4798L1Z"), "U");
});

test("says why a GSTIN is wrong", () => {
  const cases = [
    ["29AAACI4798L1ZV", "checksum"],
    ["29AAACI4798L1Z", "short"],
    ["", "empty"],
    ["29AAACI4798L1XU", "format"],
    ["ABAAACI4798L1ZU", "format"],
  ];
  for (const [gstin, reason] of cases) {
    const check = checkGstin(gstin);
    assert.equal(check.ok ? null : check.reason, reason, gstin);
  }
});

test("the checksum catches every single-character typo", () => {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const base of ["10BSDPG0911J1ZG", "29AAACI4798L1ZU"]) {
    for (let index = 0; index < 14; index++) {
      for (const char of alphabet) {
        if (char === base[index]) continue;
        const typo = base.slice(0, index) + char + base.slice(index + 1);
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(typo))
          continue;
        assert.equal(checkGstin(typo).ok, false, typo);
      }
    }
  }
});

test("PAN root is shared across a legal entity's GSTINs", () => {
  assert.equal(panRoot("29AAACI4798L1ZU"), "AAACI4798L");
  assert.equal(panRoot("27aaaci4798l1zx"), "AAACI4798L");
});
