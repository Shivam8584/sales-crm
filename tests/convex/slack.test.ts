import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { routes } from "../../lib/routes";
import { failureCode, makeTest, seedTeam, type T } from "./setup";

const TOKEN = "xoxb-123456-secret-token";
const WEBHOOK = "https://hooks.slack.com/services/T000/B000/secret";

let fetchMock: ReturnType<typeof vi.fn>;
let errorLog: ReturnType<typeof vi.spyOn>;

const slackJson = (body: object, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });

beforeEach(() => {
  vi.stubEnv("KEYS_ENCRYPTION_KEY", "");
  vi.stubEnv("SLACK_BOT_TOKEN", "");
  vi.stubEnv("SLACK_WEBHOOK_URL", "");
  fetchMock = vi.fn(async () => slackJson({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  errorLog.mockRestore();
});

async function setup() {
  const t = makeTest();
  return { t, ...(await seedTeam(t)) };
}

const lastBody = () =>
  JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);

const deliver = (t: T, event: string, name = "Asha Rao") =>
  t.action(internal.slack.deliver, {
    event,
    name,
    detail: "Acme · score 82",
    path: routes.lead("abc"),
  });

describe("posting", () => {
  it("does nothing, and says so, until a token or webhook is set", async () => {
    const { admin } = await setup();
    expect(await admin.as.action(api.slack.sendTest, {})).toEqual({
      ok: false,
      reason: "not_connected",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await admin.as.query(api.slack.status, {})).mode).toBeNull();
  });

  it("posts through the bot token to the default channel without logging the token", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", TOKEN);
    const { admin } = await setup();
    await admin.as.mutation(api.slack.setDefaultChannel, { channel: "Sales" });
    expect(await admin.as.action(api.slack.sendTest, {})).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(lastBody()).toMatchObject({ channel: "#sales" });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(TOKEN);
    expect((await admin.as.query(api.slack.status, {})).last?.ok).toBe(true);
  });

  it("needs a channel for a bot token", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", TOKEN);
    const { admin } = await setup();
    expect(await admin.as.action(api.slack.sendTest, {})).toEqual({
      ok: false,
      reason: "no_channel",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a webhook, which has no channel of its own to set", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", WEBHOOK);
    const { admin } = await setup();
    expect(await admin.as.action(api.slack.sendTest, {})).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe(WEBHOOK);
    expect(lastBody()).not.toHaveProperty("channel");
    expect((await admin.as.query(api.slack.status, {})).mode).toBe("webhook");
  });

  it("refuses a webhook that isn't https", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "http://hooks.example.com/x");
    const { admin } = await setup();
    expect(await admin.as.action(api.slack.sendTest, {})).toMatchObject({
      ok: false,
      reason: "failed",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries Slack's rate limit and server errors with backoff", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", TOKEN);
    const { admin } = await setup();
    await admin.as.mutation(api.slack.setDefaultChannel, { channel: "#sales" });
    fetchMock
      .mockResolvedValueOnce(
        slackJson({ ok: false }, 429, { "Retry-After": "1" }),
      )
      .mockResolvedValueOnce(slackJson({ ok: false }, 503))
      .mockResolvedValueOnce(slackJson({ ok: true }));

    const result = admin.as.action(api.slack.sendTest, {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up on a permanent error at once and records it", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", TOKEN);
    const { admin } = await setup();
    await admin.as.mutation(api.slack.setDefaultChannel, { channel: "#nope" });
    fetchMock.mockResolvedValue(
      slackJson({ ok: false, error: "channel_not_found" }),
    );
    expect(await admin.as.action(api.slack.sendTest, {})).toEqual({
      ok: false,
      reason: "failed",
      error: "channel_not_found",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await admin.as.query(api.slack.status, {})).last).toMatchObject({
      ok: false,
      error: "channel_not_found",
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(TOKEN);
  });

  it("keeps a network failure's URL out of the log", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", WEBHOOK);
    const { admin } = await setup();
    fetchMock.mockRejectedValue(new TypeError(`failed to fetch ${WEBHOOK}`));
    const result = admin.as.action(api.slack.sendTest, {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ ok: false, reason: "failed" });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret");
  });

  it("stops at the workspace rate limit", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", WEBHOOK);
    const { admin } = await setup();
    const results = [];
    for (let i = 0; i < 31; i++) {
      results.push(await admin.as.action(api.slack.sendTest, {}));
    }
    expect(results.filter((result) => result.ok)).toHaveLength(30);
    expect(results.at(-1)).toEqual({ ok: false, reason: "rate_limited" });
  });
});

describe("events", () => {
  it("stay quiet until an admin switches them on, then use the route's channel", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", TOKEN);
    const { t, admin } = await setup();
    await admin.as.mutation(api.slack.setDefaultChannel, { channel: "#sales" });

    await deliver(t, "deal_won");
    expect(fetchMock).not.toHaveBeenCalled();

    await admin.as.mutation(api.slack.setRoute, {
      event: "deal_won",
      enabled: true,
      channel: "wins",
    });
    await deliver(t, "deal_won");
    expect(lastBody().channel).toBe("#wins");

    await admin.as.mutation(api.slack.setRoute, {
      event: "deal_won",
      enabled: true,
    });
    await deliver(t, "deal_won");
    expect(lastBody().channel).toBe("#sales");
  });

  it("carry a name and a link, never contact details", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", TOKEN);
    const { t, admin } = await setup();
    await admin.as.mutation(api.slack.setDefaultChannel, { channel: "#sales" });
    await admin.as.mutation(api.slack.setRoute, {
      event: "lead_hot",
      enabled: true,
    });
    await t.action(internal.slack.deliver, {
      event: "lead_hot",
      name: "Asha Rao",
      detail: "asha@brand.in · +91 98765 43210",
      path: routes.lead("abc"),
    });
    const sent = JSON.stringify(lastBody());
    expect(sent).toContain("Asha Rao");
    expect(sent).toContain(routes.lead("abc"));
    expect(sent).not.toContain("asha@brand.in");
    expect(sent).not.toContain("98765");
  });

  it("are queued by a hot lead only when its route is on", async () => {
    const { t, admin } = await setup();
    const queued = () =>
      t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name.includes("slack"),
        ),
      );
    const submission = {
      kind: "demo" as const,
      name: "Asha Rao",
      email: "asha@brandco.in",
      companyName: "BrandCo",
      website: "https://brandco.in",
      gstin: "27AAPFU0939F1ZV",
      message: "We need a demo and pricing for our campaign",
      utm: {},
    };

    const first = await t.mutation(internal.leads.ingest, { submission });
    const lead = await t.run((ctx) => ctx.db.get(first.id));
    expect(lead!.score).toBeGreaterThanOrEqual(70);
    expect(await queued()).toHaveLength(0);

    await admin.as.mutation(api.slack.setRoute, {
      event: "lead_hot",
      enabled: true,
    });
    await t.mutation(internal.leads.ingest, {
      submission: {
        ...submission,
        name: "Ravi Iyer",
        email: "ravi@brandco.in",
      },
    });
    const jobs = await queued();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({
      event: "lead_hot",
      name: "Ravi Iyer",
    });
    expect(JSON.stringify(jobs[0].args)).not.toContain("ravi@brandco.in");
  });

  it("are queued when a deal is won or lost", async () => {
    const { t, admin, rep } = await setup();
    const accountId = await rep.as.mutation(api.accounts.create, {
      name: "Acme Traders",
      ownerId: rep.id,
    });
    const dealId = await rep.as.mutation(api.deals.create, {
      title: "Q3 campaign",
      accountId,
    });
    for (const event of ["deal_won", "deal_lost"]) {
      await admin.as.mutation(api.slack.setRoute, { event, enabled: true });
    }
    await rep.as.mutation(api.deals.move, {
      id: dealId,
      stage: "won",
      position: 1,
    });
    const jobs = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) => job.name.includes("slack"),
      ),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args[0]).toMatchObject({
      event: "deal_won",
      name: "Q3 campaign",
    });
    expect(jobs[0].args[0].detail).toContain("Acme Traders");
  });
});

