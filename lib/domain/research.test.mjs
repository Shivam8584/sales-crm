import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULTS,
  MAX_ATTEMPTS,
  differentCompany,
  domainFinding,
  nameMatches,
  nextCheck,
  parseLimit,
  parseSignature,
  personFindings,
  unansweredEmails,
  usedToday,
} from "./research.ts";

const DAY = 24 * 60 * 60_000;
const ravi = {
  firstName: "Ravi",
  lastName: "Menon",
  accountName: "Kesar Threads",
};

const REPLY = `Sure, send the proposal over.

Thanks & regards,
Ravi Menon
Director - Marketing | Kesar Threads Pvt Ltd
M: +91 98350 01122
T: 022 4000 1234
linkedin.com/in/ravi-menon-kesar

This email is confidential.`;

test("a signature that opens with a name yields title, company, mobile and profile", () => {
  const signature = parseSignature(REPLY);
  assert.equal(signature.name, "Ravi Menon");
  assert.equal(signature.title, "Director - Marketing");
  assert.equal(signature.company, "Kesar Threads Pvt Ltd");
  assert.equal(signature.phone, "+919835001122");
  assert.equal(
    signature.linkedin,
    "https://www.linkedin.com/in/ravi-menon-kesar",
  );
  assert.ok(!signature.lines.join("\n").includes("confidential"));
});

test("nothing is read when there is no sign-off or the block does not open with a name", () => {
  assert.equal(parseSignature("Call me on 9835001122 tomorrow."), null);
  assert.equal(
    parseSignature(
      "Thanks\nWe can do the shoot next week, call 9835001122 to confirm",
    ),
    null,
  );
  assert.equal(parseSignature("Regards,\nSales Manager\n9835001122"), null);
});

test("fax lines and registration numbers are not phone numbers", () => {
  const signature = parseSignature(
    "Best,\nAsha Rao\nHead of Growth\nFax: +91 98350 01122\nGSTIN 10BSDPG0911J1ZG",
  );
  assert.equal(signature.phone, undefined);
  assert.equal(signature.title, "Head of Growth");
});

test("a signature names the person only when first and last name agree", () => {
  assert.ok(nameMatches("Ravi Menon", ravi));
  assert.ok(nameMatches("Ravi", ravi));
  assert.ok(!nameMatches("Ravi Nair", ravi));
  assert.ok(!nameMatches("Priya Menon", ravi));
});

test("an inbound signature that names the person is strong evidence", () => {
  const found = personFindings(ravi, [
    {
      kind: "email",
      direction: "inbound",
      occurredAt: Date.UTC(2026, 9, 12),
      subject: "Re: shoot",
      body: REPLY,
    },
  ]);
  const byField = Object.fromEntries(found.map((item) => [item.field, item]));
  assert.deepEqual(Object.keys(byField).sort(), [
    "linkedinUrl",
    "phone",
    "title",
  ]);
  assert.ok(
    Object.values(byField).every(
      (item) => item.strong && item.source === "email",
    ),
  );
  assert.match(byField.phone.evidence, /2026-10-12/);
  assert.match(byField.phone.evidence, /M: \+91 98350 01122/);
});

test("a signature for someone else is only a weak finding", () => {
  const found = personFindings(
    { ...ravi, firstName: "Priya", lastName: "Shah" },
    [
      {
        kind: "email",
        direction: "inbound",
        occurredAt: 1,
        subject: "Re",
        body: REPLY,
      },
    ],
  );
  assert.ok(found.length > 0);
  assert.ok(found.every((item) => !item.strong));
});

test("outbound emails never describe the person", () => {
  assert.deepEqual(
    personFindings(ravi, [
      {
        kind: "email",
        direction: "outbound",
        actorId: "m",
        occurredAt: 1,
        subject: "Hi",
        body: REPLY,
      },
    ]),
    [],
  );
});

test("a different company in a matching signature is a weak job-change hint", () => {
  const body = "Regards,\nRavi Menon\nVP Sales at Zeta Foods Private Limited";
  const [change] = personFindings(ravi, [
    { kind: "email", direction: "inbound", occurredAt: 1, subject: "Re", body },
  ]).filter((item) => item.field === "employment");
  assert.equal(change.strong, false);
  assert.match(change.value, /Zeta Foods/);
  assert.ok(
    !differentCompany("Kesar Threads Pvt Ltd", ["Kesar Threads", "kesar"]),
  );
});

test("a reply saying they have left is flagged with the sentence as evidence", () => {
  const [change] = personFindings(ravi, [
    {
      kind: "email",
      direction: "inbound",
      occurredAt: 1,
      subject: "Auto-reply",
      body: "Hello. Ravi is no longer with Kesar Threads. Contact asha@kesar.in.",
    },
  ]);
  assert.equal(change.field, "employment");
  assert.equal(change.strong, false);
  assert.match(change.evidence, /no longer with Kesar Threads/);
});

