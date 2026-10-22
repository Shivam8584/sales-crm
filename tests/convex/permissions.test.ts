import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { failureCode, makeTest, newAccount, seedTeam } from "./setup";

describe("permissions by role", () => {
  it("lets a rep reassign an account they own but not someone else's", async () => {
    const t = makeTest();
    const { rep, otherRep } = await seedTeam(t);
    const mine = await newAccount(rep, "Mine Co");
    const theirs = await newAccount(otherRep, "Theirs Co");

    await rep.as.mutation(api.accounts.setOwner, {
      ids: [mine],
      ownerId: otherRep.id,
    });
    expect(
      await failureCode(
        rep.as.mutation(api.accounts.setOwner, {
          ids: [theirs],
          ownerId: rep.id,
        }),
      ),
    ).toBe("forbidden");
  });

  it("lets a manager reassign any account", async () => {
    const t = makeTest();
    const { manager, otherRep, rep } = await seedTeam(t);
    const theirs = await newAccount(otherRep, "Theirs Co");
    await manager.as.mutation(api.accounts.setOwner, {
      ids: [theirs],
      ownerId: rep.id,
    });
    const row = await t.run((ctx) => ctx.db.get(theirs));
    expect(row?.ownerId).toBe(rep.id);
  });

  it("stops a rep archiving someone else's account", async () => {
    const t = makeTest();
    const { rep, otherRep, manager } = await seedTeam(t);
    const theirs = await newAccount(otherRep, "Theirs Co");
    expect(
      await failureCode(
        rep.as.mutation(api.accounts.setArchived, {
          ids: [theirs],
          archived: true,
        }),
      ),
    ).toBe("forbidden");
    await manager.as.mutation(api.accounts.setArchived, {
      ids: [theirs],
      archived: true,
    });
    const row = await t.run((ctx) => ctx.db.get(theirs));
    expect(row?.archivedAt).toBeTypeOf("number");
  });

  it("refuses bulk export to reps and allows managers", async () => {
    const t = makeTest();
    const { rep, manager } = await seedTeam(t);
    expect(
      await failureCode(rep.as.query(api.exports.assertCanExport, {})),
    ).toBe("forbidden");
    expect(
      await failureCode(manager.as.query(api.exports.assertCanExport, {})),
    ).toBeNull();
  });

  it("keeps workspace settings admin-only", async () => {
    const t = makeTest();
    const { admin, manager } = await seedTeam(t);
    const setting = { key: "leads.slaMinutes" as const, value: 15 };
    expect(
      await failureCode(manager.as.mutation(api.settings.set, { setting })),
    ).toBe("forbidden");
    await admin.as.mutation(api.settings.set, { setting });
    const stored = await t.run((ctx) =>
      ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", setting.key))
        .unique(),
    );
    expect(stored?.value).toBe("15");
  });

  it("keeps the system page admin-only", async () => {
    const t = makeTest();
    const { admin, manager, rep } = await seedTeam(t);
    expect(await failureCode(rep.as.query(api.system.overview, {}))).toBe(
      "forbidden",
    );
    expect(await failureCode(manager.as.query(api.system.overview, {}))).toBe(
      "forbidden",
    );
    expect(
      await failureCode(admin.as.query(api.system.overview, {})),
    ).toBeNull();
  });

  it("keeps invites admin-only and stores only the token hash", async () => {
    const t = makeTest();
    const { admin, manager } = await seedTeam(t);
    const input = { email: "New.Hire@Example.com", role: "rep" as const };
    expect(
      await failureCode(manager.as.mutation(api.invites.create, input)),
    ).toBe("forbidden");
    const invite = await admin.as.mutation(api.invites.create, input);
    const row = await t.run((ctx) => ctx.db.get(invite.id));
    expect(row?.email).toBe("new.hire@example.com");
    expect(row?.tokenHash).not.toBe(invite.token);
    expect(JSON.stringify(row)).not.toContain(invite.token);
  });

  it("refuses signed-out callers and deactivated members", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    expect(await failureCode(t.query(api.exports.assertCanExport, {}))).toBe(
      "unauthenticated",
    );
    await t.run((ctx) => ctx.db.patch(rep.id, { status: "deactivated" }));
    expect(
      await failureCode(rep.as.query(api.exports.assertCanExport, {})),
    ).toBe("forbidden");
  });
});
