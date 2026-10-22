import assert from "node:assert/strict";
import { test } from "node:test";
import { firstLive, resolveMerged } from "./merged.ts";

const docs = {
  a: { _id: "a" },
  b: { _id: "b", archivedAt: 1, mergedIntoId: "a" },
  c: { _id: "c", archivedAt: 1, mergedIntoId: "b" },
  d: { _id: "d", archivedAt: 1 },
  loop: { _id: "loop", archivedAt: 1, mergedIntoId: "loop" },
  gone: { _id: "gone", archivedAt: 1, mergedIntoId: "missing" },
};
const get = async (id) => docs[id] ?? null;

test("a merged record resolves to its winner, through a chain", async () => {
  assert.equal(await resolveMerged(docs.a, get), docs.a);
  assert.equal(await resolveMerged(docs.b, get), docs.a);
  assert.equal(await resolveMerged(docs.c, get), docs.a);
});

test("a broken or circular chain resolves to nothing", async () => {
  assert.equal(await resolveMerged(null, get), null);
  assert.equal(await resolveMerged(docs.gone, get), null);
  assert.equal(await resolveMerged(docs.loop, get), null);
});

test("firstLive routes losers to their winner and skips archived records", async () => {
  assert.equal(await firstLive([docs.d, docs.b], get), docs.a);
  assert.equal(await firstLive([docs.d, docs.gone], get), null);
  assert.equal(await firstLive([], get), null);
});
