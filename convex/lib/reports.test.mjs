import assert from "node:assert/strict";
import { test } from "node:test";
import { median, percentile, periodWindows } from "./reports.ts";

test("median and nearest-rank percentile", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(percentile([10, 20, 30, 40, 50], 90), 50);
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
});

test("rolling windows compare against the same length before", () => {
  const now = Date.UTC(2026, 4, 20, 12);
  const { current, previous } = periodWindows("7d", now);
  assert.equal(current.end, now);
  assert.equal(previous.end, current.start);
  assert.equal(current.end - current.start, previous.end - previous.start);
});

test("quarters start at midnight IST and compare to the same span last quarter", () => {
  const now = Date.UTC(2026, 4, 20, 12);
  const { current, previous } = periodWindows("quarter", now);
  assert.equal(current.start, Date.UTC(2026, 3, 1) - 330 * 60_000);
  assert.equal(previous.start, Date.UTC(2026, 0, 1) - 330 * 60_000);
  assert.equal(previous.end - previous.start, current.end - current.start);
});