test("a teammate's note gives a weak phone only when it holds exactly one number", () => {
  const note = (body) => ({ kind: "note", actorId: "m", occurredAt: 1, body });
  const [one] = personFindings(ravi, [
    note("New mobile is 98350 01122, per Ravi"),
  ]);
  assert.deepEqual(
    [one.field, one.value, one.strong, one.source],
    ["phone", "+919835001122", false, "note"],
  );
  assert.deepEqual(
    personFindings(ravi, [note("Office 98350 01122 or accounts 98450 12345")]),
    [],
  );
  assert.deepEqual(
    personFindings(ravi, [{ ...note("Call 98350 01122"), automated: true }]),
    [],
  );
});

test("the newest finding for a field wins", () => {
  const found = personFindings(ravi, [
    {
      kind: "email",
      direction: "inbound",
      occurredAt: 2,
      subject: "b",
      body: "Regards,\nRavi Menon\nHead of Sales",
    },
    {
      kind: "email",
      direction: "inbound",
      occurredAt: 1,
      subject: "a",
      body: "Regards,\nRavi Menon\nManager",
    },
  ]);
  assert.equal(
    found.find((item) => item.field === "title").value,
    "Head of Sales",
  );
});

test("a shared company domain is suggested only for an account with no website", () => {
  const emails = ["a@kesar.in", "b@kesar.in", "c@gmail.com", "d@hypedrive.app"];
  const finding = domainFinding({}, emails, ["hypedrive.app"], 5);
  assert.equal(finding.value, "kesar.in");
  assert.equal(finding.strong, false);
  assert.match(finding.evidence, /a@kesar\.in, b@kesar\.in/);
  assert.equal(domainFinding({ domain: "kesar.in" }, emails, [], 5), null);
  assert.equal(domainFinding({}, ["c@gmail.com"], [], 5), null);
});

test("unanswered emails count outbound emails since the last reply", () => {
  const out = { kind: "email", direction: "outbound", occurredAt: 1 };
  const reply = { kind: "email", direction: "inbound", occurredAt: 1 };
  assert.equal(unansweredEmails([out, out, reply, out]), 2);
  assert.equal(unansweredEmails([reply, out]), 0);
  assert.equal(unansweredEmails([{ kind: "note", occurredAt: 1 }, out]), 1);
  assert.equal(unansweredEmails([]), 0);
});

test("the next check explains itself", () => {
  const base = {
    now: 0,
    staleDays: 30,
    failed: false,
    attempts: 0,
    unanswered: 0,
    jobChange: false,
    missing: [],
  };
  assert.deepEqual(nextCheck({ ...base, unanswered: 2 }), {
    dueAt: 14 * DAY,
    note: "no reply to 2 emails",
  });
  assert.deepEqual(
    nextCheck({ ...base, unanswered: 1 }).note,
    "no reply to 1 email",
  );
  assert.equal(nextCheck({ ...base, unanswered: 4 }).dueAt, 30 * DAY);
  assert.equal(
    nextCheck({ ...base, jobChange: true, unanswered: 2 }).dueAt,
    14 * DAY,
  );
  assert.match(nextCheck({ ...base, jobChange: true }).note, /moved on/);
  assert.deepEqual(nextCheck({ ...base, missing: ["phone", "title"] }), {
    dueAt: 30 * DAY,
    note: "phone and title not found yet",
  });
  assert.deepEqual(nextCheck(base), {
    dueAt: 30 * DAY,
    note: "routine refresh",
  });
});

test("a failed check backs off, then gives up until the next routine check", () => {
  const base = {
    now: 0,
    staleDays: 14,
    failed: true,
    unanswered: 0,
    jobChange: false,
    missing: [],
  };
  const first = nextCheck({ ...base, attempts: 1 }).dueAt;
  const second = nextCheck({ ...base, attempts: 2 }).dueAt;
  assert.ok(first > 0 && second > first && second < DAY);
  assert.deepEqual(nextCheck({ ...base, attempts: MAX_ATTEMPTS }), {
    dueAt: 14 * DAY,
    note: "checks kept failing",
  });
});

test("the daily count resets on a new India day", () => {
  assert.equal(usedToday("2026-10-22:7", "2026-10-22"), 7);
  assert.equal(usedToday("2026-10-21:7", "2026-10-22"), 0);
  assert.equal(usedToday(null, "2026-10-22"), 0);
});

test("limits fall back to defaults when unset or out of range", () => {
  assert.equal(parseLimit(null, "dailyCap"), DEFAULTS.dailyCap);
  assert.equal(parseLimit("20", "dailyCap"), 20);
  assert.equal(parseLimit("0", "dailyCap"), DEFAULTS.dailyCap);
  assert.equal(parseLimit("3", "staleDays"), DEFAULTS.staleDays);
});
