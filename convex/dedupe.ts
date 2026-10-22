import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  COUNT_CAP,
  groupPairs,
  pairKeys,
  type Pair,
  type Reason,
} from "../lib/domain/dedupe";
import { STAGE_LABEL, personName } from "../lib/domain/labels";
import {
  accountMatches,
  accountSummary,
  isDismissed,
  isMergeable,
  personMatches,
  personSummary,
} from "./lib/dedupeDetect";
import {
  addMoved,
  checkPair,
  finishAccounts,
  finishPeople,
  lockAccounts,
  lockPeople,
  stepAccounts,
  stepPeople,
  total,
  vChoices,
} from "./lib/dedupeMerge";
import { invalid, notFound } from "./lib/errors";
import {
  internalMutation,
  managerMutation,
  managerQuery,
  memberQuery,
} from "./lib/functions";
import { assertCan } from "./lib/permissions";

const vType = v.union(v.literal("accounts"), v.literal("people"));
const vMoved = v.record(v.string(), v.number());

/** Records scanned per call: each looks up its neighbours through indexes. */
const PAGE = 50;
const MAX_GROUPS = 200;

type Label = { id: string; name: string; sub: string | null };

const accountLabel = (account: Doc<"accounts">): Label => {
  const summary = accountSummary(account);
  return {
    id: summary._id,
    name: summary.name,
    sub: summary.domain ?? summary.gstin,
  };
};

async function personLabel(
  ctx: Parameters<typeof personSummary>[0],
  person: Doc<"people">,
): Promise<Label> {
  const summary = await personSummary(ctx, person);
  return {
    id: summary._id,
    name: summary.name,
    sub: summary.email ?? summary.phone ?? summary.accountName,
  };
}

/**
 * One page of likely duplicates. Each record on the page is compared with its
 * neighbours found by index (website, GSTIN's PAN, platform organisation,
 * name search for accounts; email, phone, platform user and the same account
 * for people), so a call reads a bounded amount however large the table is.
 * A pair can come back from two pages; callers merge by pair.
 */
export const candidates = managerQuery({
  args: { type: vType, paginationOpts: v.optional(paginationOptsValidator) },
  handler: async (ctx, { type, paginationOpts }) => {
    const opts = {
      ...paginationOpts,
      cursor: paginationOpts?.cursor ?? null,
      numItems: Math.min(paginationOpts?.numItems ?? PAGE, PAGE),
    };
    const pairs = new Map<string, Pair>();
    const labels = new Map<string, Label>();
    const found = async (
      aId: string,
      bId: string,
      reasons: Reason[],
      describe: () => Promise<[Label, Label]>,
    ) => {
      const key = pairKeys(aId, bId).join("|");
      if (pairs.has(key) || (await isDismissed(ctx, type, aId, bId))) return;
      pairs.set(key, { a: aId, b: bId, reasons });
      const [a, b] = await describe();
      labels.set(a.id, a);
      labels.set(b.id, b);
    };

    let isDone: boolean;
    let continueCursor: string;
    if (type === "accounts") {
      const page = await ctx.db
        .query("accounts")
        .withIndex("list_name", (q) => q.eq("archivedAt", undefined))
        .paginate(opts);
      const anchors = page.page.filter(isMergeable);
      const matches = await Promise.all(
        anchors.map((anchor) => accountMatches(ctx, anchor)),
      );
      for (const [index, anchor] of anchors.entries()) {
        for (const { other, reasons } of matches[index]) {
          await found(anchor._id, other._id, reasons, async () => [
            accountLabel(anchor),
            accountLabel(other),
          ]);
        }
      }
      ({ isDone, continueCursor } = page);
    } else {
      const page = await ctx.db
        .query("people")
        .withIndex("list_name", (q) => q.eq("archivedAt", undefined))
        .paginate(opts);
      const anchors = page.page.filter(isMergeable);
      const matches = await Promise.all(
        anchors.map((anchor) => personMatches(ctx, anchor)),
      );
      for (const [index, anchor] of anchors.entries()) {
        for (const { other, reasons } of matches[index]) {
          await found(anchor._id, other._id, reasons, async () => [
            await personLabel(ctx, anchor),
            await personLabel(ctx, other),
          ]);
        }
      }
      ({ isDone, continueCursor } = page);
    }
    return {
      groups: groupPairs([...pairs.values()]).slice(0, MAX_GROUPS),
      records: [...labels.values()],
      isDone,
      continueCursor,
    };
  },
});

