import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FOLLOW_BATCH_MS,
  deliversInApp,
  digestText,
  entryHref,
  followEvent,
  followTitle,
  joinsBatch,
  nextDigestAt,
  parseRecordKey,
  recordFromHref,
  snoozeUntil,
} from "./notifications.ts";

const ist = (iso) => Date.parse(`${iso}+05:30`);

test("a follow event joins the open batch only inside ten minutes", () => {
  const now = ist("2026-10-21T12:00:00");
  assert.equal(joinsBatch(null, now), false);
  assert.equal(joinsBatch({ createdAt: now - 60_000, count: 1 }, now), true);
  assert.equal(
    joinsBatch({ createdAt: now - FOLLOW_BATCH_MS + 1, count: 3 }, now),
    true,
  );
  assert.equal(
    joinsBatch({ createdAt: now - FOLLOW_BATCH_MS, count: 1 }, now),
    false,
  );
});

test("a cleared or snoozed batch is never reopened", () => {
  const now = ist("2026-10-21T12:00:00");
  const fresh = { createdAt: now - 1_000, count: 1 };
  assert.equal(joinsBatch({ ...fresh, doneAt: now - 500 }, now), false);
  assert.equal(joinsBatch({ ...fresh, snoozedUntil: now + 1_000 }, now), false);
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

test("snoozes wake at 9:00 India time", () => {
  const wednesday = ist("2026-10-21T22:30:00");
  assert.equal(snoozeUntil("tomorrow", wednesday), ist("2026-10-22T09:00:00"));
  assert.equal(
    snoozeUntil("tomorrow", ist("2026-10-21T00:10:00")),
    ist("2026-10-22T09:00:00"),
  );
  assert.equal(snoozeUntil("next_week", wednesday), ist("2026-10-26T09:00:00"));
  assert.equal(
    snoozeUntil("next_week", ist("2026-10-26T08:00:00")),
    ist("2026-11-02T09:00:00"),
  );
  assert.equal(
    snoozeUntil("next_week", ist("2026-10-25T23:00:00")),
    ist("2026-10-26T09:00:00"),
  );
});

test("the digest goes out at the next 9:00 India time", () => {
  assert.equal(
    nextDigestAt(ist("2026-10-21T08:59:00")),
    ist("2026-10-21T09:00:00"),
  );
  assert.equal(
    nextDigestAt(ist("2026-10-21T09:00:00")),
    ist("2026-10-22T09:00:00"),
  );
});

test("in-app preferences mute groups, except required ones", () => {
  assert.equal(deliversInApp("follow", ["following"]), false);
  assert.equal(deliversInApp("mention", ["following"]), true);
  assert.equal(deliversInApp("lead_sla", ["sla"]), true);
  assert.equal(deliversInApp("something_new", ["leads"]), true);
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

test("the digest lists each notification with its link", () => {
  const { subject, body } = digestText(
    "Shivam Gupta",
    [
      { title: "Ravi mentioned you", body: "Call them", href: "/leads/k1" },
      { title: "Kesar Foods" },
    ],
    "https://crm.example",
  );
  assert.equal(subject, "Hypedrive CRM: 2 unread notifications");
  assert.match(body, /^Good morning Shivam,/);
  assert.match(
    body,
    /• Ravi mentioned you — Call them\n {2}https:\/\/crm\.example\/leads\/k1/,
  );
  assert.match(body, /• Kesar Foods\n/);
});
