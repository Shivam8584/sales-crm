import type { FunctionReturnType } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
} from "./setup";

const DAY = 24 * 60 * 60_000;
const first = { numItems: 50, cursor: null };

async function fixture() {
  const t = makeTest();
  const team = await seedTeam(t);
  const accountId = await newAccount(team.rep, "Acme Traders");
  return { t, team, accountId };
}

const tick = () => vi.advanceTimersByTime(1000);

describe("audit log", () => {
  it("is for managers only", async () => {
    const { team } = await fixture();
    const { rep, manager } = team;
    for (const call of [
      rep.as.query(api.audit.list, { paginationOpts: first }),
      rep.as.query(api.audit.deleted, {
        recordType: "deals",
        paginationOpts: first,
      }),
    ]) {
      expect(await failureCode(call)).toBe("forbidden");
    }
    expect(
      await failureCode(
        manager.as.query(api.audit.list, { paginationOpts: first }),
      ),
    ).toBeNull();
  });

  it("shows who changed what, with before and after, and honours filters", async () => {
    const { team, accountId } = await fixture();
    const { rep, manager } = team;
    tick();
    await rep.as.mutation(api.accounts.update, {
      id: accountId,
      patch: { name: "Acme Traders Ltd" },
    });
    tick();
    await manager.as.mutation(api.accounts.setOwner, {
      ids: [accountId],
      ownerId: manager.id,
    });

    const all = await manager.as.query(api.audit.list, {
      paginationOpts: first,
    });
    expect(all.isDone).toBe(true);
    expect(all.page.map((row) => row.actor?.name)).toEqual([
      "Max Manager",
      "Ria Rep",
    ]);
    expect(all.page[1].changes).toEqual([
      { field: "Name", from: "Acme Traders", to: "Acme Traders Ltd" },
    ]);
    expect(all.page[1].record?.name).toBe("Acme Traders Ltd");

    const byRep = await manager.as.query(api.audit.list, {
      paginationOpts: first,
      actorId: rep.id,
    });
    expect(byRep.page).toHaveLength(1);

    const deals = await manager.as.query(api.audit.list, {
      paginationOpts: first,
      recordType: "deals",
    });
    expect(deals.page).toHaveLength(0);

    const future = await manager.as.query(api.audit.list, {
      paginationOpts: first,
      from: Date.now() + DAY,
    });
    expect(future.page).toHaveLength(0);
  });

  it("merges task edits and deal moves in with record changes, newest first, a page at a time", async () => {
    const { team, accountId } = await fixture();
    const { rep, manager } = team;
    const dealId = await rep.as.mutation(api.deals.create, {
      title: "Q3 campaign",
      accountId,
    });
    const taskId = await rep.as.mutation(api.tasks.create, {
      title: "Send quote",
    });
    tick();
    await rep.as.mutation(api.accounts.update, {
      id: accountId,
      patch: { name: "Acme Ltd" },
    });
    tick();
    await rep.as.mutation(api.tasks.update, {
      id: taskId,
      patch: { priority: "urgent", dueDate: "2030-01-01" },
    });
    tick();
    await rep.as.mutation(api.deals.update, {
      id: dealId,
      patch: { stage: "demo" },
    });

    const everything = await manager.as.query(api.audit.list, {
      paginationOpts: first,
    });
    expect(everything.page.map((row) => row.recordType)).toEqual([
      "deals",
      "tasks",
      "accounts",
    ]);
    expect(everything.page[0].changes).toEqual([
      { field: "Stage", from: "Discovery", to: "Demo" },
    ]);
    expect(everything.page[1].changes).toEqual([
      { field: "Priority", from: "Normal", to: "Urgent" },
      { field: "Due date", to: "2030-01-01" },
    ]);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: FunctionReturnType<typeof api.audit.list> =
        await manager.as.query(api.audit.list, {
          paginationOpts: { numItems: 1, cursor },
        });
      seen.push(...page.page.map((row) => row._id));
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(seen).toEqual(everything.page.map((row) => row._id));

    const tasksOnly = await manager.as.query(api.audit.list, {
      paginationOpts: first,
      recordType: "tasks",
    });
    expect(tasksOnly.page.map((row) => row.record?.name)).toEqual([
      "Send quote",
    ]);
  });

  it("hides changes on erased people", async () => {
    const { team, accountId } = await fixture();
    const personId = await newPerson(team.rep, {
      firstName: "Priya",
      email: "priya@acme.in",
      accountId,
    });
    tick();
    await team.rep.as.mutation(api.people.update, {
      id: personId,
      patch: { title: "Buyer" },
    });
    await team.admin.as.mutation(api.consents.erase, {
      personId,
      confirmation: "erase",
    });
    const log = await team.manager.as.query(api.audit.list, {
      paginationOpts: first,
      recordType: "people",
    });
    expect(log.page).toHaveLength(0);
  });

  it("exports rows only to people who may export", async () => {
    const { team, accountId } = await fixture();
    tick();
    await team.rep.as.mutation(api.accounts.update, {
      id: accountId,
      patch: { name: "Acme Ltd" },
    });
    expect(await failureCode(team.rep.as.action(api.audit.exportCsv, {}))).toBe(
      "forbidden",
    );
    const out = await team.manager.as.action(api.audit.exportCsv, {});
    expect(out.truncated).toBe(false);
    expect(out.rows[1].slice(1)).toEqual([
      "Ria Rep",
      "accounts",
      "Acme Ltd",
      "Name",
      "Acme Traders",
      "Acme Ltd",
    ]);
  });
});

