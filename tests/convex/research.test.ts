/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
  type T,
} from "./setup";

const DAY = 24 * 60 * 60_000;

const REPLY = `Sure, please send the proposal.

Thanks & regards,
Ravi Menon
Director - Marketing | Kesar Threads
M: +91 98350 01122
linkedin.com/in/ravi-menon-kesar`;

async function setup(options: { enabled?: boolean; dailyCap?: number } = {}) {
  const t = makeTest();
  const team = await seedTeam(t);
  if (options.enabled !== false) {
    await team.admin.as.mutation(api.research.setConfig, {
      enabled: true,
      dailyCap: options.dailyCap,
    });
  }
  const accountId = await newAccount(team.rep, "Kesar Threads");
  const personId = await newPerson(team.rep, {
    firstName: "Ravi",
    lastName: "Menon",
    email: "ravi@kesar.in",
    accountId,
  });
  return { t, team, accountId, personId };
}

const tasks = (t: T) => t.run((ctx) => ctx.db.query("researchTasks").collect());

function addEmail(
  t: T,
  personId: Id<"people">,
  body: string,
  direction: "inbound" | "outbound" = "inbound",
  at = Date.now(),
) {
  return t.run((ctx) =>
    ctx.db.insert("timeline", {
      kind: "email",
      personId,
      direction,
      occurredAt: at,
      subject: "Re: shoot",
      body,
    }),
  );
}

const plan = (analysis: Awaited<ReturnType<typeof research>>["analysis"]) => ({
  unanswered: analysis!.unanswered,
  jobChange: analysis!.jobChange,
  missing: analysis!.missing,
});

async function research(t: T, personId: Id<"people">) {
  await t.mutation(internal.research.claim, {});
  const task = (await tasks(t)).find((row) => row.personId === personId)!;
  const analysis = await t.mutation(internal.research.begin, {
    taskId: task._id,
  });
  return { task, analysis };
}

describe("research agent switches", () => {
  it("does nothing until an admin turns it on", async () => {
    const { t, team, personId } = await setup({ enabled: false });
    expect(await t.mutation(internal.research.claim, {})).toEqual([]);
    expect(await tasks(t)).toHaveLength(0);
    expect(
      await team.rep.as.query(api.research.forRecord, {
        subject: { personId },
      }),
    ).toBeNull();
    expect(
      await failureCode(
        team.rep.as.mutation(api.research.requestNow, {
          subject: { personId },
        }),
      ),
    ).toBe("unavailable");
  });

  it("is switched by admins only and validates its limits", async () => {
    const { team } = await setup({ enabled: false });
    expect(
      await failureCode(
        team.manager.as.mutation(api.research.setConfig, { enabled: true }),
      ),
    ).toBe("forbidden");
    expect(
      await failureCode(
        team.admin.as.mutation(api.research.setConfig, { dailyCap: 0 }),
      ),
    ).toBe("invalid");
    expect(
      await failureCode(
        team.admin.as.mutation(api.research.setConfig, { staleDays: 3 }),
      ),
    ).toBe("invalid");
    await team.admin.as.mutation(api.research.setConfig, {
      enabled: true,
      dailyCap: 7,
      staleDays: 14,
    });
    expect(await team.rep.as.query(api.research.status, {})).toMatchObject({
      enabled: true,
      dailyCap: 7,
      staleDays: 14,
      usedToday: 0,
    });
  });
});

