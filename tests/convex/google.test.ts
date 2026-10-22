import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { decryptSecret, encryptSecret } from "../../convex/lib/crypto";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
  type Actor,
  type T,
} from "./setup";

const NOW = Date.parse("2026-03-10T10:00:00Z");

beforeEach(() => {
  vi.setSystemTime(NOW);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("CONVEX_SITE_URL", "https://site.example");
  vi.stubEnv("SITE_URL", "https://crm.example");
  vi.stubEnv("KEYS_ENCRYPTION_KEY", "k".repeat(40));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function connect(t: T, member: Actor, email = "ria@hypedrive.in") {
  const refreshToken = await encryptSecret("refresh-1", `google:${member.id}`);
  await t.mutation(internal.google.saveConnection, {
    memberId: member.id,
    email,
    refreshToken,
  });
  return (await t.run((ctx) =>
    ctx.db
      .query("googleConnections")
      .withIndex("by_member", (q) => q.eq("memberId", member.id))
      .unique(),
  ))!;
}

async function customer(t: T, rep: Actor, email = "priya@globex.com") {
  const accountId = await newAccount(rep, "Globex");
  const personId = await newPerson(rep, {
    firstName: "Priya",
    email,
    accountId,
  });
  return { accountId, personId };
}

const mail = (extra: Record<string, unknown> = {}) => ({
  messageId: "<m1@mail.gmail.com>",
  threadId: "t1",
  at: NOW - 60_000,
  subject: "Quote",
  snippet: "Sharing the quote",
  from: { email: "priya@globex.com", name: "Priya" },
  to: [{ email: "ria@hypedrive.in" }],
  cc: [],
  sent: false,
  ...extra,
});

const entriesFor = async (t: T, personId: Id<"people">) =>
  (
    await t.run((ctx) =>
      ctx.db
        .query("timeline")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect(),
    )
  ).filter((entry) => entry.kind === "email" || entry.kind === "meeting");

describe("Google connection", () => {
  it("is unavailable until the credentials and master key are set", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    const t = makeTest();
    const { rep } = await seedTeam(t);
    expect(await rep.as.query(api.google.status, {})).toEqual({
      configured: false,
    });
    expect(await failureCode(rep.as.mutation(api.google.start, {}))).toBe(
      "unavailable",
    );
  });

  it("stores only an encrypted refresh token after a signed callback", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const url = new URL(await rep.as.mutation(api.google.start, {}));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
    expect(url.searchParams.get("scope")).toContain("calendar.readonly");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://site.example/google/callback",
    );
    const state = url.searchParams.get("state")!;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const target = String(input);
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json({
            access_token: "access-1",
            refresh_token: "refresh-secret",
            scope:
              "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly",
          });
        }
        return Response.json({
          emailAddress: "Ria@Hypedrive.in",
          historyId: "9",
        });
      }),
    );
    const done = await t.fetch(
      `/google/callback?code=abc&state=${encodeURIComponent(state)}`,
    );
    expect(done.status).toBe(302);
    expect(done.headers.get("Location")).toBe(
      "https://crm.example/settings/profile?google=connected",
    );

    const row = (await t.run((ctx) =>
      ctx.db.query("googleConnections").unique(),
    ))!;
    expect(row.email).toBe("ria@hypedrive.in");
    expect(JSON.stringify(row)).not.toContain("refresh-secret");
    expect(await decryptSecret(row.refreshToken, `google:${rep.id}`)).toBe(
      "refresh-secret",
    );
    const status = await rep.as.query(api.google.status, {});
    expect(JSON.stringify(status)).not.toContain(row.refreshToken);
    expect(status).toMatchObject({
      configured: true,
      connection: { email: "ria@hypedrive.in", status: "active", mail: true },
    });
  });

  it("refuses a forged, expired or denied callback", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const state = new URL(
      await rep.as.mutation(api.google.start, {}),
    ).searchParams.get("state")!;
    const forged = state.replace(/.$/, state.endsWith("0") ? "1" : "0");
    for (const [query, result] of [
      [`code=abc&state=${forged}`, "failed"],
      [`code=abc&state=${rep.id}.1.deadbeef`, "failed"],
      [`error=access_denied&state=${state}`, "denied"],
    ]) {
      const response = await t.fetch(`/google/callback?${query}`);
      expect(response.headers.get("Location")).toContain(`google=${result}`);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      await t.run((ctx) => ctx.db.query("googleConnections").collect()),
    ).toEqual([]);
  });

  it("does not connect when a scope was unticked", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const state = new URL(
      await rep.as.mutation(api.google.start, {}),
    ).searchParams.get("state")!;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "a",
          refresh_token: "r",
          scope: "https://www.googleapis.com/auth/gmail.readonly",
        }),
      ),
    );
    const response = await t.fetch(`/google/callback?code=c&state=${state}`);
    expect(response.headers.get("Location")).toContain("google=scope");
    expect(
      await t.run((ctx) => ctx.db.query("googleConnections").collect()),
    ).toEqual([]);
  });

  it("keeps settings per member and parses the exclude list", async () => {
    const t = makeTest();
    const { rep, otherRep } = await seedTeam(t);
    await connect(t, rep);
    await rep.as.mutation(api.google.saveSettings, {
      mail: false,
      calendar: true,
      excludes: "Bank.com, mum@home.in\nnot valid",
    });
    expect(await rep.as.query(api.google.status, {})).toMatchObject({
      connection: {
        mail: false,
        calendar: true,
        excludes: ["bank.com", "mum@home.in"],
      },
    });
    expect(await otherRep.as.query(api.google.status, {})).toMatchObject({
      connection: null,
    });
    expect(
      await failureCode(
        otherRep.as.mutation(api.google.saveSettings, {
          mail: true,
          calendar: true,
          excludes: "",
        }),
      ),
    ).toBe("not_found");
  });
});