describe("weekly report", () => {
  it("posts a summary with no email provider, only when switched on", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", WEBHOOK);
    const { t, admin } = await setup();
    await t.action(internal.weekly.send, {});
    expect(fetchMock).not.toHaveBeenCalled();

    await admin.as.mutation(api.slack.setRoute, {
      event: "weekly_report",
      enabled: true,
    });
    await t.action(internal.weekly.send, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody().text).toBe("Weekly report: Last 7 days");
  });
});

describe("settings", () => {
  it("are admin only", async () => {
    const { manager, rep } = await setup();
    for (const actor of [manager, rep]) {
      expect(await failureCode(actor.as.query(api.slack.status, {}))).toBe(
        "forbidden",
      );
      expect(
        await failureCode(
          actor.as.mutation(api.slack.setRoute, {
            event: "deal_won",
            enabled: true,
          }),
        ),
      ).toBe("forbidden");
      expect(await failureCode(actor.as.action(api.slack.sendTest, {}))).toBe(
        "forbidden",
      );
    }
  });

  it("refuse unknown events and bad channels", async () => {
    const { admin } = await setup();
    expect(
      await failureCode(
        admin.as.mutation(api.slack.setRoute, {
          event: "everything",
          enabled: true,
        }),
      ),
    ).toBe("invalid");
    expect(
      await failureCode(
        admin.as.mutation(api.slack.setDefaultChannel, {
          channel: "two words",
        }),
      ),
    ).toBe("invalid");
  });

  it("list every event, off by default, and clear a channel when it is emptied", async () => {
    const { admin } = await setup();
    const before = await admin.as.query(api.slack.status, {});
    expect(before.routes).toHaveLength(6);
    expect(before.routes.every((route) => !route.enabled)).toBe(true);

    await admin.as.mutation(api.slack.setDefaultChannel, { channel: "#sales" });
    await admin.as.mutation(api.slack.setDefaultChannel, { channel: " " });
    expect(
      (await admin.as.query(api.slack.status, {})).defaultChannel,
    ).toBeNull();
  });
});
