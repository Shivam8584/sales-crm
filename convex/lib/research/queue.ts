import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  movedOn,
  parseSignature,
  type ResearchReason,
} from "../../../lib/domain/research";
import { KEYS, read, researchConfig, write } from "./config";

export type Subject =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> };

const DAY = 24 * 60 * 60_000;
const SCAN = 25;

export function taskFor(ctx: QueryCtx, subject: Subject) {
  const tasks = ctx.db.query("researchTasks");
  return "accountId" in subject
    ? tasks
        .withIndex("by_account", (q) => q.eq("accountId", subject.accountId))
        .first()
    : tasks
        .withIndex("by_person", (q) => q.eq("personId", subject.personId))
        .first();
}

/** Records the agent never touches: archived, merged away, mid-merge or erased. */
export function researchable(
  record: Doc<"accounts"> | Doc<"people"> | null,
): record is Doc<"accounts"> | Doc<"people"> {
  return Boolean(
    record &&
    !record.archivedAt &&
    !record.mergedIntoId &&
    !record.mergingInto &&
    !("erasedAt" in record && record.erasedAt),
  );
}

/** Adds the record to the queue, or pulls its next check forward; never pushes one back. */
export async function enqueue(
  ctx: MutationCtx,
  subject: Subject,
  reason: ResearchReason,
  dueAt: number,
  rank = reason === "stale" || reason === "recheck" ? 1 : 0,
) {
  const row = await taskFor(ctx, subject);
  if (!row) {
    return await ctx.db.insert("researchTasks", {
      ...subject,
      reason,
      rank,
      dueAt,
      attempts: 0,
    });
  }
  if (dueAt < row.dueAt || rank < row.rank) {
    await ctx.db.patch(row._id, {
      reason,
      rank: Math.min(rank, row.rank),
      dueAt: Math.min(dueAt, row.dueAt),
    });
  }
  return row._id;
}

/** Queues records created since the last pass, oldest first; the first pass walks the existing ones. */
export async function discover(ctx: MutationCtx, now: number) {
  const recent = now - 2 * DAY;
  const reasonFor = (at: number) => (at > recent ? "new" : "stale");

  const accountAt = Number((await read(ctx, KEYS.accountCursor)) ?? 0);
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_creation_time", (q) => q.gt("_creationTime", accountAt))
    .take(SCAN);
  for (const account of accounts) {
    if (!researchable(account)) continue;
    await enqueue(
      ctx,
      { accountId: account._id },
      reasonFor(account._creationTime),
      now,
    );
  }
  if (accounts.length) {
    await write(
      ctx,
      KEYS.accountCursor,
      String(accounts.at(-1)!._creationTime),
    );
  }

  const personAt = Number((await read(ctx, KEYS.personCursor)) ?? 0);
  const people = await ctx.db
    .query("people")
    .withIndex("by_creation_time", (q) => q.gt("_creationTime", personAt))
    .take(SCAN);
  for (const person of people) {
    if (!researchable(person)) continue;
    await enqueue(
      ctx,
      { personId: person._id },
      reasonFor(person._creationTime),
      now,
    );
  }
  if (people.length) {
    await write(ctx, KEYS.personCursor, String(people.at(-1)!._creationTime));
  }
}

/**
 * Leases up to `limit` due rows, urgent ones first. A row whose lease ran
 * out was abandoned mid-run; after too many of those it waits for its
 * routine check instead of being retried for ever.
 */
export async function lease(
  ctx: MutationCtx,
  now: number,
  limit: number,
  staleDays: number,
) {
  const leased: Doc<"researchTasks">[] = [];
  for (const rank of [0, 1]) {
    const due = await ctx.db
      .query("researchTasks")
      .withIndex("by_rank_due", (q) => q.eq("rank", rank).lte("dueAt", now))
      .take(limit * 3);
    for (const row of due) {
      if (leased.length >= limit) return leased;
      if (row.leaseUntil && row.leaseUntil > now) continue;
      const attempts = row.leaseUntil ? row.attempts + 1 : row.attempts;
      if (attempts >= MAX_ATTEMPTS) {
        await ctx.db.patch(row._id, {
          attempts: 0,
          leaseUntil: undefined,
          dueAt: now + staleDays * DAY,
          rank: 1,
          note: "checks kept failing",
        });
        continue;
      }
      await ctx.db.patch(row._id, { attempts, leaseUntil: now + LEASE_MS });
      leased.push({ ...row, attempts, leaseUntil: now + LEASE_MS });
    }
  }
  return leased;
}

/** A reply just arrived: look at the sender again soon, sooner if it hints they moved on. */
export async function onReply(
  ctx: MutationCtx,
  personId: Id<"people">,
  text: string,
) {
  if (!(await researchConfig(ctx)).enabled) return;
  const person = await ctx.db.get(personId);
  if (!researchable(person)) return;
  const hint = Boolean(movedOn(text));
  if (!hint && !parseSignature(text)) return;
  await enqueue(
    ctx,
    { personId },
    hint ? "job_change" : "recheck",
    Date.now(),
    0,
  );
}