describe("logging mail", () => {
  it("files received and sent mail on the customer's records", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const conn = await connect(t, rep);
    const { personId, accountId } = await customer(t, rep);

    await t.mutation(internal.google.logMail, {
      id: conn._id,
      mails: [
        mail(),
        mail({
          messageId: "<m2@mail.gmail.com>",
          from: { email: "ria@hypedrive.in" },
          to: [{ email: "priya@globex.com" }],
          sent: true,
          subject: "Re: Quote",
        }),
      ],
    });
    const entries = await entriesFor(t, personId);
    expect(entries).toHaveLength(2);
    const received = entries.find((entry) => entry.direction === "inbound")!;
    expect(received).toMatchObject({
      kind: "email",
      accountId,
      subject: "Quote",
      body: "Quote\nSharing the quote",
      link: "https://mail.google.com/mail/?authuser=ria%40hypedrive.in#all/t1",
    });
    expect(received.actorId).toBeUndefined();
    const sent = entries.find((entry) => entry.direction === "outbound")!;
    expect(sent.actorId).toBe(rep.id);
    expect(
      await t.run((ctx) => ctx.db.query("googleImports").collect()),
    ).toHaveLength(2);
  });

  it("logs a message once, even when the BCC logger saw it first", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const conn = await connect(t, rep);
    const { personId } = await customer(t, rep);

    await t.mutation(internal.inbound.logCustomerEmail, {
      messageId: "<m2@mail.gmail.com>",
      sender: "ria.rep@example.com",
      to: [{ email: "priya@globex.com" }],
      cc: [],
      subject: "Re: Quote",
      text: "Thanks",
      sentAt: NOW,
    });
    expect(await entriesFor(t, personId)).toHaveLength(1);

    const same = mail({
      messageId: "<m2@mail.gmail.com>",
      from: { email: "ria@hypedrive.in" },
      to: [{ email: "priya@globex.com" }],
      sent: true,
    });
    await t.mutation(internal.google.logMail, { id: conn._id, mails: [same] });
    await t.mutation(internal.google.logMail, {
      id: conn._id,
      mails: [mail()],
    });
    await t.mutation(internal.google.logMail, {
      id: conn._id,
      mails: [mail()],
    });
    expect(await entriesFor(t, personId)).toHaveLength(2);
  });

  it("skips teammates, strangers, excluded domains and unticked mail", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const conn = await connect(t, rep);
    const { personId } = await customer(t, rep);
    const stranger = mail({
      messageId: "<s@x>",
      from: { email: "who@nowhere.com" },
    });
    const teammate = mail({
      messageId: "<i@x>",
      from: { email: "max.manager@example.com" },
    });
    await t.mutation(internal.google.logMail, {
      id: conn._id,
      mails: [stranger, teammate],
    });
    expect(await entriesFor(t, personId)).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("googleImports").collect()),
    ).toHaveLength(0);

    await rep.as.mutation(api.google.saveSettings, {
      mail: true,
      calendar: true,
      excludes: "globex.com",
    });
    await t.mutation(internal.google.logMail, {
      id: conn._id,
      mails: [mail()],
    });
    expect(await entriesFor(t, personId)).toHaveLength(0);

    await rep.as.mutation(api.google.saveSettings, {
      mail: false,
      calendar: true,
      excludes: "",
    });
    await t.mutation(internal.google.logMail, {
      id: conn._id,
      mails: [mail()],
    });
    expect(await entriesFor(t, personId)).toHaveLength(0);
  });

  it("never logs erased people or people who withdrew consent", async () => {
    const t = makeTest();
    const { rep, admin } = await seedTeam(t);
    const conn = await connect(t, rep);
    const accountId = await newAccount(rep, "Globex");
    const erased = await newPerson(rep, {
      firstName: "Erased",
      email: "gone@globex.com",
      accountId,
    });
    const withdrawn = await newPerson(rep, {
      firstName: "Optout",
      email: "out@globex.com",
      accountId,
    });
    await admin.as.mutation(api.consents.erase, {
      personId: erased,
      confirmation: "erase",
    });
    await rep.as.mutation(api.consents.record, {
      personId: withdrawn,
      channels: ["email"],
      event: "withdraw",
      source: "email",
      note: "Asked to stop",
    });
    await t.mutation(internal.google.logMail, {
      id: conn._id,
      mails: [
        mail({ messageId: "<e@x>", from: { email: "gone@globex.com" } }),
        mail({ messageId: "<o@x>", from: { email: "out@globex.com" } }),
      ],
    });
    expect(await entriesFor(t, withdrawn)).toHaveLength(0);
    expect(
      (await entriesFor(t, erased)).filter((entry) => entry.kind === "email"),
    ).toHaveLength(0);
  });
});

