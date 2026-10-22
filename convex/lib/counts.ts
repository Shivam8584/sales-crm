import { TableAggregate } from "@convex-dev/aggregate";
import { Triggers, type Trigger } from "convex-helpers/server/triggers";
import { components } from "../_generated/api";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { LeadKind, LeadStatus } from "../../lib/domain/enums";
import { syncStages } from "./stages";

/**
 * Exact list counts (page views, footers, sidebar) without scanning tables.
 *
 * Each counted table has an aggregate (`@convex-dev/aggregate`) whose sort key
 * holds the fields lists filter on. A trigger keeps it in step with every
 * write made through the builders in `./functions`, inside the same
 * transaction, so a mutation must never use the raw builders from
 * `_generated/server`. `counts:rebuild` resets an aggregate from its table.
 * The same triggers keep `activationStages` in step with `platformEvents`.
 */

const accountKey = (doc: Doc<"accounts">): [boolean, Id<"members">, string] => [
  Boolean(doc.archivedAt),
  doc.ownerId,
  doc.stage,
];
const personKey = (doc: Doc<"people">): [boolean, boolean, Id<"members">] => [
  Boolean(doc.archivedAt),
  Boolean(doc.accountId),
  doc.ownerId,
];
const leadKey = (doc: Doc<"leads">): [string, string, string] => [
  doc.status,
  doc.ownerId ?? "",
  doc.kind,
];

export const accountCounts = new TableAggregate<{
  Key: ReturnType<typeof accountKey>;
  DataModel: DataModel;
  TableName: "accounts";
}>(components.accountCounts, { sortKey: accountKey });

export const peopleCounts = new TableAggregate<{
  Key: ReturnType<typeof personKey>;
  DataModel: DataModel;
  TableName: "people";
}>(components.peopleCounts, { sortKey: personKey });

export const leadCounts = new TableAggregate<{
  Key: ReturnType<typeof leadKey>;
  DataModel: DataModel;
  TableName: "leads";
}>(components.leadCounts, { sortKey: leadKey });

type SyncTarget<T extends "accounts" | "people" | "leads"> = {
  insertIfDoesNotExist(ctx: MutationCtx, doc: Doc<T>): Promise<void>;
  deleteIfExists(ctx: MutationCtx, doc: Doc<T>): Promise<void>;
  replaceOrInsert(
    ctx: MutationCtx,
    oldDoc: Doc<T>,
    newDoc: Doc<T>,
  ): Promise<void>;
};

/** Idempotent writes, so live traffic stays correct while `rebuild` backfills. */
function sync<T extends "accounts" | "people" | "leads">(
  aggregate: SyncTarget<T>,
  key: (doc: Doc<T>) => unknown[],
): Trigger<MutationCtx, DataModel, T> {
  return async (ctx, change) => {
    if (change.operation === "insert") {
      await aggregate.insertIfDoesNotExist(ctx, change.newDoc);
    } else if (change.operation === "delete") {
      await aggregate.deleteIfExists(ctx, change.oldDoc);
    } else if (
      JSON.stringify(key(change.oldDoc)) !== JSON.stringify(key(change.newDoc))
    ) {
      await aggregate.replaceOrInsert(ctx, change.oldDoc, change.newDoc);
    }
  };
}

export const triggers = new Triggers<DataModel, MutationCtx>();
triggers.register("accounts", sync(accountCounts, accountKey));
triggers.register("people", sync(peopleCounts, personKey));
triggers.register("leads", sync(leadCounts, leadKey));
triggers.register("platformEvents", syncStages);

async function memberIds(ctx: QueryCtx) {
  return (await ctx.db.query("members").collect()).map((member) => member._id);
}

/** Accounts by archived state, optionally one owner's and one stage's. */
export async function countAccounts(
  ctx: QueryCtx,
  filter: { archived: boolean; ownerId?: Id<"members">; stage?: string },
) {
  const owners = filter.ownerId
    ? [filter.ownerId]
    : filter.stage
      ? await memberIds(ctx)
      : [];
  if (owners.length === 0) {
    return await accountCounts.count(ctx, {
      bounds: { prefix: [filter.archived] },
    });
  }
  const counts = await accountCounts.countBatch(
    ctx,
    owners.map((ownerId) => ({
      bounds: {
        prefix: filter.stage
          ? [filter.archived, ownerId, filter.stage]
          : [filter.archived, ownerId],
      },
    })),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

/** Active people, optionally only those with (or without) an account and one owner's. */
export async function countPeople(
  ctx: QueryCtx,
  filter: { linked?: boolean; ownerId?: Id<"members"> },
) {
  const linked = filter.linked === undefined ? [true, false] : [filter.linked];
  if (!filter.ownerId) {
    if (filter.linked === undefined) {
      return await peopleCounts.count(ctx, { bounds: { prefix: [false] } });
    }
    return await peopleCounts.count(ctx, {
      bounds: { prefix: [false, filter.linked] },
    });
  }
  const ownerId = filter.ownerId;
  const counts = await peopleCounts.countBatch(
    ctx,
    linked.map((value) => ({ bounds: { prefix: [false, value, ownerId] } })),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

/**
 * Leads per status. `ownerId: null` means unassigned; leave it out for anyone.
 * One batched read whatever the number of statuses.
 */
export async function countLeads(
  ctx: QueryCtx,
  statuses: readonly LeadStatus[],
  filter: { ownerId?: Id<"members"> | null; kind?: LeadKind },
) {
  const owners: string[] | null =
    filter.ownerId !== undefined
      ? [filter.ownerId ?? ""]
      : filter.kind
        ? ["", ...(await memberIds(ctx))]
        : null;
  const queries: { status: LeadStatus; prefix: string[] }[] = statuses.flatMap(
    (status) =>
      owners === null
        ? [{ status, prefix: [status] }]
        : owners.map((owner) => ({
            status,
            prefix: filter.kind
              ? [status, owner, filter.kind]
              : [status, owner],
          })),
  );
  const counts = await leadCounts.countBatch(
    ctx,
    queries.map((query) => ({
      bounds: { prefix: query.prefix as [string] },
    })),
  );
  const result = Object.fromEntries(
    statuses.map((status) => [status, 0]),
  ) as Record<LeadStatus, number>;
  queries.forEach((query, index) => {
    result[query.status] += counts[index];
  });
  return result;
}
