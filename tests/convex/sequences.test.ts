import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { recordReply } from "../../convex/lib/automations/engine";
import { TEMPLATES } from "../../convex/lib/automations/templates";
import {
  failureCode,
  makeTest,
  newPerson,
  seedSequence,
  seedTeam,
} from "./setup";

describe("sequence permissions", () => {
  it("lets a rep activate and pause their own sequence", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const id = await seedSequence(t, rep);
    const { version } = await rep.as.mutation(api.automations.activate, { id });
    expect(version).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("active");
    await rep.as.mutation(api.automations.pause, { id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("paused");
  });

  it("stops a rep activating or pausing someone else's sequence", async () => {
    const t = makeTest();
    const { rep, manager } = await seedTeam(t);
    const draft = await seedSequence(t, manager);
    const live = await seedSequence(t, manager, { active: true });
    expect(
      await failureCode(
        rep.as.mutation(api.automations.activate, { id: draft }),
      ),
    ).toBe("forbidden");
    expect(
      await failureCode(rep.as.mutation(api.automations.pause, { id: live })),
    ).toBe("forbidden");
    await manager.as.mutation(api.automations.pause, { id: live });
  });

  it("gives a rep a manual-trigger copy of an automatic template", async () => {
    const t = makeTest();
    const { rep, manager } = await seedTeam(t);
    const template = TEMPLATES.find((item) => item.trigger.kind !== "manual")!;
    const forRep = await rep.as.mutation(api.automations.createFromTemplate, {
      key: template.key,
    });
    const forManager = await manager.as.mutation(
      api.automations.createFromTemplate,
      { key: template.key },
    );
    const [mine, theirs] = await t.run(async (ctx) => [
      await ctx.db.get(forRep),
      await ctx.db.get(forManager),
    ]);
    expect(mine?.trigger.kind).toBe("manual");
    expect(theirs?.trigger.kind).toBe(template.trigger.kind);
  });

  it("keeps the workspace kill switch admin-only and blocks enrolment while on", async () => {
    const t = makeTest();
    const { admin, manager } = await seedTeam(t);
    const id = await seedSequence(t, manager, { active: true });
    const personId = await newPerson(manager, { firstName: "Dev" });
    expect(
      await failureCode(
        manager.as.mutation(api.automations.setKillSwitch, { on: true }),
      ),
    ).toBe("forbidden");
    await admin.as.mutation(api.automations.setKillSwitch, { on: true });
    expect(
      await failureCode(
        manager.as.mutation(api.automations.enrolMany, {
          automationId: id,
          subjects: [{ kind: "person", id: personId }],
        }),
      ),
    ).toBe("conflict");
  });
});

describe("enrolling records by hand", () => {
  it("skips records the rep doesn't own and enrols the rest", async () => {
    const t = makeTest();
    const { rep, otherRep, manager } = await seedTeam(t);
    const id = await seedSequence(t, manager, { active: true });
    const mine = await newPerson(rep, { firstName: "Mina" });
    const theirs = await newPerson(otherRep, { firstName: "Theo" });

    const result = await rep.as.mutation(api.automations.enrolMany, {
      automationId: id,
      subjects: [
        { kind: "person", id: mine },
        { kind: "person", id: theirs },
      ],
    });
    expect(result).toMatchObject({ total: 2, enrolled: 1, skipped: 1 });
    expect(result.problems).toEqual([
      { message: "Only the record's owner can add it", count: 1 },
    ]);
    const runs = await t.run((ctx) =>
      ctx.db.query("automationEnrollments").collect(),
    );
    expect(runs.map((run) => run.personId)).toEqual([mine]);
  });

  it("lets a manager enrol anyone's record, once", async () => {
    const t = makeTest();
    const { otherRep, manager } = await seedTeam(t);
    const id = await seedSequence(t, manager, { active: true });
    const theirs = await newPerson(otherRep, { firstName: "Theo" });
    const enrol = () =>
      manager.as.mutation(api.automations.enrolMany, {
        automationId: id,
        subjects: [{ kind: "person", id: theirs }],
      });
    expect(await enrol()).toMatchObject({ enrolled: 1 });
    expect(await enrol()).toMatchObject({ enrolled: 0, alreadyRunning: 1 });
  });
});

describe("unsubscribe by reply", () => {
  it("withdraws email consent and exits the person's live runs", async () => {
    const t = makeTest();
    const { rep, manager } = await seedTeam(t);
    const id = await seedSequence(t, manager, { active: true });
    const personId = await newPerson(rep, {
      firstName: "Mina",
      email: "mina@brand.in",
    });
    await rep.as.mutation(api.consents.record, {
      personId,
      channels: ["email"],
      event: "grant",
      purpose: "sales_outreach",
      basis: "consent",
      source: "email",
      note: "Opted in on the demo form",
    });
    await manager.as.mutation(api.automations.enrolMany, {
      automationId: id,
      subjects: [{ kind: "person", id: personId }],
    });

    const outcome = await t.run((ctx) =>
      recordReply(ctx, {
        refs: { personId },
        channel: "email",
        at: Date.now(),
        text: "Please unsubscribe me",
      }),
    );

    expect(outcome.exited).toBe(1);
    const [run] = await t.run((ctx) =>
      ctx.db.query("automationEnrollments").collect(),
    );
    expect(run.status).toBe("exited");
    expect(
      await rep.as.query(api.consents.check, {
        personId,
        channel: "email",
        purpose: "sales_outreach",
      }),
    ).toMatchObject({ allowed: false, reason: "withdrawn" });
  });

  it("ignores a long reply that merely mentions the word", async () => {
    const t = makeTest();
    const { rep, manager } = await seedTeam(t);
    const id = await seedSequence(t, manager, { active: true });
    const personId = await newPerson(rep, { firstName: "Mina" });
    await manager.as.mutation(api.automations.enrolMany, {
      automationId: id,
      subjects: [{ kind: "person", id: personId }],
    });
    await t.run((ctx) =>
      recordReply(ctx, {
        refs: { personId },
        channel: "email",
        at: Date.now(),
        text: "Happy to talk next week, no need to unsubscribe me from anything just yet, thanks for the patience",
      }),
    );
    const rows = await t.run((ctx) =>
      ctx.db
        .query("consents")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect(),
    );
    expect(rows).toEqual([]);
  });
});
