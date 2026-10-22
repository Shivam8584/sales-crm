import { describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DEFAULT_SETTINGS } from "../../lib/domain/automations";
import {
  failureCode,
  makeTest,
  newPerson,
  seedTeam,
  type Actor,
  type T,
} from "./setup";

const EMAIL = "mail";

const graphWith = (ab: {
  subject?: string;
  body?: string;
  splitB: number;
}) => ({
  nodes: [
    { id: "trigger", kind: "trigger" as const, x: 0, y: 0, config: {} },
    {
      id: EMAIL,
      kind: "send_email" as const,
      x: 0,
      y: 190,
      config: {
        subject: "Version A subject",
        body: "Hi {{person.firstName|there}}",
        purpose: "sales_outreach",
        ab,
      },
    },
  ],
  edges: [{ id: "e1", source: "trigger", port: "out" as const, target: EMAIL }],
});

async function splitSequence(
  t: T,
  owner: Actor,
  ab: Parameters<typeof graphWith>[0],
) {
  const graph = graphWith(ab);
  const trigger = { kind: "manual" as const };
  return await t.run((ctx) =>
    ctx.db.insert("automations", {
      name: "Intro",
      description: "",
      status: "active",
      subjectKind: "person",
      trigger,
      graph,
      settings: { ...DEFAULT_SETTINGS, quietHours: false },
      version: 1,
      published: {
        version: 1,
        subjectKind: "person",
        trigger,
        graph,
        settings: { ...DEFAULT_SETTINGS, quietHours: false },
        publishedAt: Date.now(),
        publishedById: owner.id,
      },
      stats: { enrolled: 0, active: 0, completed: 0, exited: 0, failed: 0 },
      createdById: owner.id,
      updatedAt: Date.now(),
    }),
  );
}

async function contact(owner: Actor, email: string) {
  const personId = await newPerson(owner, { firstName: "Mina", email });
  await owner.as.mutation(api.consents.record, {
    personId,
    channels: ["email"],
    event: "grant",
    purpose: "sales_outreach",
    basis: "consent",
    source: "email",
    note: "Opted in",
  });
  return personId;
}

const messages = (t: T) =>
  t.run((ctx) => ctx.db.query("automationMessages").collect());

