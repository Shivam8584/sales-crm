import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeEntities,
  gmailLink,
  isExcluded,
  mailCounterparts,
  meetingGuests,
  parseCalendarEvent,
  parseExcludes,
  parseGmailMessage,
  splitAddressList,
} from "./mail-sync.ts";

const skip = {
  memberEmails: new Set(["rep@hypedrive.app"]),
  logAddress: "log@replies.hypedrive.app",
  ownDomains: ["hypedrive.app"],
  excludes: [],
};

const message = (headers, extra = {}) => ({
  id: "m1",
  threadId: "t1",
  internalDate: "1760000000000",
  snippet: "Thanks &amp; regards, it&#39;s done",
  labelIds: ["INBOX"],
  payload: {
    headers: Object.entries({
      "Message-ID": "<abc@mail.gmail.com>",
      Subject: "Quote",
      From: "Asha Menon <asha@kesar.in>",
      To: "rep@hypedrive.app",
      ...headers,
    }).map(([name, value]) => ({ name, value })),
  },
  ...extra,
});

test("splitAddressList ignores commas in quotes and brackets", () => {
  assert.deepEqual(
    splitAddressList('"Menon, Asha" <asha@kesar.in>, b@x.in ,, c@y.in'),
    ['"Menon, Asha" <asha@kesar.in>', "b@x.in", "c@y.in"],
  );
});

test("decodeEntities handles named and numeric escapes", () => {
  assert.equal(
    decodeEntities("a &amp; b &#39;c&#x27; &lt;d&gt; &bogus;"),
    "a & b 'c' <d> &bogus;",
  );
});

test("parseGmailMessage reads headers case-insensitively and cleans the snippet", () => {
  const mail = parseGmailMessage(
    message({ cc: "x@a.in, Y <y@b.in>", subject: undefined, Subject: "Hello" }),
  );
  assert.equal(mail.messageId, "<abc@mail.gmail.com>");
  assert.equal(mail.threadId, "t1");
  assert.equal(mail.at, 1760000000000);
  assert.equal(mail.snippet, "Thanks & regards, it's done");
  assert.deepEqual(mail.from, { email: "asha@kesar.in", name: "Asha Menon" });
  assert.deepEqual(
    mail.cc.map((m) => m.email),
    ["x@a.in", "y@b.in"],
  );
});

test("parseGmailMessage drops drafts, spam, trash and messages without an id or date", () => {
  for (const label of ["DRAFT", "SPAM", "TRASH"]) {
    assert.equal(parseGmailMessage(message({}, { labelIds: [label] })), null);
  }
  assert.equal(parseGmailMessage(message({ "Message-ID": " " })), null);
  assert.equal(parseGmailMessage(message({}, { internalDate: "x" })), null);
});

test("mailCounterparts: received mail is about the sender, sent mail about the recipients", () => {
  const received = parseGmailMessage(message({}));
  assert.deepEqual(mailCounterparts(received, ["rep@hypedrive.app"], skip), {
    direction: "inbound",
    people: [{ email: "asha@kesar.in", name: "Asha Menon" }],
  });
  const sent = parseGmailMessage(
    message({
      From: "rep@hypedrive.app",
      To: "asha@kesar.in, boss@hypedrive.app",
      Cc: "rep@hypedrive.app, Dev <dev@kesar.in>",
    }),
  );
  const result = mailCounterparts(sent, ["rep@hypedrive.app"], skip);
  assert.equal(result.direction, "outbound");
  assert.deepEqual(
    result.people.map((p) => p.email),
    ["asha@kesar.in", "dev@kesar.in"],
  );
});

test("mailCounterparts treats the SENT label as outbound even from an alias", () => {
  const sent = parseGmailMessage(
    message(
      { From: "rep@alias.io", To: "asha@kesar.in" },
      { labelIds: ["SENT"] },
    ),
  );
  const result = mailCounterparts(sent, ["rep@hypedrive.app"], skip);
  assert.equal(result.direction, "outbound");
  assert.deepEqual(
    result.people.map((p) => p.email),
    ["asha@kesar.in"],
  );
});