describe("research queue", () => {
  it("queues what exists, new records ahead of old ones, and counts the day's runs", async () => {
    const { t, accountId, personId } = await setup();
    const ids = await t.mutation(internal.research.claim, {});
    expect(ids).toHaveLength(2);
    const rows = await tasks(t);
    expect(rows.map((row) => row.accountId ?? row.personId).sort()).toEqual(
      [accountId, personId].sort(),
    );
    expect(rows.every((row) => row.reason === "new" && row.rank === 0)).toBe(
      true,
    );
    expect(await t.mutation(internal.research.claim, {})).toEqual([]);
  });

  it("stops for the day at the cap and resumes the next day", async () => {
    const { t } = await setup({ dailyCap: 1 });
    expect(await t.mutation(internal.research.claim, {})).toHaveLength(1);
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(await t.mutation(internal.research.claim, {})).toEqual([]);
    vi.setSystemTime(Date.now() + 2 * DAY);
    expect(await t.mutation(internal.research.claim, {})).toHaveLength(1);
  });

  it("re-leases a run that was abandoned, and gives up after repeated abandonment", async () => {
    const { t } = await setup();
    await t.mutation(internal.research.claim, {});
    for (let round = 1; round <= 2; round++) {
      vi.setSystemTime(Date.now() + 11 * 60_000);
      expect((await t.mutation(internal.research.claim, {})).length).toBe(2);
      expect((await tasks(t)).every((row) => row.attempts === round)).toBe(
        true,
      );
    }
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(await t.mutation(internal.research.claim, {})).toEqual([]);
    const rows = await tasks(t);
    expect(rows.every((row) => row.note === "checks kept failing")).toBe(true);
    expect(rows.every((row) => row.dueAt > Date.now() + 20 * DAY)).toBe(true);
  });

  it("schedules the next check with its reason", async () => {
    const { t, personId } = await setup();
    const sent = Date.now() - 5 * DAY;
    await addEmail(t, personId, "Hello", "outbound", sent);
    await addEmail(t, personId, "Following up", "outbound", sent + DAY);
    const { task, analysis } = await research(t, personId);
    expect(analysis?.unanswered).toBe(2);
    await t.mutation(internal.research.finish, {
      taskId: task._id,
      failed: false,
      analysis: plan(analysis),
    });
    const after = (await tasks(t)).find((row) => row._id === task._id)!;
    expect(after.note).toBe("no reply to 2 emails");
    expect(after.dueAt).toBeGreaterThanOrEqual(Date.now() + 14 * DAY - 1000);
    expect(after.leaseUntil).toBeUndefined();
    const view = await (
      await seedTeam(t)
    ).rep.as.query(api.research.forRecord, { subject: { personId } });
    expect(view?.task?.note).toBe("no reply to 2 emails");
  });
});

