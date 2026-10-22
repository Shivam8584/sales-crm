import { v } from "convex/values";
import type { PaginationResult } from "convex/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { accountCounts, leadCounts, peopleCounts } from "./lib/counts";
import { internalMutation } from "./lib/functions";
import { refreshStages } from "./lib/stages";
import { literals } from "./lib/validators";

const BATCH = 400;
const EVENT_BATCH = 100;
const CLEAR = 2000;

type Backfill<D> = {
  clear(ctx: MutationCtx): Promise<void>;
  insertIfDoesNotExist(ctx: MutationCtx, doc: D): Promise<void>;
};

async function backfill<D>(
  ctx: MutationCtx,
  aggregate: Backfill<D>,
  first: boolean,
  page: PaginationResult<D>,
) {
  if (first) await aggregate.clear(ctx);
  for (const doc of page.page) await aggregate.insertIfDoesNotExist(ctx, doc);
  return page.isDone ? null : page.continueCursor;
}

/**
 * Resets a count aggregate (or, for `platformEvents`, the `activationStages`
 * rows reports read) and backfills it from its table, one batch per mutation.
 * Run after deploying them, or to repair drift:
 * `npx convex run counts:rebuild '{"table":"accounts"}'`.
 */
export const rebuild = internalMutation({
  args: {
    table: literals(["accounts", "people", "leads", "platformEvents"]),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { table, cursor }) => {
    const opts = { numItems: BATCH, cursor: cursor ?? null };
    const first = cursor === undefined;
    if (table === "platformEvents") {
      if (first) {
        const stale = await ctx.db.query("activationStages").take(CLEAR);
        for (const row of stale) await ctx.db.delete(row._id);
        if (stale.length === CLEAR) {
          await ctx.scheduler.runAfter(0, internal.counts.rebuild, { table });
          return;
        }
      }
      const page = await ctx.db
        .query("platformEvents")
        .paginate({ ...opts, numItems: EVENT_BATCH });
      await refreshStages(ctx, page.page);
      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.counts.rebuild, {
          table,
          cursor: page.continueCursor,
        });
      }
      return;
    }
    const next =
      table === "accounts"
        ? await backfill(
            ctx,
            accountCounts,
            first,
            await ctx.db.query("accounts").paginate(opts),
          )
        : table === "people"
          ? await backfill(
              ctx,
              peopleCounts,
              first,
              await ctx.db.query("people").paginate(opts),
            )
          : await backfill(
              ctx,
              leadCounts,
              first,
              await ctx.db.query("leads").paginate(opts),
            );
    if (next !== null) {
      await ctx.scheduler.runAfter(0, internal.counts.rebuild, {
        table,
        cursor: next,
      });
    }
  },
});
