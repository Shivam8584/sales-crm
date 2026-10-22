import assert from "node:assert/strict";
import { test } from "node:test";
import { toCsv } from "./csv.ts";

test("text that a spreadsheet would run as a formula is prefixed", () => {
  for (const cell of [
    "=1+1",
    "+cmd|' /C calc'!A0",
    "-2+3",
    "@SUM(A1)",
    "\tx",
    "\rx",
  ]) {
    assert.ok(
      toCsv([[cell]])
        .replace(/^"/, "")
        .startsWith("'"),
      JSON.stringify(cell),
    );
  }
});

test("numbers and phone numbers are left alone", () => {
  assert.equal(
    toCsv([[-5, 12.5, "+919820012345", "plain"]]),
    "-5,12.5,+919820012345,plain",
  );
});

test("cells with commas, quotes and line breaks are quoted", () => {
  assert.equal(toCsv([['a,"b"', "x\ny"]]), '"a,""b""","x\ny"');
});