describe("research evidence", () => {
  it("fills empty person fields from their own signature and says where it came from", async () => {
    const { t, team, personId } = await setup();
    await addEmail(t, personId, REPLY);
    await research(t, personId);
    const person = await t.run((ctx) => ctx.db.get(personId));
    expect(person).toMatchObject({
      phone: "+919835001122",
      title: "Director - Marketing",
      linkedinUrl: "https://www.linkedin.com/in/ravi-menon-kesar",
    });
    const facts = await t.run((ctx) =>
      ctx.db
        .query("facts")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect(),
    );
    expect(facts).toHaveLength(3);
    for (const fact of facts) {
      expect(fact.status).toBe("applied");
      expect(fact.source).toBe("email");
      expect(fact.evidence).toContain("M: +91 98350 01122");
    }
    const changes = await t.run((ctx) =>
      ctx.db
        .query("timeline")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect(),
    );
    const change = changes.find((entry) => entry.kind === "change");
    expect(change?.actorId).toBeUndefined();
    const view = await team.rep.as.query(api.research.forRecord, {
      subject: { personId },
    });
    expect(view?.filled).toHaveLength(3);
  });

  it("never overwrites a value a person entered; the signature becomes a suggestion", async () => {
    const { t, team, personId } = await setup();
    await t.run((ctx) =>
      ctx.db.patch(personId, { title: "Founder", phone: "+919000000000" }),
    );
    await addEmail(t, personId, REPLY);
    await research(t, personId);
    const person = await t.run((ctx) => ctx.db.get(personId));
    expect(person).toMatchObject({ title: "Founder", phone: "+919000000000" });
    const view = await team.rep.as.query(api.research.forRecord, {
      subject: { personId },
    });
    expect(view?.filled.map((fact) => fact.field)).toEqual(["linkedinUrl"]);
    expect(view?.review.map((fact) => fact.field).sort()).toEqual([
      "phone",
      "title",
    ]);
    expect(view?.current.title).toBe("Founder");

    const title = view!.review.find((fact) => fact.field === "title")!;
    await team.rep.as.mutation(api.enrichment.decide, {
      factId: title._id,
      decision: "accept",
    });
    expect((await t.run((ctx) => ctx.db.get(personId)))?.title).toBe(
      "Director - Marketing",
    );
  });

  it("treats a signature for someone else, and teammates' notes, as suggestions only", async () => {
    const { t, team, personId } = await setup();
    await addEmail(
      t,
      personId,
      "Regards,\nPriya Shah\nHead of Sales\nM: +91 98450 12345",
    );
    await t.run((ctx) =>
      ctx.db.insert("timeline", {
        kind: "note",
        personId,
        actorId: team.rep.id,
        occurredAt: Date.now() - 1000,
        body: "linkedin.com/in/ravi-menon-kesar",
      }),
    );
    await research(t, personId);
    const person = await t.run((ctx) => ctx.db.get(personId));
    expect(person?.phone).toBeUndefined();
    expect(person?.title).toBeUndefined();
    expect(person?.linkedinUrl).toBeUndefined();
    const view = await team.rep.as.query(api.research.forRecord, {
      subject: { personId },
    });
    expect(view?.filled).toEqual([]);
    expect(view?.review.map((fact) => fact.source).sort()).toEqual([
      "email",
      "email",
      "note",
    ]);
  });

  it("does not put a value back after someone clears it with undo", async () => {
    const { t, team, personId } = await setup();
    await addEmail(t, personId, REPLY);
    await research(t, personId);
    const view = await team.rep.as.query(api.research.forRecord, {
      subject: { personId },
    });
    const phone = view!.filled.find((fact) => fact.field === "phone")!;
    await team.rep.as.mutation(api.research.undoFill, { factId: phone._id });
    expect((await t.run((ctx) => ctx.db.get(personId)))?.phone).toBeUndefined();

    await research(t, personId);
    expect((await t.run((ctx) => ctx.db.get(personId)))?.phone).toBeUndefined();
    const after = await team.rep.as.query(api.research.forRecord, {
      subject: { personId },
    });
    expect(after?.filled.map((fact) => fact.field).sort()).toEqual([
      "linkedinUrl",
      "title",
    ]);
    expect(after?.review).toEqual([]);
  });

  it("flags a reply that says they left, as a suggestion, and checks again in two weeks", async () => {
    const { t, team, personId } = await setup();
    await addEmail(t, personId, "Hi, Ravi is no longer with Kesar Threads.");
    const { task, analysis } = await research(t, personId);
    expect(analysis?.jobChange).toBe(true);
    await t.mutation(internal.research.finish, {
      taskId: task._id,
      failed: false,
      analysis: plan(analysis),
    });
    const view = await team.rep.as.query(api.research.forRecord, {
      subject: { personId },
    });
    expect(view?.review).toMatchObject([
      { field: "employment", value: "May have left Kesar Threads" },
    ]);
    expect(view?.task?.note).toMatch(/moved on/);
  });

  it("suggests a website from the contacts' company email, never sets it", async () => {
    const { t, team, accountId } = await setup();
    await t.mutation(internal.research.claim, {});
    const task = (await tasks(t)).find((row) => row.accountId === accountId)!;
    await t.mutation(internal.research.begin, { taskId: task._id });
    expect(
      (await t.run((ctx) => ctx.db.get(accountId)))?.domain,
    ).toBeUndefined();
    const view = await team.rep.as.query(api.research.forRecord, {
      subject: { accountId },
    });
    expect(view?.review).toMatchObject([
      { field: "domain", value: "kesar.in" },
    ]);
    await team.rep.as.mutation(api.enrichment.decide, {
      factId: view!.review[0]._id,
      decision: "accept",
    });
    expect((await t.run((ctx) => ctx.db.get(accountId)))?.domain).toBe(
      "kesar.in",
    );
  });
});

describe("research and consent", () => {
  it("drops the queue entry of an erased person and clears the account's summary", async () => {
    const { t, team, accountId, personId } = await setup();
    await t.mutation(internal.research.claim, {});
    const account = (await tasks(t)).find(
      (row) => row.accountId === accountId,
    )!;
    await t.run((ctx) =>
      ctx.db.patch(account._id, { summary: "Ravi Menon asked about pricing" }),
    );
    await team.admin.as.mutation(api.consents.erase, {
      personId,
      confirmation: "erase",
    });
    const rows = await tasks(t);
    expect(rows.some((row) => row.personId === personId)).toBe(false);
    expect(
      rows.find((row) => row.accountId === accountId)?.summary,
    ).toBeUndefined();
  });

  it("skips archived or erased records when the task comes up", async () => {
    const { t, accountId, personId } = await setup();
    await t.mutation(internal.research.claim, {});
    await t.run((ctx) => ctx.db.patch(accountId, { archivedAt: Date.now() }));
    await t.run((ctx) => ctx.db.patch(personId, { erasedAt: Date.now() }));
    for (const task of await tasks(t)) {
      expect(
        await t.mutation(internal.research.begin, { taskId: task._id }),
      ).toBeNull();
    }
    expect(await tasks(t)).toHaveLength(0);
  });
});

