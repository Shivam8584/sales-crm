import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeCursor,
  encodeCursor,
  isBefore,
  keyed,
  mergePage,
  scan,
} from "./audit.ts";

const row = (at, ct = at, extra = {}) => ({ at, ct, ...extra });

async function* stream(rows) {
  for (const item of rows) yield item;
}

test("cursors round-trip and reject junk", () => {
  const key = { at: 1_700_000_000_000, ct: 1_700_000_000_123.456 };
  assert.deepEqual(decodeCursor(encodeCursor(key)), key);
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor("nope"), null);
  assert.equal(decodeCursor("1:2:3"), null);
});

test("rows with the same time are ordered by when they were written", () => {
  assert.ok(isBefore(row(5, 1), row(5, 2)));
  assert.ok(isBefore(row(4, 9), row(5, 1)));
  assert.ok(!isBefore(row(5, 2), row(5, 2)));
});

test("scan skips rows at or after the cursor and keeps matches", async () => {
  const rows = [row(9), row(8, 1), row(8, 2), row(7), row(6)];
  const result = await scan(stream(rows), (r) => r.at !== 7, {
    before: { at: 8, ct: 2 },
    limit: 10,
    maxScan: 100,
  });
  assert.deepEqual(
    result.rows.map((r) => [r.at, r.ct]),
    [
      [8, 1],
      [6, 6],
    ],
  );
  assert.equal(result.reach, null);
});

test("scan stops one match past the limit and reports where", async () => {
  const rows = [row(9), row(8), row(7), row(6)];
  const result = await scan(stream(rows), () => true, {
    before: null,
    limit: 2,
    maxScan: 100,
  });
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.reach, { at: 7, ct: 7 });
});

test("scan gives up after maxScan rows even with no match", async () => {
  const rows = [row(9), row(8), row(7), row(6)];
  const result = await scan(stream(rows), () => false, {
    before: null,
    limit: 5,
    maxScan: 3,
  });
  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.reach, { at: 7, ct: 7 });
});

test("keyed turns documents into positioned rows", async () => {
  const out = [];
  for await (const item of keyed(stream([{ time: 3, made: 4 }]), (doc) => ({
    at: doc.time,
    ct: doc.made,
    doc,
  }))) {
    out.push(item);
  }
  assert.deepEqual(out, [{ at: 3, ct: 4, doc: { time: 3, made: 4 } }]);
});

test("merging finished sources interleaves them and is done", () => {
  const a = {
    rows: [row(9, 9, { s: "a" }), row(5, 5, { s: "a" })],
    reach: null,
  };
  const b = { rows: [row(7, 7, { s: "b" })], reach: null };
  const page = mergePage([a, b], 10);
  assert.deepEqual(
    page.rows.map((r) => r.at),
    [9, 7, 5],
  );
  assert.equal(page.next, null);
});

test("merging cuts at the limit and resumes after the last row shown", () => {
  const a = { rows: [row(9), row(7), row(5)], reach: null };
  const b = { rows: [row(8), row(6)], reach: null };
  const page = mergePage([a, b], 3);
  assert.deepEqual(
    page.rows.map((r) => r.at),
    [9, 8, 7],
  );
  assert.deepEqual(page.next, { at: 7, ct: 7 });
});

test("an unfinished source holds back rows older than where it stopped", () => {
  const a = { rows: [row(9), row(8)], reach: { at: 8, ct: 8 } };
  const b = { rows: [row(7), row(3)], reach: null };
  const page = mergePage([a, b], 10);
  assert.deepEqual(
    page.rows.map((r) => r.at),
    [9, 8],
  );
  assert.deepEqual(page.next, { at: 8, ct: 8 });
});

test("resuming from `next` never repeats or drops a row", async () => {
  const all = [
    row(10, 1),
    row(10, 2),
    row(9, 3),
    row(9, 4),
    row(8, 5),
    row(7, 6),
    row(7, 7),
    row(6, 8),
    row(5, 9),
    row(4, 10),
  ];
  const left = all.filter((_, index) => index % 2 === 0).toReversed();
  const right = all.filter((_, index) => index % 2 === 1).toReversed();
  const newestFirst = (rows) =>
    rows.toSorted((a, b) => (isBefore(a, b) ? 1 : -1));
  const seen = [];
  let before = null;
  for (let guard = 0; guard < 20; guard++) {
    const options = { before, limit: 3, maxScan: 2 };
    const page = mergePage(
      await Promise.all([
        scan(stream(newestFirst(left)), () => true, options),
        scan(stream(newestFirst(right)), () => true, options),
      ]),
      3,
    );
    seen.push(...page.rows);
    if (!page.next) break;
    before = page.next;
  }
  assert.deepEqual(
    seen.map((r) => r.ct),
    newestFirst(all).map((r) => r.ct),
  );
});
