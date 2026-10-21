import assert from "node:assert/strict";
import { test } from "node:test";
import { diff, isInteraction } from "./timeline.ts";

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
