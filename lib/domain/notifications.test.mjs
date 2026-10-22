import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOLLOW_BATCH_MS,
  byPriority,
  entryHref,
  isActionKind,
  kindPriority,
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

test("kinds rank by how soon they need a person", () => {
  assert.equal(kindPriority("lead_sla"), 0);
  assert.equal(kindPriority("mention"), 0);
  assert.equal(kindPriority("lead_assigned"), 1);
  assert.equal(kindPriority("follow"), 2);
  assert.equal(kindPriority("platform_org"), 2);
  assert.equal(isActionKind("proposal_approval"), true);
  assert.equal(isActionKind("automation"), false);
});

test("unread action items lead, urgent first, then newest", () => {
  const item = (id, kind, read, at) => ({ id, kind, read, _creationTime: at });
  const list = [
    item("info-new", "platform_org", false, 90),
    item("assigned-old", "lead_assigned", false, 10),
    item("sla-old", "lead_sla", false, 5),
    item("mention-new", "mention", false, 80),
    item("assigned-new", "lead_assigned", false, 70),
    item("sla-read", "lead_sla", true, 95),
  ];
  assert.deepEqual(
    list.sort(byPriority).map((entry) => entry.id),
    [
      "mention-new",
      "sla-old",
      "assigned-new",
      "assigned-old",
      "sla-read",
      "info-new",
    ],
  );
});
