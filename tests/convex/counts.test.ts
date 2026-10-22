import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { makeTest, newAccount, seedTeam } from "./setup";

describe("list counts", () => {
  it("track creates, archives, restores and owner changes exactly", async () => {
    const t = makeTest();
    const { manager, rep } = await seedTeam(t);
    const first = await newAccount(manager, "Alpha Foods");
    await newAccount(manager, "Beta Foods");
    await newAccount(rep, "Gamma Foods");
    const views = async () =>
      (await rep.as.query(api.accounts.counts, {})).views;

    expect(await views()).toEqual({ all: 3, mine: 1, archived: 0 });

    await manager.as.mutation(api.accounts.setArchived, {
      ids: [first],
      archived: true,
    });
    expect(await views()).toEqual({ all: 2, mine: 1, archived: 1 });

    await manager.as.mutation(api.accounts.setOwner, {
      ids: [first],
      ownerId: rep.id,
    });
    await manager.as.mutation(api.accounts.setArchived, {
      ids: [first],
      archived: false,
    });
    expect(await views()).toEqual({ all: 3, mine: 2, archived: 0 });
  });
});
