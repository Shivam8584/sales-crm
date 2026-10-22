import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { leadSlaSeconds } from "../../convex/lib/leads";
import {
  UNASSIGNED,
  buildReport,
  istDay,
  sourceOf,
  stageFacts,
  teamReport,
  type Period,
} from "../../convex/lib/reports";
import { money } from "../../lib/domain/money";
import { makeTest, seedMember } from "./setup";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 20, 8, 0);
const at = (daysAgo: number, hours = 0) =>
  NOW - daysAgo * DAY + hours * 3_600_000;

async function fixture() {
  vi.setSystemTime(at(100));
  const t = makeTest();
  const ada = await seedMember(t, "admin", "Ada Admin");
  const ria = await seedMember(t, "rep", "Ria Rep");
  // Creation time is the transaction's clock, and the reports window leads and accounts by it.
  const when = async <R>(
    daysAgo: number,
    write: (ctx: Parameters<Parameters<typeof t.run>[0]>[0]) => Promise<R>,
  ) => {
    vi.setSystemTime(at(daysAgo));
    return await t.run(write);
  };
  const account = (
    name: string,
    daysAgo: number,
    extra: Partial<Doc<"accounts">> = {},
  ) =>
    when(daysAgo, (ctx) =>
      ctx.db.insert("accounts", {
        name,
        ownerId: ada.id,
        stage: "qualified",
        tags: [],
        updatedAt: at(daysAgo),
        ...extra,
      }),
    );
  const lead = (
    name: string,
    daysAgo: number,
    extra: Partial<Doc<"leads">> = {},
  ) =>
    when(daysAgo, (ctx) =>
      ctx.db.insert("leads", {
        kind: "demo",
        name,
        companyName: `${name} Co`,
        source: "demo_form",
        utm: {},
        status: "new",
        ...extra,
      }),
    );

  // convex-test only moves creation time forward, so rows go in oldest first;
  // leads are linked to their accounts afterwards.
  const old = await account("Old Co", 90, {
    platformOrgId: "org-b",
    stage: "activated",
  });
  const ancient = await lead("Ancient", 90, {
    status: "converted",
    firstTouchedAt: at(90, 1),
  });
  await lead("Earlier Form", 45, { ownerId: ada.id });
  await lead("Earlier Google", 40, {
    ownerId: ria.id,
    utm: { source: "google" },
    status: "qualified",
    firstTouchedAt: at(40, 5),
    slaBreachedAt: at(40, 1),
  });
  await account("Direct Earlier", 35);
  const converted = await lead("Converted", 20, {
    utm: { source: "facebook" },
    kind: "signup",
    status: "converted",
    firstTouchedAt: at(20, 3),
  });
  const live = await account("Live Co", 19, {
    platformOrgId: "org-a",
    stage: "activated",
    ownerId: ria.id,
  });
  await lead("Form Waiting", 10, { ownerId: ria.id });
  await account("Direct New", 5, { ownerId: ria.id });
  await account("Archived", 4, { archivedAt: at(1) });
  await lead("Manual Entry", 3, { kind: "manual", ownerId: ada.id });
  await lead("Google Hot", 2, {
    ownerId: ada.id,
    utm: { source: "Google" },
    status: "contacted",
    firstTouchedAt: at(2, 0.5),
    demoAt: at(1),
  });
  await when(0, async (ctx) => {
    await ctx.db.patch(ancient, { accountId: old });
    await ctx.db.patch(converted, { accountId: live });
  });

  const person = (userId: string, accountId: typeof live) =>
    when(1, (ctx) =>
      ctx.db.insert("people", {
        firstName: userId,
        lastName: "User",
        ownerId: ada.id,
        accountId,
        platformUserId: userId,
        tags: [],
        searchText: userId,
        updatedAt: at(1),
      }),
    );
  await person("u-a", live);
  await person("u-b", old);

  const event = (
    type: string,
    daysAgo: number,
    payload: Record<string, unknown>,
    ids: { orgId?: string; userId?: string },
  ) =>
    when(0, (ctx) =>
      ctx.db.insert("platformEvents", {
        eventId: `${type}-${daysAgo}-${ids.orgId ?? ids.userId}`,
        type,
        ...ids,
        occurredAt: at(daysAgo),
        payload: JSON.stringify(payload),
        processedAt: at(daysAgo),
      }),
    );
  await event("user.signed_up", 19, {}, { userId: "u-a" });
  await event(
    "organization.created",
    19,
    { created_by: "u-a" },
    { orgId: "org-a" },
  );
  await event("wallet.topup_succeeded", 15, {}, { orgId: "org-a" });
  await event(
    "campaign.status_changed",
    10,
    { campaign_id: "c1", to: "live" },
    { orgId: "org-a" },
  );
  await event("enrollment.approved", 5, {}, { orgId: "org-a" });
  await event("user.signed_up", 80, {}, { userId: "u-b" });
  await event(
    "organization.created",
    80,
    { created_by: "u-b" },
    { orgId: "org-b" },
  );
  await event("wallet.topup_succeeded", 70, {}, { orgId: "org-b" });
  await event("enrollment.approved", 35, {}, { orgId: "org-b" });

  const deal = (
    title: string,
    stage: Doc<"deals">["stage"],
    owner: typeof ada.id,
    extra: Partial<Doc<"deals">> = {},
  ) =>
    when(0, (ctx) =>
      ctx.db.insert("deals", {
        accountId: live,
        title,
        stage,
        amount: money(10_000),
        ownerId: owner,
        personIds: [],
        position: 1,
        updatedAt: NOW,
        ...extra,
      }),
    );
  await deal("Open one", "proposal", ada.id);
  await deal("Open two", "demo", ria.id);
  await deal("Won recent", "won", ria.id, { closedAt: at(3) });
  await deal("Won earlier", "won", ada.id, { closedAt: at(40) });
  await deal("Won ancient", "won", ada.id, { closedAt: at(200) });
  await deal("Lost recent", "lost", ria.id, { closedAt: at(8) });

  const task = (
    status: Doc<"tasks">["status"],
    assigneeId: typeof ada.id,
    extra: Partial<Doc<"tasks">>,
  ) =>
    when(0, (ctx) =>
      ctx.db.insert("tasks", {
        title: "t",
        status,
        priority: "normal",
        assigneeId,
        position: 1,
        updatedAt: NOW,
        ...extra,
      }),
    );
  await task("todo", ada.id, { dueDate: istDay(at(4)) });
  await task("in_progress", ria.id, { dueDate: istDay(at(1)) });
  await task("todo", ria.id, { dueDate: istDay(at(-3)) });
  await task("done", ria.id, { completedAt: at(6) });
  await task("done", ada.id, { completedAt: at(45) });
  await task("done", ada.id, { completedAt: at(120) });

  const entry = (
    kind: "call" | "meeting" | "note",
    daysAgo: number,
    actorId: typeof ada.id | undefined,
    automated?: boolean,
  ) =>
    when(0, (ctx) =>
      ctx.db.insert("timeline", {
        kind,
        accountId: live,
        actorId,
        occurredAt: at(daysAgo),
        automated,
      }),
    );
  await entry("call", 2, ada.id);
  await entry("call", 3, ria.id);
  await entry("meeting", 7, ria.id);
  await entry("call", 4, ada.id, true);
  await entry("call", 5, undefined);
  await entry("call", 41, ada.id);
  await entry("meeting", 100, ada.id);
  await entry("note", 2, ada.id);
  vi.setSystemTime(NOW);
  await t.mutation(internal.counts.rebuild, { table: "platformEvents" });
  return { t, ada, ria };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** The report computed from every row of every table, with no window or index narrowing. */
function reference(t: Fixture["t"], build: (all: All) => unknown) {
  return t.run(async (ctx) => {
    const [leads, accounts, people, events, deals, tasks, timeline, members] =
      await Promise.all([
        ctx.db.query("leads").collect(),
        ctx.db.query("accounts").collect(),
        ctx.db.query("people").collect(),
        ctx.db.query("platformEvents").collect(),
        ctx.db.query("deals").collect(),
        ctx.db.query("tasks").collect(),
        ctx.db.query("timeline").collect(),
        ctx.db.query("members").collect(),
      ]);
    const accountSource = new Map<string, string>();
    for (const lead of [...leads].sort(
      (a, b) => a._creationTime - b._creationTime,
    )) {
      if (lead.accountId && !accountSource.has(lead.accountId)) {
        accountSource.set(lead.accountId, sourceOf(lead).key);
      }
    }
    return plain(
      build({
        leads,
        accounts,
        people: people.filter((person) => person.platformUserId),
        facts: stageFacts(events),
        accountSource,
        deals,
        tasks,
        timeline,
        members,
        slaMs: (await leadSlaSeconds(ctx)) * 1000,
      }),
    );
  });
}

type All = {
  leads: Doc<"leads">[];
  accounts: Doc<"accounts">[];
  people: Doc<"people">[];
  facts: ReturnType<typeof stageFacts>;
  accountSource: Map<string, string>;
  deals: Doc<"deals">[];
  tasks: Doc<"tasks">[];
  timeline: Doc<"timeline">[];
  members: Doc<"members">[];
  slaMs: number;
};

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

const ownerName = (all: All, id: string) =>
  id === UNASSIGNED
    ? null
    : (all.members.find((member) => member._id === id)?.name ??
      "Former teammate");

describe("reports read only what a period needs", () => {
  for (const period of ["30d", "quarter"] as Period[]) {
    it(`overview over ${period} equals a read of every table`, async () => {
      const { t, ada } = await fixture();
      for (const filters of [
        {},
        { source: "utm:google" },
        { owner: ada.id },
        { owner: UNASSIGNED },
      ]) {
        const expected = await reference(t, (all) => {
          const report = buildReport({
            ...all,
            now: Date.now(),
            period,
            filters,
          });
          return {
            ...report,
            speedByOwner: report.speedByOwner.map((row) => ({
              ...row,
              ownerName: ownerName(all, row.ownerId),
            })),
          };
        });
        const actual = await ada.as.query(api.reports.overview, {
          period,
          ...filters,
        });
        expect(plain(actual)).toEqual(expected);
      }
    });

    it(`team over ${period} equals a read of every table`, async () => {
      const { t, ada } = await fixture();
      const expected = await reference(t, (all) => {
        const report = teamReport({
          ...all,
          interactions: all.timeline
            .filter(
              (entry) => entry.kind === "call" || entry.kind === "meeting",
            )
            .map((entry) => ({
              kind: entry.kind,
              actorId: entry.actorId,
              occurredAt: entry.occurredAt,
              automated: entry.automated,
            })),
          memberIds: all.members.map((member) => member._id),
          now: Date.now(),
          period,
        });
        return {
          ...report,
          rows: report.rows.map((row) => ({
            ...row,
            ownerName: ownerName(all, row.ownerId),
          })),
        };
      });
      const actual = await ada.as.query(api.reports.team, { period });
      expect(plain(actual)).toEqual(expected);
    });
  }

  it("is not empty, so the comparison means something", async () => {
    const { ada } = await fixture();
    const report = await ada.as.query(api.reports.overview, { period: "30d" });
    expect(report.funnel.steps[0].count).toBeGreaterThan(3);
    expect(report.funnel.steps.at(-1)?.count).toBeGreaterThan(0);
    expect(report.activation.overall.completed).toBeGreaterThan(0);
    expect(report.pipeline.won.count).toBeGreaterThan(0);
    const team = await ada.as.query(api.reports.team, { period: "30d" });
    expect(team.team.current.calls).toBeGreaterThan(0);
  });
});