describe("deleted records", () => {
  it("restores a deleted deal with its tasks, once", async () => {
    const { t, team, accountId } = await fixture();
    const { rep, manager } = team;
    const dealId = await rep.as.mutation(api.deals.create, {
      title: "Q3 campaign",
      accountId,
    });
    const taskId = await rep.as.mutation(api.tasks.create, {
      title: "Follow up",
      dealId,
    });
    await manager.as.mutation(api.deals.remove, { id: dealId });

    const list = await manager.as.query(api.audit.deleted, {
      recordType: "deals",
      paginationOpts: first,
    });
    expect(list.page.map((row) => [row.label, row.by?.name])).toEqual([
      ["Q3 campaign", "Max Manager"],
    ]);

    const eventId = list.page[0].id as never;
    expect(
      await failureCode(rep.as.mutation(api.audit.restore, { id: eventId })),
    ).toBe("forbidden");
    const restored = await manager.as.mutation(api.audit.restore, {
      id: eventId,
    });
    expect(restored.recordType).toBe("deals");

    const rows = await team.manager.as.query(api.audit.deleted, {
      recordType: "deals",
      paginationOpts: first,
    });
    expect(rows.page).toHaveLength(0);
    const { deal, task } = await t.run(async (ctx) => ({
      deal: await ctx.db.get(restored.id as never),
      task: await ctx.db.get(taskId),
    }));
    expect(deal).toMatchObject({ title: "Q3 campaign" });
    expect(task?.dealId).toBe(restored.id);

    expect(
      await failureCode(
        manager.as.mutation(api.audit.restore, { id: eventId }),
      ),
    ).toBe("conflict");
  });

  it("does not offer a task twice after the undo toast brought it back", async () => {
    const { team } = await fixture();
    const { rep, manager } = team;
    const taskId = await rep.as.mutation(api.tasks.create, { title: "Call" });
    const stored = await rep.as.mutation(api.tasks.remove, { id: taskId });
    await rep.as.mutation(api.tasks.restore, { task: stored });
    const list = await manager.as.query(api.audit.deleted, {
      recordType: "tasks",
      paginationOpts: first,
    });
    expect(list.page).toHaveLength(0);
  });

  it("restores a deleted task for a manager", async () => {
    const { t, team } = await fixture();
    const { rep, manager } = team;
    const taskId = await rep.as.mutation(api.tasks.create, { title: "Call" });
    await rep.as.mutation(api.tasks.remove, { id: taskId });
    const list = await manager.as.query(api.audit.deleted, {
      recordType: "tasks",
      paginationOpts: first,
    });
    const restored = await manager.as.mutation(api.audit.restore, {
      id: list.page[0].id as never,
    });
    const task = await t.run((ctx) => ctx.db.get(restored.id as never));
    expect(task).toMatchObject({ title: "Call" });
  });

  it("lists archived accounts and people, but not merged or erased ones", async () => {
    const { t, team, accountId } = await fixture();
    const { rep, manager, admin } = team;
    const merged = await newAccount(rep, "Acme Trading", rep.id, "acme.com");
    const gone = await newPerson(rep, {
      firstName: "Priya",
      email: "priya@acme.in",
      accountId,
    });
    const kept = await newPerson(rep, {
      firstName: "Rohan",
      email: "rohan@acme.in",
      accountId,
    });
    await manager.as.mutation(api.accounts.setArchived, {
      ids: [accountId, merged],
      archived: true,
    });
    await manager.as.mutation(api.people.setArchived, {
      ids: [kept],
      archived: true,
    });
    await t.run((ctx) => ctx.db.patch(merged, { mergedIntoId: accountId }));
    await admin.as.mutation(api.consents.erase, {
      personId: gone,
      confirmation: "erase",
    });

    const accounts = await manager.as.query(api.audit.deleted, {
      recordType: "accounts",
      paginationOpts: first,
    });
    expect(accounts.page.map((row) => row.label)).toEqual(["Acme Traders"]);
    const people = await manager.as.query(api.audit.deleted, {
      recordType: "people",
      paginationOpts: first,
    });
    expect(people.page.map((row) => row.label)).toEqual(["Rohan"]);
  });

  it("stops offering a deleted record after 30 days and sweeps the copy", async () => {
    const { t, team } = await fixture();
    const { rep, manager } = team;
    const taskId = await rep.as.mutation(api.tasks.create, { title: "Call" });
    await rep.as.mutation(api.tasks.remove, { id: taskId });
    const [event] = await t.run((ctx) => ctx.db.query("auditEvents").collect());

    vi.advanceTimersByTime(31 * DAY);
    const list = await manager.as.query(api.audit.deleted, {
      recordType: "tasks",
      paginationOpts: first,
    });
    expect(list.page).toHaveLength(0);
    expect(
      await failureCode(
        manager.as.mutation(api.audit.restore, { id: event._id }),
      ),
    ).toBe("conflict");

    await t.mutation(internal.audit.sweep, {});
    expect(await t.run((ctx) => ctx.db.get(event._id))).toBeNull();
  });
});
