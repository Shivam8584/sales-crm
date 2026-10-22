import type { FunctionArgs } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { money } from "../../lib/domain/money";
import { failureCode, makeTest, seedMember, type T } from "./setup";

const T0 = Date.UTC(2026, 0, 15, 6, 30);
const H = 3_600_000;

async function fixture() {
  vi.setSystemTime(T0);
  const t = makeTest();
  const ada = await seedMember(t, "admin", "Ada Admin");
  const ria = await seedMember(t, "rep", "Ria Rep");
  const ids = await t.run(async (ctx) => {
    const base = { tags: [], updatedAt: T0 };
    const account = (name: string, extra: Record<string, unknown> = {}) =>
      ctx.db.insert("accounts", {
        name,
        ownerId: ada.id,
        stage: "live",
        lastActivityAt: T0 - H,
        ...base,
        ...extra,
      });
    const acme = await account("Acme, Traders", {
      domain: "acme.example",
      platformOrgId: "org-1",
      tags: ["vip", "north, zone"],
    });
    const quoted = await account('Say "hi"\nSharma', {
      ownerId: ria.id,
      stage: "qualified",
      gstin: "27AAAAA0000A1Z5",
    });
    const formula = await account("=SUM(A1)", { stage: "demo" });
    await account("Old Co", { archivedAt: T0 - 2 * H });

    for (const [type, at] of [
      ["organization.created", 5],
      ["wallet.topup_succeeded", 4],
    ] as const) {
      await ctx.db.insert("platformEvents", {
        eventId: `${type}-${at}`,
        type,
        orgId: "org-1",
        occurredAt: T0 - at * 24 * H,
        payload: JSON.stringify({ org_id: "org-1" }),
        processedAt: T0,
      });
    }

    const person = (firstName: string, extra: Record<string, unknown> = {}) =>
      ctx.db.insert("people", {
        firstName,
        lastName: "Rao",
        ownerId: ada.id,
        searchText: firstName,
        lastActivityAt: T0 - 3 * H,
        ...base,
        ...extra,
      });
    const asha = await person("Asha", {
      accountId: acme,
      email: "asha@acme.example",
      phone: "+919876543210",
      title: "Buyer, Ops",
      linkedinUrl: "https://linkedin.example/asha",
      tags: ["champion"],
    });
    const bhav = await person("Bhav", {
      accountId: acme,
      ownerId: ria.id,
    });
    await person("=1+1", { phone: "+1 555", tags: ["a", "b"] });
    await person("Gone", { archivedAt: T0 });

    const entry = (
      target: { accountId: Id<"accounts"> } | { personId: Id<"people"> },
      kind: "note" | "call" | "email" | "system",
      hoursAgo: number,
      actor = true,
    ) =>
      ctx.db.insert("timeline", {
        kind,
        ...target,
        actorId: actor ? ria.id : undefined,
        occurredAt: T0 - hoursAgo * H,
        subject: "x",
      });
    // Three newer system rows, then an email and a note sharing a timestamp: the tie must go to the note.
    for (const hours of [1, 2, 3]) {
      await entry({ accountId: acme }, "system", hours, false);
    }
    await entry({ accountId: acme }, "email", 5);
    await entry({ accountId: acme }, "note", 5);
    await entry({ accountId: acme }, "call", 9);
    // More than 30 newer system rows: the interaction is only found by kind.
    for (let n = 1; n <= 34; n++) {
      await entry({ accountId: quoted }, "system", n, false);
    }
    await entry({ accountId: quoted }, "call", 100);
    await entry({ personId: asha }, "email", 7);
    await entry({ personId: asha }, "note", 2);
    await entry({ personId: bhav }, "system", 1, false);

    const deal = (
      accountId: Id<"accounts">,
      title: string,
      stage: "proposal" | "won" | "lost",
      amount: ReturnType<typeof money>,
      extra: Record<string, unknown> = {},
    ) =>
      ctx.db.insert("deals", {
        accountId,
        title,
        stage,
        amount,
        ownerId: ada.id,
        personIds: [],
        position: 1,
        updatedAt: T0,
        ...extra,
      });
    await deal(acme, "Annual plan", "proposal", money(125000.5), {
      closeDate: "2026-02-10",
    });
    await deal(acme, "Pilot", "won", money(40000), { closedAt: T0 });
    await deal(quoted, "Export, retainer", "lost", money(900, "USD"), {
      ownerId: ria.id,
      closedAt: T0,
      lostReason: 'Went with "them"',
    });
    await deal(quoted, "Open USD", "proposal", money(300, "USD"));

    const lead = (name: string, extra: Record<string, unknown> = {}) =>
      ctx.db.insert("leads", {
        kind: "demo",
        name,
        companyName: "Lead Co",
        source: "demo_form",
        utm: {},
        status: "new",
        ...extra,
      });
    await lead("Neha Iyer", {
      email: "neha@lead.example",
      phone: "+911234567890",
      ownerId: ria.id,
      utm: { campaign: "spring, 26" },
      firstTouchedAt: T0 + 90 * 60_000,
      demoAt: T0 + 48 * H,
    });
    await lead("Unassigned Lead", { kind: "signup" });
    await lead("Contacted Lead", { status: "contacted" });
    return { acme, quoted, formula };
  });
  return { t, ada, ria, ids };
}

