import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOLLOW_BATCH_MS,
  entryHref,
  followEvent,
  followTitle,
  joinsBatch,
  parseRecordKey,
  recordFromHref,
} from "./notifications.ts";

const ist = (iso) => Date.parse(`${iso}+05:30`);

test("a follow event joins the open batch only inside ten minutes", () => {
  const now = ist("2026-10-21T12:00:00");
  assert.equal(joinsBatch(null, now), false);
  assert.equal(joinsBatch({ createdAt: now - 60_000 }, now), true);
  assert.equal(joinsBatch({ createdAt: now - FOLLOW_BATCH_MS + 1 }, now), true);
  assert.equal(joinsBatch({ createdAt: now - FOLLOW_BATCH_MS }, now), false);
});

test("an archived batch is never reopened", () => {
  const now = ist("2026-10-21T12:00:00");
  assert.equal(
    joinsBatch({ createdAt: now - 1_000, archivedAt: now - 500 }, now),
    false,
  );
});

test("titles count batched updates", () => {
  assert.equal(followTitle("Kesar Foods", 1), "Kesar Foods");
  assert.equal(followTitle("Kesar Foods", 4), "Kesar Foods · 4 updates");
});

test("followers hear about stages, deals and notes, not every edit", () => {
  assert.equal(followEvent({ kind: "note" }), "added a note");
  assert.equal(followEvent({ kind: "call" }), "logged a call");
  assert.equal(
    followEvent({
      kind: "change",
      changes: [
        { field: "Tags", to: "d2c" },
        { field: "Stage", from: "Lead", to: "Qualified" },
      ],
    }),
    "changed the stage to Qualified",
  );
  assert.equal(
    followEvent({ kind: "change", changes: [{ field: "Owner", to: "Ravi" }] }),
    null,
  );
  assert.equal(
    followEvent({ kind: "system", subject: "won the deal Kesar Q4" }),
    "won the deal Kesar Q4",
  );
  assert.equal(
    followEvent({ kind: "system", subject: "created the deal Kesar Q4" }),
    "created the deal Kesar Q4",
  );
  assert.equal(
    followEvent({ kind: "system", subject: "moved the deal Kesar Q4 to Demo" }),
    "moved the deal Kesar Q4 to Demo",
  );
  assert.equal(
    followEvent({
      kind: "system",
      subject: "moved the deal Kesar Q4 to Acme Brands",
    }),
    null,
  );
  assert.equal(
    followEvent({ kind: "system", subject: "deleted the task “Call”" }),
    null,
  );
});

test("links resolve to the record they're about", () => {
  assert.equal(recordFromHref("/deals/k1abc?tab=proposal"), "deals:k1abc");
  assert.equal(recordFromHref("/leads/k2#entry-x"), "leads:k2");
  assert.equal(recordFromHref("/leads?owner=mine"), undefined);
  assert.equal(recordFromHref(undefined), undefined);
  assert.deepEqual(parseRecordKey("accounts:k3"), {
    type: "accounts",
    id: "k3",
  });
  assert.equal(parseRecordKey("tasks:k3"), null);
  assert.equal(entryHref("accounts", "k3", "t9"), "/accounts/k3#entry-t9");
});