describe("running a check", () => {
  it("runs end to end without an AI key and leaves the record's next check on it", async () => {
    const { t, team, personId } = await setup();
    await addEmail(t, personId, REPLY);
    await t.action(internal.research.tick, {});
    expect((await t.run((ctx) => ctx.db.get(personId)))?.phone).toBe(
      "+919835001122",
    );
    const view = await team.rep.as.query(api.research.forRecord, {
      subject: { personId },
    });
    expect(view?.task).toMatchObject({ running: false, summary: null });
    expect(view?.task?.lastRunAt).toBeTypeOf("number");
    expect(view?.task?.note).toBeTypeOf("string");
  });

  it("lets a rep ask for a check now, once at a time", async () => {
    const { t, team, personId } = await setup();
    await team.rep.as.mutation(api.research.requestNow, {
      subject: { personId },
    });
    const [task] = (await tasks(t)).filter((row) => row.personId === personId);
    expect(task.reason).toBe("manual");
    expect(task.leaseUntil).toBeGreaterThan(Date.now());
    expect(
      await failureCode(
        team.otherRep.as.mutation(api.research.requestNow, {
          subject: { personId },
        }),
      ),
    ).toBe("conflict");
  });
});

describe("research providers and summaries", () => {
  it("runs the enrichment waterfall as the agent without touching what the account says", async () => {
    vi.stubEnv("ENRICHMENT_SANDBOX", "1");
    const { t, team, accountId } = await setup();
    await t.run((ctx) => ctx.db.patch(accountId, { domain: "kesarleaf.in" }));
    await t.action(internal.research.tick, {});
    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account).toMatchObject({
      name: "Kesar Threads",
      domain: "kesarleaf.in",
    });
    expect(account?.gstin).toBeUndefined();

    const runs = await t.run((ctx) => ctx.db.query("enrichmentRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: "succeeded",
      provider: "waterfall",
    });
    expect(runs[0].requestedById).toBeUndefined();

    const view = await team.rep.as.query(api.enrichment.forAccount, {
      accountId,
    });
    expect(view?.runs[0].requestedBy).toBeNull();
    expect(
      view?.facts.some(
        (fact) => fact.field === "gstin" && fact.status === "suggested",
      ),
    ).toBe(true);
    vi.unstubAllEnvs();
  });

  it("writes one short summary per change in history and none without a key", async () => {
    const { t, team, personId } = await setup();
    await addEmail(t, personId, "Please send the proposal.", "inbound");
    await research(t, personId);
    const [task] = (await tasks(t)).filter((row) => row.personId === personId);
    await t.mutation(internal.research.finish, {
      taskId: task._id,
      failed: false,
    });
    expect(
      (await tasks(t)).find((row) => row._id === task._id)?.summary,
    ).toBeUndefined();

    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetcher = vi.fn(async () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "Asked for the proposal; nothing pending.",
                }),
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await t.action(internal.research.runTasks, { taskIds: [task._id] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetcher.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body.input).toContain("<data>");
    expect(body.store).toBe(false);
    const view = await team.rep.as.query(api.research.forRecord, {
      subject: { personId },
    });
    expect(view?.task?.summary).toBe(
      "Asked for the proposal; nothing pending.",
    );

    await t.action(internal.research.runTasks, { taskIds: [task._id] });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await addEmail(t, personId, "Any update?", "inbound");
    await t.action(internal.research.runTasks, { taskIds: [task._id] });
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps working when the AI service fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 401 })),
    );
    const { t, personId } = await setup();
    await addEmail(t, personId, REPLY);
    await t.action(internal.research.tick, {});
    expect((await t.run((ctx) => ctx.db.get(personId)))?.phone).toBe(
      "+919835001122",
    );
    const task = (await tasks(t)).find((row) => row.personId === personId)!;
    expect(task.summary).toBeUndefined();
    expect(task.lastRunAt).toBeTypeOf("number");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