/** The other live records that look like this one, strongest first. */
export const forRecord = memberQuery({
  args: {
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
  },
  handler: async (ctx, { accountId, personId }) => {
    if (accountId) {
      const account = await ctx.db.get(accountId);
      if (!account || !isMergeable(account)) return [];
      const matches = await accountMatches(ctx, account);
      const kept = [];
      for (const { other, reasons } of matches) {
        if (await isDismissed(ctx, "accounts", account._id, other._id)) {
          continue;
        }
        kept.push({ ...accountLabel(other), reasons });
      }
      return kept;
    }
    const person = personId ? await ctx.db.get(personId) : null;
    if (!person || !isMergeable(person)) return [];
    const kept = [];
    for (const { other, reasons } of await personMatches(ctx, person)) {
      if (await isDismissed(ctx, "people", person._id, other._id)) continue;
      kept.push({ ...(await personLabel(ctx, other)), reasons });
    }
    return kept;
  },
});

export const dismiss = managerMutation({
  args: { type: vType, aId: v.string(), bId: v.string() },
  handler: async (ctx, { type, aId, bId }) => {
    const a = ctx.db.normalizeId(type, aId);
    const b = ctx.db.normalizeId(type, bId);
    if (!a || !b || a === b) invalid("bId", "Pick two different records");
    if (await isDismissed(ctx, type, a, b)) return;
    const [aKey, bKey] = pairKeys(a, b);
    await ctx.db.insert("dedupeDismissals", {
      type,
      aKey,
      bKey,
      byId: ctx.viewer._id,
    });
  },
});

async function counted(rows: Promise<unknown[]>) {
  return Math.min((await rows).length, COUNT_CAP);
}

/**
 * Both records side by side for the review: the fields a merge lets you pick
 * between, and how much hangs off each (capped, so a huge record stays cheap).
 */
export const compare = managerQuery({
  args: { type: vType, ids: v.array(v.string()) },
  handler: async (ctx, { type, ids }) => {
    const cap = COUNT_CAP + 1;
    const members = new Map(
      (await ctx.db.query("members").collect()).map((m) => [m._id, m.name]),
    );
    const rows = [];
    for (const raw of ids.slice(0, 2)) {
      const id = ctx.db.normalizeId(type, raw);
      const doc = id ? await ctx.db.get(id) : null;
      if (!doc) notFound(type === "accounts" ? "Account" : "Person");
      const status = doc.mergedIntoId
        ? ("merged" as const)
        : doc.mergingInto
          ? ("merging" as const)
          : null;
      if (type === "accounts") {
        const account = doc as Doc<"accounts">;
        const accountId = account._id;
        const [people, deals, tasks, leads, timeline, files] =
          await Promise.all([
            counted(
              ctx.db
                .query("people")
                .withIndex("by_account", (q) => q.eq("accountId", accountId))
                .take(cap),
            ),
            counted(
              ctx.db
                .query("deals")
                .withIndex("by_account", (q) => q.eq("accountId", accountId))
                .take(cap),
            ),
            counted(
              ctx.db
                .query("tasks")
                .withIndex("by_account", (q) => q.eq("accountId", accountId))
                .take(cap),
            ),
            counted(
              ctx.db
                .query("leads")
                .withIndex("by_account", (q) => q.eq("accountId", accountId))
                .take(cap),
            ),
            counted(
              ctx.db
                .query("timeline")
                .withIndex("by_account", (q) => q.eq("accountId", accountId))
                .take(cap),
            ),
            counted(
              ctx.db
                .query("attachments")
                .withIndex("by_account", (q) => q.eq("accountId", accountId))
                .take(cap),
            ),
          ]);
        rows.push({
          id: account._id,
          name: account.name,
          status,
          link: account.platformOrgId ?? null,
          fields: {
            name: account.name,
            domain: account.domain ?? null,
            gstin: account.gstin ?? null,
            ownerId: members.get(account.ownerId) ?? null,
            stage: STAGE_LABEL[account.stage],
          },
          counts: { people, deals, tasks, leads, timeline, files },
        });
      } else {
        const person = doc as Doc<"people">;
        const personId = person._id;
        const accountId = person.accountId;
        const [tasks, leads, timeline, files, dealRows] = await Promise.all([
          counted(
            ctx.db
              .query("tasks")
              .withIndex("by_person", (q) => q.eq("personId", personId))
              .take(cap),
          ),
          counted(
            ctx.db
              .query("leads")
              .withIndex("by_person", (q) => q.eq("personId", personId))
              .take(cap),
          ),
          counted(
            ctx.db
              .query("timeline")
              .withIndex("by_person", (q) => q.eq("personId", personId))
              .take(cap),
          ),
          counted(
            ctx.db
              .query("attachments")
              .withIndex("by_person", (q) => q.eq("personId", personId))
              .take(cap),
          ),
          accountId
            ? ctx.db
                .query("deals")
                .withIndex("by_account", (q) => q.eq("accountId", accountId))
                .take(cap)
            : [],
        ]);
        const account = accountId ? await ctx.db.get(accountId) : null;
        rows.push({
          id: person._id,
          name: personName(person),
          status,
          link: person.platformUserId ?? null,
          fields: {
            name: personName(person),
            email: person.email ?? null,
            phone: person.phone ?? null,
            title: person.title ?? null,
            accountId: account?.name ?? null,
            ownerId: members.get(person.ownerId) ?? null,
          },
          counts: {
            deals: dealRows.filter((deal) => deal.personIds.includes(personId))
              .length,
            tasks,
            leads,
            timeline,
            files,
          },
        });
      }
    }
    return rows;
  },
});

