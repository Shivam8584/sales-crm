import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { personName } from "../../lib/domain/labels";
import { logChanges } from "./timeline";

/**
 * Deals a person is a contact on. A deal's contacts must work at its account,
 * and people leave a deal when they move away, so the account's deals are the
 * whole candidate set; that keeps this on an index without a join table.
 */
export async function dealsWithPerson(
  ctx: QueryCtx,
  person: Pick<Doc<"people">, "_id" | "accountId">,
) {
  const accountId = person.accountId;
  if (!accountId) return [];
  const deals = await ctx.db
    .query("deals")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  return deals.filter((deal) => deal.personIds.includes(person._id));
}

/** Takes the person off every deal at `accountId`; `logAs` records a Contacts change. */
export async function leaveDeals(
  ctx: MutationCtx,
  person: Doc<"people">,
  accountId: Id<"accounts">,
  logAs?: Id<"members">,
) {
  const deals = await dealsWithPerson(ctx, { _id: person._id, accountId });
  const now = Date.now();
  for (const deal of deals) {
    const personIds = deal.personIds.filter((id) => id !== person._id);
    await ctx.db.patch(deal._id, { personIds, updatedAt: now });
    if (!logAs) continue;
    const names = async (ids: Id<"people">[]) => {
      const out: string[] = [];
      for (const id of ids) {
        const doc = await ctx.db.get(id);
        if (doc) out.push(personName(doc));
      }
      return out.join(", ") || undefined;
    };
    await logChanges(
      ctx,
      { accountId: deal.accountId, dealId: deal._id },
      logAs,
      [
        {
          field: "Contacts",
          from: await names(deal.personIds),
          to: await names(personIds),
        },
      ],
    );
  }
  return deals;
}