async function csv(
  t: T,
  as: Awaited<ReturnType<typeof fixture>>["ada"]["as"],
  list: FunctionArgs<typeof api.exports.csv>["list"],
) {
  const out = await as.action(api.exports.csv, { list });
  const text = await t.run(async (ctx) => {
    const files = await ctx.db.system.query("_storage").collect();
    const blob = await ctx.storage.get(files[files.length - 1]._id);
    return (await blob?.text()) ?? "";
  });
  return { count: out.count, text };
}

describe("CSV export", () => {
  it("writes the same bytes for accounts", async () => {
    const { t, ada } = await fixture();
    const { count, text } = await csv(t, ada.as, {
      name: "accounts",
      args: { sort: "name", dir: "asc" },
    });
    expect(count).toBe(3);
    expect(text).toMatchInlineSnapshot(`
      "Name,Website,Stage,Owner,People,Open deals,Pipeline,On platform,Activation,Health,GSTIN,GST verified,Tags,Last interaction,Last activity
      '=SUM(A1),,Demo,Ada Admin,0,0,,No,,,,No,,,2026-01-15T05:30:00.000Z
      "Acme, Traders",acme.example,Live,Ada Admin,2,1,"₹1,25,001",Yes,80%,45 Watch,,No,"vip, north, zone",2026-01-15T01:30:00.000Z note,2026-01-15T05:30:00.000Z
      "Say ""hi""
      Sharma",,Qualified,Ria Rep,0,1,$300,No,,,27AAAAA0000A1Z5,No,,2026-01-11T02:30:00.000Z call,2026-01-15T05:30:00.000Z"
    `);
  });

  it("writes the same bytes for people", async () => {
    const { t, ada } = await fixture();
    const { count, text } = await csv(t, ada.as, {
      name: "people",
      args: { sort: "name", dir: "asc" },
    });
    expect(count).toBe(3);
    expect(text).toMatchInlineSnapshot(`
      "First name,Last name,Email,Phone,Title,Account,LinkedIn,Owner,Tags,Last interaction,Last activity
      '=1+1,Rao,,'+1 555,,,,Ada Admin,"a, b",,2026-01-15T03:30:00.000Z
      Asha,Rao,asha@acme.example,+919876543210,"Buyer, Ops","Acme, Traders",https://linkedin.example/asha,Ada Admin,champion,2026-01-15T04:30:00.000Z note,2026-01-15T03:30:00.000Z
      Bhav,Rao,,,,"Acme, Traders",,Ria Rep,,,2026-01-15T03:30:00.000Z"
    `);
  });

  it("writes the same bytes for leads", async () => {
    const { t, ada } = await fixture();
    const { count, text } = await csv(t, ada.as, {
      name: "leads",
      args: { status: "new", sort: "lead", dir: "asc" },
    });
    expect(count).toBe(2);
    expect(text).toMatchInlineSnapshot(`
      "Name,Account,Email,Phone,Kind,Status,Source,Campaign,Owner,Received,First touch,Speed to lead (min),Demo
      Neha Iyer,Lead Co,neha@lead.example,+911234567890,Demo request,New,Demo form,"spring, 26",Ria Rep,2026-01-15T06:30:00.001Z,2026-01-15T08:00:00.000Z,90,2026-01-17T06:30:00.000Z
      Unassigned Lead,Lead Co,,,Platform signup,New,Demo form,,,2026-01-15T06:30:00.001Z,,,"
    `);
  });

  it("writes the same bytes for deals", async () => {
    const { t, ada } = await fixture();
    const { count, text } = await csv(t, ada.as, {
      name: "deals",
      args: { today: "2026-01-15", sort: "title", dir: "asc" },
    });
    expect(count).toBe(4);
    expect(text).toMatchInlineSnapshot(`
      "Title,Account,Stage,Amount,Currency,Owner,Close date,Lost reason
      Annual plan,"Acme, Traders",Proposal,125000.5,INR,Ada Admin,2026-02-10,
      "Export, retainer","Say ""hi""
      Sharma",Lost,900,USD,Ria Rep,,"Went with ""them"""
      Open USD,"Say ""hi""
      Sharma",Proposal,300,USD,Ada Admin,,
      Pilot,"Acme, Traders",Won,40000,INR,Ada Admin,,"
    `);
  });

  it("keeps the owner filter and refuses reps", async () => {
    const { t, ada, ria } = await fixture();
    const { count } = await csv(t, ada.as, {
      name: "accounts",
      args: { ownerId: ria.id },
    });
    expect(count).toBe(1);
    expect(
      await failureCode(
        ria.as.action(api.exports.csv, {
          list: { name: "accounts", args: {} },
        }),
      ),
    ).toBe("forbidden");
  });

  it("splits a long list over several batches in order", async () => {
    vi.setSystemTime(T0);
    const t = makeTest();
    const ada = await seedMember(t, "admin", "Ada Admin");
    await t.run(async (ctx) => {
      for (let n = 0; n < 620; n++) {
        await ctx.db.insert("accounts", {
          name: `Acct ${String(n).padStart(4, "0")}`,
          ownerId: ada.id,
          stage: "live",
          tags: [],
          updatedAt: T0,
        });
      }
    });
    const { count, text } = await csv(t, ada.as, {
      name: "accounts",
      args: { sort: "name", dir: "asc" },
    });
    const names = text
      .split("\r\n")
      .slice(1)
      .map((line) => line.split(",")[0]);
    expect(count).toBe(620);
    expect(names[0]).toBe("Acct 0000");
    expect(names[619]).toBe("Acct 0619");
    expect(names).toEqual([...names].sort());
  });
});