describe("logging meetings", () => {
  const meeting = (extra: Record<string, unknown> = {}) => ({
    key: "uid1@1",
    at: NOW - 3_600_000,
    durationMin: 30,
    subject: "Kickoff",
    link: "https://calendar.google.com/e/1",
    attendees: [{ email: "priya@globex.com" }],
    ...extra,
  });

  it("files a meeting once even when two teammates attended", async () => {
    const t = makeTest();
    const { rep, otherRep } = await seedTeam(t);
    const first = await connect(t, rep);
    const second = await connect(t, otherRep, "omar@hypedrive.in");
    const { personId } = await customer(t, rep);

    await t.mutation(internal.google.logMeetings, {
      id: first._id,
      meetings: [meeting()],
    });
    await t.mutation(internal.google.logMeetings, {
      id: second._id,
      meetings: [meeting()],
    });
    const entries = await entriesFor(t, personId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "meeting",
      actorId: rep.id,
      durationMin: 30,
      subject: "Kickoff",
      link: "https://calendar.google.com/e/1",
    });
  });
});

describe("disconnecting", () => {
  async function imported() {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const conn = await connect(t, rep);
    const { personId } = await customer(t, rep);
    await t.mutation(internal.google.logMail, {
      id: conn._id,
      mails: [mail()],
    });
    return { t, rep, conn, personId };
  }

  it("deletes the token, and the imported entries when asked", async () => {
    const { t, rep, conn, personId } = await imported();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null)),
    );
    await rep.as.mutation(api.google.disconnect, { deleteImported: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.get(conn._id))).toBeNull();
    expect(await entriesFor(t, personId)).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("googleImports").collect()),
    ).toEqual([]);

    const again = await connect(t, rep);
    await t.mutation(internal.google.logMail, {
      id: again._id,
      mails: [mail()],
    });
    expect(await entriesFor(t, personId)).toHaveLength(1);
  });

  it("keeps the entries otherwise", async () => {
    const { t, rep, personId } = await imported();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null)),
    );
    await rep.as.mutation(api.google.disconnect, { deleteImported: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await entriesFor(t, personId)).toHaveLength(1);
    expect(
      await t.run((ctx) => ctx.db.query("googleConnections").collect()),
    ).toEqual([]);
  });
});

