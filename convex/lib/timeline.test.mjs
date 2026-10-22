import assert from "node:assert/strict";
import { test } from "node:test";
import { diff, isInteraction, newestInteraction } from "./timeline.ts";

test("a teammate's call, email, meeting, WhatsApp or note is an interaction", () => {
  for (const kind of ["call", "email", "meeting", "whatsapp", "note"]) {
    assert.equal(isInteraction({ kind, actorId: "m1" }), true);
  }
});

test("automation sends and outbox entries are not interactions", () => {
  assert.equal(isInteraction({ kind: "email" }), false);
  assert.equal(isInteraction({ kind: "whatsapp" }), false);
  assert.equal(
    isInteraction({ kind: "email", actorId: "m1", automated: true }),
    false,
  );
});

test("changes and system entries are not interactions", () => {
  assert.equal(isInteraction({ kind: "change", actorId: "m1" }), false);
  assert.equal(isInteraction({ kind: "system", actorId: "m1" }), false);
});

test("diff reports only labelled fields that changed", () => {
  assert.deepEqual(
    diff(
      { name: "A", tags: ["x"], stage: "Lead" },
      { name: "B", tags: ["x"] },
      { name: "Name", tags: "Tags", stage: "Stage" },
    ),
    [{ field: "Name", from: "A", to: "B" }],
  );
});

const entry = (kind, occurredAt, extra = {}) => ({
  kind,
  occurredAt,
  actorId: "m1",
  ...extra,
});

test("newestInteraction picks the newest teammate entry across kinds", () => {
  const rows = [
    entry("system", 90),
    entry("email", 80, { automated: true }),
    entry("note", 70, { actorId: undefined }),
    entry("call", 60),
    entry("email", 50),
  ];
  assert.equal(newestInteraction(rows), rows[3]);
});

test("newestInteraction takes the first kind in kind order on a tie", () => {
  const call = entry("call", 10);
  const note = entry("note", 10);
  assert.equal(newestInteraction([call, note]), note);
});

test("newestInteraction is null without a teammate interaction", () => {
  assert.equal(newestInteraction([]), null);
  assert.equal(newestInteraction([null, entry("change", 5)]), null);
  assert.equal(
    newestInteraction([entry("email", 5, { automated: true })]),
    null,
  );
});