describe("sending a split test", () => {
  it("sends version B's subject when the whole audience is on B", async () => {
    const t = makeTest();
    const { manager } = await seedTeam(t);
    const id = await splitSequence(t, manager, {
      subject: "B subject",
      splitB: 100,
    });
    const personId = await contact(manager, "mina@brand.in");
    await manager.as.mutation(api.automations.enrolMany, {
      automationId: id,
      subjects: [{ kind: "person", id: personId }],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [message] = await messages(t);
    expect(message).toMatchObject({
      variant: "b",
      nodeId: EMAIL,
      subject: "B subject",
    });
    expect(message.body).toContain("Hi Mina");
  });

  it("sends version A to everyone when A is the winner", async () => {
    const t = makeTest();
    const { manager } = await seedTeam(t);
    const id = await splitSequence(t, manager, {
      subject: "B subject",
      splitB: 0,
    });
    const personId = await contact(manager, "mina@brand.in");
    await manager.as.mutation(api.automations.enrolMany, {
      automationId: id,
      subjects: [{ kind: "person", id: personId }],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await messages(t))[0]).toMatchObject({
      variant: "a",
      subject: "Version A subject",
    });
  });

  it("keeps the version an enrolment already got when the split changes", async () => {
    const t = makeTest();
    const { manager } = await seedTeam(t);
    const id = await splitSequence(t, manager, {
      subject: "B subject",
      splitB: 1,
    });
    const personId = await contact(manager, "mina@brand.in");
    await manager.as.mutation(api.automations.enrolMany, {
      automationId: id,
      subjects: [{ kind: "person", id: personId }],
    });
    const [run] = await t.run((ctx) =>
      ctx.db.query("automationEnrollments").collect(),
    );
    await t.run((ctx) =>
      ctx.db.insert("automationMessages", {
        automationId: id,
        enrollmentId: run._id,
        stepKey: "earlier",
        nodeId: EMAIL,
        variant: "b",
        channel: "email",
        to: "mina@brand.in",
        status: "sent",
        provider: "resend",
        attempts: 1,
      }),
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const sent = (await messages(t)).find((item) => item.stepKey !== "earlier");
    expect(sent).toMatchObject({ variant: "b", subject: "B subject" });
  });

  it("sends plain emails untouched when there's no split test", async () => {
    const t = makeTest();
    const { manager } = await seedTeam(t);
    const id = await splitSequence(t, manager, { splitB: 50 });
    const personId = await contact(manager, "mina@brand.in");
    await manager.as.mutation(api.automations.enrolMany, {
      automationId: id,
      subjects: [{ kind: "person", id: personId }],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [message] = await messages(t);
    expect(message.variant).toBeUndefined();
    expect(message.subject).toBe("Version A subject");
  });
});

describe("changing the split", () => {
  it("moves the share on the draft and the live version, and returns the old share", async () => {
    const t = makeTest();
    const { manager } = await seedTeam(t);
    const id = await splitSequence(t, manager, {
      subject: "B subject",
      splitB: 50,
    });
    const result = await manager.as.mutation(api.automations.setSplit, {
      id,
      nodeId: EMAIL,
      splitB: 100,
    });
    expect(result).toEqual({ previous: 50 });
    const row = await t.run((ctx) => ctx.db.get(id));
    const split = (graph: unknown) =>
      (graph as ReturnType<typeof graphWith>).nodes[1].config.ab?.splitB;
    expect(split(row?.graph)).toBe(100);
    expect(split(row?.published?.graph)).toBe(100);
    expect(row?.version).toBe(1);
  });

  it("refuses a bad share, a step without a test and someone else's sequence", async () => {
    const t = makeTest();
    const { manager, rep } = await seedTeam(t);
    const id = await splitSequence(t, manager, {
      subject: "B subject",
      splitB: 50,
    });
    const call = (by: Actor, nodeId: string, splitB: number) =>
      by.as.mutation(api.automations.setSplit, { id, nodeId, splitB });
    expect(await failureCode(call(manager, EMAIL, 101))).toBe("invalid");
    expect(await failureCode(call(manager, EMAIL, 2.5))).toBe("invalid");
    expect(await failureCode(call(manager, "trigger", 0))).toBe("conflict");
    expect(await failureCode(call(rep, EMAIL, 0))).toBe("forbidden");
  });
});

describe("split test results", () => {
  async function withResults(
    t: T,
    id: Id<"automations">,
    counts: { a: [number, number]; b: [number, number] },
  ) {
    await t.run(async (ctx) => {
      for (const variant of ["a", "b"] as const) {
        const [sent, replied] = counts[variant];
        for (let index = 0; index < sent; index++) {
          const sentAt = Date.now() - 1000;
          const runId = await ctx.db.insert("automationEnrollments", {
            automationId: id,
            version: 1,
            subjectKind: "person",
            subjectKey: `person:${variant}${index}`,
            status: "completed",
            currentNodeId: EMAIL,
            stepKey: `${variant}${index}:1`,
            seq: 1,
            attempt: 0,
            enrolledAt: sentAt - 1000,
            source: "test",
            history: [],
            repliedAt: index < replied ? sentAt + 500 : undefined,
          });
          await ctx.db.insert("automationMessages", {
            automationId: id,
            enrollmentId: runId,
            stepKey: `${variant}${index}:1`,
            nodeId: EMAIL,
            variant,
            channel: "email",
            to: "x@y.in",
            status: "sent",
            provider: "resend",
            attempts: 1,
            sentAt,
          });
        }
      }
    });
  }

  it("counts sent and replied per version and holds back a verdict on small numbers", async () => {
    const t = makeTest();
    const { manager } = await seedTeam(t);
    const id = await splitSequence(t, manager, {
      subject: "B subject",
      splitB: 50,
    });
    await withResults(t, id, { a: [10, 1], b: [12, 6] });
    const data = await manager.as.query(api.automations.analytics, { id });
    const [test] = data!.tests;
    expect(test).toMatchObject({
      nodeId: EMAIL,
      splitB: 50,
      a: { sent: 10, replied: 1, subject: "Version A subject" },
      b: { sent: 12, replied: 6, subject: "B subject" },
      leader: null,
    });
    expect(test.summary).toMatch(/^Too early to call/);
  });

  it("names a leader once both versions have enough sends", async () => {
    const t = makeTest();
    const { manager } = await seedTeam(t);
    const id = await splitSequence(t, manager, {
      subject: "B subject",
      splitB: 50,
    });
    await withResults(t, id, { a: [40, 4], b: [40, 12] });
    const data = await manager.as.query(api.automations.analytics, { id });
    expect(data!.tests[0]).toMatchObject({ leader: "b" });
    expect(data!.tests[0].summary).toMatch(/^B is ahead by 20 points/);
  });
});
