import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { makeTest, seedTeam, type T } from "./setup";

const submission = (overrides: Record<string, unknown> = {}) => ({
  kind: "demo" as const,
  name: "Kabir Rao",
  email: "kabir@brandco.in",
  companyName: "BrandCo",
  website: "https://brandco.in",
  message: "We need a demo and pricing for our campaign",
  utm: {},
  ...overrides,
});

const ingest = (t: T, overrides: Record<string, unknown> = {}) =>
  t.mutation(internal.leads.ingest, { submission: submission(overrides) });

const leadRow = (t: T, id: string) =>
  t.run(async (ctx) => (await ctx.db.get(id as never)) as never) as Promise<{
    score: number;
    scoreReasons: string[];
    ownerId?: string;
    repeats?: number;
  }>;

describe("lead intake", () => {
  it("scores a demo request from the facts on the form", async () => {
    const t = makeTest();
    await seedTeam(t);
    const { id } = await ingest(t);
    const lead = await leadRow(t, id);
    expect(lead.score).toBeGreaterThan(40);
    expect(lead.scoreReasons).toEqual(
      expect.arrayContaining(["Demo request", "Company email"]),
    );
  });

  it("assigns by the first routing rule that matches", async () => {
    const t = makeTest();
    const { admin, otherRep } = await seedTeam(t);
    await admin.as.mutation(api.settings.set, {
      setting: {
        key: "routing.rules",
        value: [
          {
            id: "demo-to-omar",
            name: "Demos go to Omar",
            when: { kind: "demo" },
            assign: { memberId: otherRep.id },
          },
        ],
      },
    });
    const { id } = await ingest(t);
    expect((await leadRow(t, id)).ownerId).toBe(otherRep.id);
  });

  it("falls back to round-robin in join order when no rule matches", async () => {
    const t = makeTest();
    const { admin, manager, rep } = await seedTeam(t);
    const owners = [];
    for (const email of ["a@one.in", "b@two.in", "c@three.in"]) {
      const { id } = await ingest(t, { kind: "contact", email });
      owners.push((await leadRow(t, id)).ownerId);
    }
    expect(owners).toEqual([admin.id, manager.id, rep.id]);
  });

  it("folds a repeat submission into the open lead instead of duplicating it", async () => {
    const t = makeTest();
    await seedTeam(t);
    const first = await ingest(t);
    const second = await ingest(t);
    expect(second).toEqual({ id: first.id, created: false });
    expect((await leadRow(t, first.id)).repeats).toBe(1);
    const all = await t.run((ctx) => ctx.db.query("leads").collect());
    expect(all).toHaveLength(1);
  });
});