test("mailCounterparts finds nobody in internal threads or excluded senders", () => {
  const internal = parseGmailMessage(
    message({ From: "boss@hypedrive.app", To: "rep@hypedrive.app" }),
  );
  assert.deepEqual(
    mailCounterparts(internal, ["rep@hypedrive.app"], skip).people,
    [],
  );
  const received = parseGmailMessage(message({}));
  const excluded = { ...skip, excludes: ["kesar.in"] };
  assert.deepEqual(
    mailCounterparts(received, ["rep@hypedrive.app"], excluded).people,
    [],
  );
});

test("parseExcludes and isExcluded", () => {
  const rules = parseExcludes(
    "Kesar.IN, @bank.com\nasha@x.in; junk, not a domain, a@@b",
  );
  assert.deepEqual(rules, ["kesar.in", "bank.com", "asha@x.in"]);
  assert.equal(isExcluded("a@kesar.in", rules), true);
  assert.equal(isExcluded("a@mail.kesar.in", rules), true);
  assert.equal(isExcluded("a@notkesar.in", rules), false);
  assert.equal(isExcluded("asha@x.in", rules), true);
  assert.equal(isExcluded("bob@x.in", rules), false);
});

test("gmailLink opens the thread in the right account", () => {
  assert.equal(
    gmailLink("rep@hypedrive.app", "t1"),
    "https://mail.google.com/mail/?authuser=rep%40hypedrive.app#all/t1",
  );
});

const NOW = Date.parse("2026-03-10T10:00:00Z");
const event = (extra = {}) => ({
  id: "e1",
  iCalUID: "uid1",
  summary: "Kickoff",
  htmlLink: "https://calendar.google.com/event?eid=1",
  start: { dateTime: "2026-03-09T10:00:00Z" },
  end: { dateTime: "2026-03-09T10:45:00Z" },
  attendees: [
    { email: "rep@hypedrive.app", self: true, responseStatus: "accepted" },
    { email: "Asha@Kesar.in" },
    { email: "room@resource.calendar.google.com", resource: true },
  ],
  ...extra,
});

test("parseCalendarEvent keeps timed meetings with outside attendees", () => {
  const meeting = parseCalendarEvent(event(), NOW);
  assert.equal(meeting.key, `uid1@${Date.parse("2026-03-09T10:00:00Z")}`);
  assert.equal(meeting.durationMin, 45);
  assert.equal(meeting.subject, "Kickoff");
  assert.deepEqual(
    meeting.attendees.map((a) => a.email),
    ["asha@kesar.in"],
  );
});

test("parseCalendarEvent skips cancelled, declined, future, all-day, solo and special events", () => {
  assert.equal(parseCalendarEvent(event({ status: "cancelled" }), NOW), null);
  assert.equal(
    parseCalendarEvent(event({ eventType: "focusTime" }), NOW),
    null,
  );
  assert.equal(
    parseCalendarEvent(
      event({ start: { dateTime: "2026-03-11T10:00:00Z" } }),
      NOW,
    ),
    null,
  );
  assert.equal(
    parseCalendarEvent(event({ start: { date: "2026-03-09" } }), NOW),
    null,
  );
  assert.equal(
    parseCalendarEvent(
      event({
        attendees: [
          {
            email: "rep@hypedrive.app",
            self: true,
            responseStatus: "declined",
          },
          { email: "a@k.in" },
        ],
      }),
      NOW,
    ),
    null,
  );
  assert.equal(
    parseCalendarEvent(
      event({ attendees: [{ email: "rep@hypedrive.app", self: true }] }),
      NOW,
    ),
    null,
  );
  assert.equal(
    parseCalendarEvent(
      event({
        attendees: Array.from({ length: 25 }, (_, i) => ({
          email: `p${i}@k.in`,
        })),
      }),
      NOW,
    ),
    null,
  );
});

test("meetingGuests drops teammates and excluded guests", () => {
  const meeting = parseCalendarEvent(
    event({
      attendees: [
        { email: "rep@hypedrive.app", self: true },
        { email: "boss@hypedrive.app" },
        { email: "a@kesar.in" },
        { email: "b@bank.com" },
      ],
    }),
    NOW,
  );
  assert.deepEqual(
    meetingGuests(meeting, { ...skip, excludes: ["bank.com"] }).map(
      (g) => g.email,
    ),
    ["a@kesar.in"],
  );
});
