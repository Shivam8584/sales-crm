import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
  type Actor,
  type T,
} from "./setup";

const ORG = "org_kesar";
const iso = (value: string) => Date.parse(value);

beforeEach(() => {
  vi.setSystemTime(new Date("2026-10-05T06:00:00Z"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function resend() {
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Hypedrive <hello@example.com>");
  const fetcher = vi.fn(async () =>
    Response.json({ id: "msg_1" }, { status: 200 }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function platformEvent(
  t: T,
  type: string,
  at: string,
  data: Record<string, unknown>,
) {
  return t.run((ctx) =>
    ctx.db.insert("platformEvents", {
      eventId: `${type}-${at}-${Math.random()}`,
      type,
      orgId: ORG,
      occurredAt: iso(at),
      payload: JSON.stringify({ org_id: ORG, ...data }),
      processedAt: iso(at),
    }),
  );
}

async function brand(
  options: { owner?: "manager" | "rep"; consent?: boolean } = {},
) {
  const t = makeTest();
  const team = await seedTeam(t);
  const owner: Actor = team[options.owner ?? "manager"];
  const accountId = await newAccount(owner, "Kesar Foods", owner.id);
  await t.run((ctx) => ctx.db.patch(accountId, { platformOrgId: ORG }));
  const personId = await newPerson(owner, {
    firstName: "Asha",
    email: "asha@kesar.in",
    accountId,
  });
  if (options.consent !== false) {
    await owner.as.mutation(api.consents.record, {
      personId,
      channels: ["email"],
      event: "grant",
      purpose: "product_updates",
      basis: "consent",
      source: "email",
      note: "Agreed on the onboarding call",
    });
  }
  await platformEvent(t, "wallet.topup_succeeded", "2026-09-04T06:00:00Z", {
    amount_paise: 500_000,
  });
  await platformEvent(t, "enrollment.approved", "2026-09-10T06:00:00Z", {
    campaign_id: "c1",
    title: "Diwali launch",
  });
  return { t, team, owner, accountId, personId };
}

describe("results report", () => {
  it("counts the period's top-ups and approvals", async () => {
    const { owner, accountId } = await brand();
    const data = await owner.as.query(api.brandReport.get, {
      accountId,
      kind: "month",
      key: "2026-09",
    });
    expect(data?.report?.funding).toMatchObject({
      addedPaise: 500_000,
      count: 1,
    });
    expect(data?.report?.results.value).toBe(1);
    expect(data?.period.label).toBe("September 2026");
    expect(data?.periods[0].key).toBe("2026-10");
  });

  it("has nothing to report for an account without a platform organisation", async () => {
    const { t, owner } = await brand();
    const bare = await newAccount(owner, "Unlinked Ltd");
    const data = await owner.as.query(api.brandReport.get, {
      accountId: bare,
      kind: "quarter",
    });
    expect(data?.report).toBeNull();
    await t.run((ctx) => ctx.db.delete(bare));
    expect(
      await owner.as.query(api.brandReport.get, {
        accountId: bare,
        kind: "quarter",
      }),
    ).toBeNull();
  });

  it("refuses a period key that isn't one", async () => {
    const { owner, accountId } = await brand();
    expect(
      await failureCode(
        owner.as.query(api.brandReport.get, {
          accountId,
          kind: "month",
          key: "2026-9",
        }),
      ),
    ).toBe("invalid");
  });
});

describe("emailing the report", () => {
  it("previews the email and says why it can't go without consent", async () => {
    const { owner, accountId } = await brand({ consent: false });
    const panel = await owner.as.query(api.brandReport.emailPanel, {
      accountId,
      key: "2026-09",
    });
    expect(panel.email?.subject).toBe(
      "Your Hypedrive results for September 2026",
    );
    expect(panel.to?.email).toBe("asha@kesar.in");
    expect(panel.allowed).toBe(false);
    expect(panel.consentNote).toBeTruthy();
  });

  it("does not send without an email provider", async () => {
    const { owner, accountId } = await brand();
    expect(
      await failureCode(
        owner.as.mutation(api.brandReport.sendNow, {
          accountId,
          key: "2026-09",
        }),
      ),
    ).toBe("conflict");
  });

  it("does not send to a contact who hasn't agreed to product updates", async () => {
    const fetcher = resend();
    const { t, owner, accountId } = await brand({ consent: false });
    expect(
      await failureCode(
        owner.as.mutation(api.brandReport.sendNow, {
          accountId,
          key: "2026-09",
        }),
      ),
    ).toBe("conflict");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends once, with the unsubscribe line, and files it on the timeline", async () => {
    const fetcher = resend();
    const { t, owner, accountId, personId } = await brand();
    await owner.as.mutation(api.brandReport.sendNow, {
      accountId,
      key: "2026-09",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body));
    expect(sent.to).toEqual(["asha@kesar.in"]);
    expect(sent.text).toContain("Wallet: ₹5,000 added in 1 top-up");
    expect(sent.text).toContain("unsubscribe");

    const entries = await t.run((ctx) =>
      ctx.db
        .query("timeline")
        .withIndex("by_account_kind", (q) =>
          q.eq("accountId", accountId).eq("kind", "email"),
        )
        .collect(),
    );
    const sentEntry = entries.find((entry) => entry.direction === "outbound");
    expect(sentEntry).toMatchObject({
      personId,
      automated: true,
      actorId: owner.id,
    });
  });

  it("lets a rep email only their own accounts", async () => {
    resend();
    const { team, accountId } = await brand();
    expect(
      await failureCode(
        team.rep.as.mutation(api.brandReport.sendNow, {
          accountId,
          key: "2026-09",
        }),
      ),
    ).toBe("forbidden");
    const mine = await brand({ owner: "rep" });
    await mine.owner.as.mutation(api.brandReport.sendNow, {
      accountId: mine.accountId,
      key: "2026-09",
    });
  });
});

describe("monthly email", () => {
  it("starts with the next month, not the one just finished", async () => {
    const { t, owner, accountId } = await brand();
    await owner.as.mutation(api.brandReport.setMonthly, {
      accountId,
      enabled: true,
    });
    const [row] = await t.run((ctx) => ctx.db.query("brandReports").collect());
    expect(row).toMatchObject({ enabled: true, lastKey: "2026-09" });
    const panel = await owner.as.query(api.brandReport.emailPanel, {
      accountId,
    });
    expect(panel.monthly.next).toMatchObject({
      label: "October 2026",
      day: "2026-11-02",
    });
  });

  it("sends last month's report once, from the 2nd", async () => {
    const fetcher = resend();
    const { t, owner, accountId } = await brand();
    await platformEvent(t, "wallet.topup_succeeded", "2026-10-08T06:00:00Z", {
      amount_paise: 200_000,
    });
    await owner.as.mutation(api.brandReport.setMonthly, {
      accountId,
      enabled: true,
    });

    vi.setSystemTime(new Date("2026-11-01T06:00:00Z"));
    await t.mutation(internal.brandReport.dispatch, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-11-02T06:00:00Z"));
    await t.mutation(internal.brandReport.dispatch, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(internal.brandReport.dispatch, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [row] = await t.run((ctx) => ctx.db.query("brandReports").collect());
    expect(row).toMatchObject({ lastKey: "2026-10", lastStatus: "sent" });
  });

  it("skips a quiet month and a contact who withdrew, saying why", async () => {
    const fetcher = resend();
    const { t, owner, accountId, personId } = await brand();
    await owner.as.mutation(api.brandReport.setMonthly, {
      accountId,
      enabled: true,
    });
    vi.setSystemTime(new Date("2026-11-03T06:00:00Z"));
    await t.mutation(internal.brandReport.dispatch, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let [row] = await t.run((ctx) => ctx.db.query("brandReports").collect());
    expect(row).toMatchObject({
      lastKey: "2026-10",
      lastStatus: "skipped",
      lastNote: "Nothing happened in October 2026",
    });

    await platformEvent(t, "wallet.topup_succeeded", "2026-11-10T06:00:00Z", {
      amount_paise: 100_000,
    });
    await owner.as.mutation(api.consents.record, {
      personId,
      channels: ["email"],
      event: "withdraw",
      purpose: "product_updates",
      basis: "consent",
      source: "email",
      note: "Asked to stop",
    });
    vi.setSystemTime(new Date("2026-12-03T06:00:00Z"));
    await t.mutation(internal.brandReport.dispatch, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    [row] = await t.run((ctx) => ctx.db.query("brandReports").collect());
    expect(row).toMatchObject({ lastKey: "2026-11", lastStatus: "skipped" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops when the workspace kill switch is on", async () => {
    const fetcher = resend();
    const { t, team, owner, accountId } = await brand();
    await platformEvent(t, "wallet.topup_succeeded", "2026-10-08T06:00:00Z", {
      amount_paise: 200_000,
    });
    await owner.as.mutation(api.brandReport.setMonthly, {
      accountId,
      enabled: true,
    });
    await team.admin.as.mutation(api.automations.setKillSwitch, { on: true });
    vi.setSystemTime(new Date("2026-11-03T06:00:00Z"));
    await t.mutation(internal.brandReport.dispatch, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("is switched on by the owner or a manager only", async () => {
    const { team, accountId } = await brand();
    expect(
      await failureCode(
        team.otherRep.as.mutation(api.brandReport.setMonthly, {
          accountId,
          enabled: true,
        }),
      ),
    ).toBe("forbidden");
  });

  it("can't be switched on for an account that isn't linked", async () => {
    const { owner } = await brand();
    const bare: Id<"accounts"> = await newAccount(owner, "Unlinked Ltd");
    expect(
      await failureCode(
        owner.as.mutation(api.brandReport.setMonthly, {
          accountId: bare,
          enabled: true,
        }),
      ),
    ).toBe("conflict");
  });
});