/**
 * Starts merging `loserId` into `winnerId`: checks, applies the chosen field
 * values and locks both records, then moves everything that points at the
 * loser in `mergeStep` batches. The loser is archived, never deleted.
 */
export const merge = managerMutation({
  args: {
    type: vType,
    winnerId: v.string(),
    loserId: v.string(),
    choices: v.optional(vChoices),
  },
  handler: async (ctx, { type, winnerId, loserId, choices }) => {
    assertCan(ctx.viewer, "record.merge");
    const noun = type === "accounts" ? "account" : "person";
    const w = ctx.db.normalizeId(type, winnerId);
    const l = ctx.db.normalizeId(type, loserId);
    if (!w) invalid("winnerId", `Pick two ${type}`);
    if (!l) invalid("loserId", `Pick two ${type}`);
    if (w === l) invalid("loserId", "Pick two different records");
    let winnerName: string;
    let loserName: string;
    if (type === "accounts") {
      const [winner, loser] = await Promise.all([
        ctx.db.get(w as Id<"accounts">),
        ctx.db.get(l as Id<"accounts">),
      ]);
      if (!winner || !loser) notFound("Account");
      checkPair(winner, loser, noun);
      await lockAccounts(ctx, ctx.viewer._id, winner, loser, choices ?? {});
      winnerName = choices?.name === "loser" ? loser.name : winner.name;
      loserName = loser.name;
    } else {
      const [winner, loser] = await Promise.all([
        ctx.db.get(w as Id<"people">),
        ctx.db.get(l as Id<"people">),
      ]);
      if (!winner || !loser) notFound("Person");
      checkPair(winner, loser, noun);
      await lockPeople(ctx, ctx.viewer._id, winner, loser, choices ?? {});
      winnerName = personName(winner);
      loserName = personName(loser);
    }
    await ctx.scheduler.runAfter(0, internal.dedupe.mergeStep, {
      type,
      winnerId: w,
      loserId: l,
      actorId: ctx.viewer._id,
      moved: {},
    });
    return { winnerName, loserName };
  },
});

/** Restarts a merge whose steps stopped; harmless if one is still running. */
export const resume = managerMutation({
  args: { type: vType, loserId: v.string() },
  handler: async (ctx, { type, loserId }) => {
    const id = ctx.db.normalizeId(type, loserId);
    const loser = id ? await ctx.db.get(id) : null;
    if (!loser) notFound(type === "accounts" ? "Account" : "Person");
    if (!loser.mergingInto) invalid("loserId", "No merge is in progress");
    await ctx.scheduler.runAfter(0, internal.dedupe.mergeStep, {
      type,
      winnerId: loser.mergingInto,
      loserId: loser._id,
      actorId: ctx.viewer._id,
      moved: {},
    });
  },
});

/**
 * Moves one batch, then schedules itself again. It finishes only when a pass
 * finds nothing left to move, in the same transaction that archives the loser,
 * so a row added meanwhile can't be missed. Safe to re-run.
 */
export const mergeStep = internalMutation({
  args: {
    type: vType,
    winnerId: v.string(),
    loserId: v.string(),
    actorId: v.id("members"),
    moved: vMoved,
  },
  handler: async (ctx, { type, winnerId, loserId, actorId, moved }) => {
    const w = ctx.db.normalizeId(type, winnerId);
    const l = ctx.db.normalizeId(type, loserId);
    if (!w || !l) return;
    const [winner, loser] = await Promise.all([ctx.db.get(w), ctx.db.get(l)]);
    if (!winner || !loser || loser.mergingInto !== winner._id) return;
    const step =
      type === "accounts"
        ? await stepAccounts(
            ctx,
            winner as Doc<"accounts">,
            loser as Doc<"accounts">,
          )
        : await stepPeople(
            ctx,
            winner as Doc<"people">,
            loser as Doc<"people">,
          );
    const all = addMoved({ ...moved }, step);
    if (total(step) > 0) {
      await ctx.scheduler.runAfter(0, internal.dedupe.mergeStep, {
        type,
        winnerId,
        loserId,
        actorId,
        moved: all,
      });
      return;
    }
    if (type === "accounts") {
      await finishAccounts(
        ctx,
        actorId,
        winner as Doc<"accounts">,
        loser as Doc<"accounts">,
        all,
      );
    } else {
      await finishPeople(
        ctx,
        actorId,
        winner as Doc<"people">,
        loser as Doc<"people">,
        all,
      );
    }
  },
});