describe("sync", () => {
  function google(handlers: Record<string, () => Response>) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const target = String(input);
        calls.push(target);
        for (const [needle, respond] of Object.entries(handlers)) {
          if (target.includes(needle)) return respond();
        }
        return new Response("{}", { status: 404 });
      }),
    );
    return calls;
  }

  const token = () => Response.json({ access_token: "access-1" });

  it("reads mail metadata and meetings, then remembers where it stopped", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const conn = await connect(t, rep);
    const { personId } = await customer(t, rep);
    const calls = google({
      "oauth2.googleapis.com/token": token,
      "/profile": () =>
        Response.json({ emailAddress: "ria@hypedrive.in", historyId: "50" }),
      "/messages?": () => Response.json({ messages: [{ id: "g1" }] }),
      "/messages/g1": () =>
        Response.json({
          id: "g1",
          threadId: "t9",
          internalDate: String(NOW - 120_000),
          snippet: "Can we talk &amp; decide?",
          labelIds: ["INBOX"],
          payload: {
            headers: [
              { name: "Message-ID", value: "<g1@mail.gmail.com>" },
              { name: "From", value: "Priya <priya@globex.com>" },
              { name: "To", value: "ria@hypedrive.in" },
              { name: "Subject", value: "Next steps" },
            ],
          },
        }),
      "/calendars/primary/events": () =>
        Response.json({
          items: [
            {
              id: "ev1",
              iCalUID: "uid-9",
              summary: "Demo",
              start: { dateTime: "2026-03-10T08:00:00Z" },
              end: { dateTime: "2026-03-10T08:30:00Z" },
              attendees: [
                { email: "ria@hypedrive.in", self: true },
                { email: "priya@globex.com" },
              ],
            },
          ],
        }),
    });

    await t.action(internal.google.syncOne, { id: conn._id });
    const entries = await entriesFor(t, personId);
    expect(entries.map((entry) => entry.kind).sort()).toEqual([
      "email",
      "meeting",
    ]);
    expect(entries.find((entry) => entry.kind === "email")?.body).toBe(
      "Next steps\nCan we talk & decide?",
    );
    expect(calls.some((url) => url.includes("format=metadata"))).toBe(true);
    expect(calls.some((url) => url.includes("format=full"))).toBe(false);

    const row = (await t.run((ctx) => ctx.db.get(conn._id)))!;
    expect(row.historyId).toBe("50");
    expect(row.calendarCursor).toBe(NOW);
    expect(row.lastError).toBeUndefined();
    expect(row.syncedAt).toBeGreaterThanOrEqual(NOW);
  });

  it("uses history after the first run and recovers when Gmail forgot it", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const conn = await connect(t, rep);
    await t.run((ctx) =>
      ctx.db.patch(conn._id, { historyId: "40", calendar: false }),
    );
    const calls = google({
      "oauth2.googleapis.com/token": token,
      "/history": () =>
        new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 }),
      "/profile": () =>
        Response.json({ emailAddress: "ria@hypedrive.in", historyId: "77" }),
      "/messages?": () => Response.json({}),
    });
    await t.action(internal.google.syncOne, { id: conn._id });
    expect(calls.some((url) => url.includes("startHistoryId=40"))).toBe(true);
    const row = (await t.run((ctx) => ctx.db.get(conn._id)))!;
    expect(row.historyId).toBe("77");
  });

  it("asks the member to reconnect when Google revokes access", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const conn = await connect(t, rep);
    google({
      "oauth2.googleapis.com/token": () =>
        new Response('{"error":"invalid_grant"}', { status: 400 }),
    });
    await t.action(internal.google.syncOne, { id: conn._id });
    expect((await t.run((ctx) => ctx.db.get(conn._id)))?.status).toBe(
      "reconnect",
    );
    const inbox = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_recipient_time", (q) => q.eq("recipientId", rep.id))
        .collect(),
    );
    expect(inbox.map((item) => item.title)).toContain(
      "Reconnect your Google account",
    );
    const status = await rep.as.query(api.google.status, {});
    expect(status).toMatchObject({ connection: { status: "reconnect" } });
  });

  it("keeps going on other errors and reports them", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const conn = await connect(t, rep);
    google({
      "oauth2.googleapis.com/token": token,
      "/profile": () =>
        Response.json({ emailAddress: "ria@hypedrive.in", historyId: "1" }),
      "/messages?": () => new Response("{}", { status: 503 }),
      "/calendars/primary/events": () => Response.json({ items: [] }),
    });
    await t.action(internal.google.syncOne, { id: conn._id });
    const row = (await t.run((ctx) => ctx.db.get(conn._id)))!;
    expect(row.status).toBe("active");
    expect(row.lastError).toContain("503");
    expect(row.calendarCursor).toBe(NOW);
    expect(row.historyId).toBeUndefined();
  });

  it("only schedules active connections of active members", async () => {
    const t = makeTest();
    const { rep, otherRep } = await seedTeam(t);
    await connect(t, rep);
    const gone = await connect(t, otherRep, "omar@hypedrive.in");
    await t.run((ctx) => ctx.db.patch(otherRep.id, { status: "deactivated" }));
    google({});
    expect(
      await t.query(internal.google.loadConnection, { id: gone._id }),
    ).toBeNull();
  });
});
