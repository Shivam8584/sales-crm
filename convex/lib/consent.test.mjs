import assert from "node:assert/strict";
import { test } from "node:test";
import { makeScrubber } from "./consent.ts";

const names = ["Priya Iyer", "Priya", "Iyer"];
const ids = ["priya@kesarleaf.in", "+919820045678", "9820045678"];

test("replaces names and the subject's identifiers", () => {
  const scrub = makeScrubber(names, ids);
  assert.equal(
    scrub("Call Priya Iyer on 9820045678"),
    "Call Erased person on [redacted]",
  );
  assert.equal(scrub("mail priya@kesarleaf.in"), "mail [redacted]");
  assert.equal(scrub("Priyanka called"), "Priyanka called");
});

test("generic mode also redacts any email or phone", () => {
  assert.equal(makeScrubber(names, ids)("cc ops@acme.in"), "cc [redacted]");
  assert.equal(
    makeScrubber(names, ids, false)("cc ops@acme.in"),
    "cc ops@acme.in",
  );
});

test("narrow mode leaves numbers that aren't the subject's alone", () => {
  const narrow = makeScrubber(names, ids, false);
  assert.equal(
    narrow("Priya's plan 2025-2026, ₹1500000"),
    "Erased person's plan 2025-2026, ₹1500000",
  );
});
