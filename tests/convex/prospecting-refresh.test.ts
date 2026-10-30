import { expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { INBOUND_SOURCE } from "../../lib/domain/prospecting";
import { makeTest, seedMember } from "./setup";

test("the daily refresh leaves old public checks out", async () => {
  vi.useFakeTimers();
  const t = makeTest();
  const member = await seedMember(t, "admin");
  await t.run(async (ctx) => {
    const now = Date.now();
    const list = (name: string) =>
      ctx.db.insert("watchlists", {
        name,
        createdById: member.id,
        updatedAt: now,
      });
    const product = (
      watchlistId: Awaited<ReturnType<typeof list>>,
      id: string,
    ) =>
      ctx.db.insert("watchedProducts", {
        watchlistId,
        marketplace: "amazon",
        identifier: id,
        listingKey: `amazon:${id}`,
        url: `https://www.amazon.in/dp/${id}`,
        status: "ok",
        addedById: member.id,
      });
    await product(await list(INBOUND_SOURCE), "inbound");
    await product(await list("Kitchen"), "curated");
  });
  expect(await t.mutation(internal.prospecting.refreshAll, {})).toBe(1);
  vi.useRealTimers();
});
