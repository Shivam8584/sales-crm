import { describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
} from "./setup";

async function twoAccounts() {
  const t = makeTest();
  const team = await seedTeam(t);
  const { manager } = team;
  const winnerId = await newAccount(
    manager,
    "Acme Traders",
    manager.id,
    "acme.in",
  );
  const loserId = await newAccount(
    manager,
    "Acme Trading Co",
    manager.id,
    "acme.com",
  );
  const people = [
    await newPerson(manager, { firstName: "Asha", accountId: loserId }),
    await newPerson(manager, { firstName: "Bala", accountId: loserId }),
  ];
  const dealId = await manager.as.mutation(api.deals.create, {
    title: "Annual plan",
    accountId: loserId,
  });
  const taskId = await manager.as.mutation(api.tasks.create, {
    title: "Send quote",
    accountId: loserId,
  });
  return { t, team, winnerId, loserId, people, dealId, taskId };
}

const merge = (
  fixture: Awaited<ReturnType<typeof twoAccounts>>,
  by: "manager" | "rep" = "manager",
) =>
  fixture.team[by].as.mutation(api.dedupe.merge, {
    type: "accounts",
    winnerId: fixture.winnerId,
    loserId: fixture.loserId,
  });

describe("account merge", () => {
  it("moves the loser's people, deals and tasks to the winner", async () => {
    const fixture = await twoAccounts();
    const { t, winnerId, people, dealId, taskId } = fixture;
    await merge(fixture);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rows = await t.run(async (ctx) => ({
      people: await Promise.all(people.map((id) => ctx.db.get(id))),
      deal: await ctx.db.get(dealId),
      task: await ctx.db.get(taskId),
    }));
    expect(rows.people.map((person) => person?.accountId)).toEqual([
      winnerId,
      winnerId,
    ]);
    expect(rows.deal?.accountId).toBe(winnerId);
    expect(rows.task?.accountId).toBe(winnerId);
  });

  it("archives the loser pointing at the winner and logs the merge", async () => {
    const fixture = await twoAccounts();
    const { t, winnerId, loserId } = fixture;
    await merge(fixture);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [loser, winner, log] = await t.run(async (ctx) => [
      await ctx.db.get(loserId),
      await ctx.db.get(winnerId),
      await ctx.db
        .query("timeline")
        .withIndex("by_account", (q) => q.eq("accountId", winnerId))
        .collect(),
    ]);
    expect(loser).toMatchObject({ mergedIntoId: winnerId });
    expect(loser?.archivedAt).toBeTypeOf("number");
    expect(loser?.mergingInto).toBeUndefined();
    expect(winner?.archivedAt).toBeUndefined();
    expect(winner?.mergingFrom).toBeUndefined();
    expect(
      log.some((entry) => entry.subject?.includes("Acme Trading Co into this")),
    ).toBe(true);
  });

  it("refuses to merge the same pair twice", async () => {
    const fixture = await twoAccounts();
    await merge(fixture);
    await fixture.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await failureCode(merge(fixture))).toBe("conflict");
  });

  it("is for managers: a rep is refused and nothing is locked", async () => {
    const fixture = await twoAccounts();
    expect(await failureCode(merge(fixture, "rep"))).toBe("forbidden");
    const loser = await fixture.t.run((ctx) => ctx.db.get(fixture.loserId));
    expect(loser?.mergingInto).toBeUndefined();
  });
});
