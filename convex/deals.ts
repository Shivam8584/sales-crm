import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { DealStage } from "../lib/domain/enums";
import { DEAL_STAGE_LABEL, personName } from "../lib/domain/labels";
import { DEFAULT_CURRENCY, formatMoney } from "../lib/domain/money";
import { cleanText, isValidDay } from "../lib/domain/normalize";
import { invalid, notFound } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import schema from "./schema";
import { assertMoney } from "./lib/money";
import { checkLineCount } from "./lib/pricing";
import {
  memberIndex,
  memberRef,
  requireAccount,
  requireActiveMember,
} from "./lib/records";
import { logChanges, logSystem } from "./lib/timeline";
import { vDay, vDealStage, vMoney } from "./lib/validators";

const MAX_TITLE = 120;
const MAX_REASON = 280;
const MAX_PEOPLE = 20;

type Patch = {
  title?: string;
  accountId?: Id<"accounts">;
  stage?: DealStage;
  amount?: Doc<"deals">["amount"];
  ownerId?: Id<"members">;
  closeDate?: string | null;
  personIds?: Id<"people">[];
  lostReason?: string | null;
};

const editable = {
  title: v.optional(v.string()),
  accountId: v.optional(v.id("accounts")),
  stage: v.optional(vDealStage),
  amount: v.optional(vMoney),
  ownerId: v.optional(v.id("members")),
  closeDate: v.optional(v.union(vDay, v.null())),
  personIds: v.optional(v.array(v.id("people"))),
  lostReason: v.optional(v.union(v.string(), v.null())),
};

const isClosed = (stage: DealStage) => stage === "won" || stage === "lost";

function cleanTitle(input: string) {
  const title = cleanText(input);
  if (!title) invalid("title", "Enter a title for the deal");
  if (title.length > MAX_TITLE) invalid("title", "Keep the title shorter");
  return title;
}

function cleanReason(input: string | null | undefined) {
  const reason = cleanText(input);
  if (reason && reason.length > MAX_REASON) {
    invalid("lostReason", "Keep the reason shorter");
  }
  return reason;
}

function cleanCloseDate(input: string | null) {
  if (input === null || !input.trim()) return undefined;
  if (!isValidDay(input)) invalid("closeDate", "Pick a valid date");
  return input;
}

async function cleanPeople(
  ctx: QueryCtx,
  ids: Id<"people">[],
  accountId: Id<"accounts">,
) {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_PEOPLE) {
    invalid("personIds", `A deal can have up to ${MAX_PEOPLE} contacts`);
  }
  for (const id of unique) {
    const person = await ctx.db.get(id);
    if (!person || person.accountId !== accountId) {
      invalid("personIds", "Contacts must work at the deal's account");
    }
  }
  return unique;
}

async function endOfStage(ctx: QueryCtx, stage: DealStage) {
  const last = await ctx.db
    .query("deals")
    .withIndex("by_stage_position", (q) => q.eq("stage", stage))
    .order("desc")
    .first();
  return last ? last.position + 1 : 0;
}

async function startOfStage(ctx: QueryCtx, stage: DealStage) {
  const first = await ctx.db
    .query("deals")
    .withIndex("by_stage_position", (q) => q.eq("stage", stage))
    .first();
  return first ? first.position - 1 : 0;
}

function snapshot(deal: Doc<"deals">): Required<Patch> {
  return {
    title: deal.title,
    accountId: deal.accountId,
    stage: deal.stage,
    amount: deal.amount,
    ownerId: deal.ownerId,
    closeDate: deal.closeDate ?? null,
    personIds: deal.personIds,
    lostReason: deal.lostReason ?? null,
  };
}

/** Writes the "moved / won / lost" timeline entry for a stage change. */
async function logStage(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  deal: Pick<Doc<"deals">, "_id" | "accountId" | "title">,
  stage: DealStage,
  lostReason?: string,
) {
  const subject =
    stage === "won"
      ? `won the deal ${deal.title}`
      : stage === "lost"
        ? `lost the deal ${deal.title}`
        : `moved the deal ${deal.title} to ${DEAL_STAGE_LABEL[stage]}`;
  await logSystem(
    ctx,
    { accountId: deal.accountId, dealId: deal._id },
    subject,
    stage === "lost" ? lostReason : undefined,
    ctx.viewer._id,
  );
}

/** Fields that follow from a stage change: close time and lost reason. */
function stageEffects(
  deal: Doc<"deals">,
  stage: DealStage,
  lostReason: string | undefined,
) {
  if (stage === "lost" && !lostReason) {
    invalid("lostReason", "Say why the deal was lost");
  }
  return {
    stage,
    closedAt: isClosed(stage)
      ? deal.stage === stage
        ? deal.closedAt
        : Date.now()
      : undefined,
    lostReason: stage === "lost" ? lostReason : undefined,
  };
}

async function toClient(
  ctx: QueryCtx,
  deals: Doc<"deals">[],
  members: Awaited<ReturnType<typeof memberIndex>>,
) {
  const accounts = new Map<Id<"accounts">, Doc<"accounts"> | null>();
  for (const deal of deals) {
    if (!accounts.has(deal.accountId)) {
      accounts.set(deal.accountId, await ctx.db.get(deal.accountId));
    }
  }
  return deals.map((deal) => {
    const account = accounts.get(deal.accountId);
    return {
      _id: deal._id,
      _creationTime: deal._creationTime,
      title: deal.title,
      stage: deal.stage,
      amount: deal.amount,
      position: deal.position,
      closeDate: deal.closeDate ?? null,
      closedAt: deal.closedAt ?? null,
      lostReason: deal.lostReason ?? null,
      personIds: deal.personIds,
      ownerId: deal.ownerId,
      owner: memberRef(members, deal.ownerId),
      accountId: deal.accountId,
      account: account
        ? {
            _id: account._id,
            name: account.name,
            domain: account.domain ?? null,
            logoUrl: account.logoUrl ?? null,
          }
        : null,
      updatedAt: deal.updatedAt,
    };
  });
}

/** Deals in board order; pass `accountId` for one account's deals. */
export const list = memberQuery({
  args: { accountId: v.optional(v.id("accounts")) },
  handler: async (ctx, { accountId }) => {
    const [deals, members] = await Promise.all([
      accountId
        ? ctx.db
            .query("deals")
            .withIndex("by_account", (q) => q.eq("accountId", accountId))
            .collect()
        : ctx.db.query("deals").collect(),
      memberIndex(ctx),
    ]);
    deals.sort((a, b) => a.position - b.position);
    return await toClient(ctx, deals, members);
  },
});

/** Takes a raw string because the id comes from the URL and may be stale or mistyped. */
export const get = memberQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("deals", args.id);
    const deal = id ? await ctx.db.get(id) : null;
    if (!deal) return null;
    const [row] = await toClient(ctx, [deal], await memberIndex(ctx));
    return row;
  },
});

export const create = memberMutation({
  args: {
    title: v.string(),
    accountId: v.id("accounts"),
    stage: v.optional(vDealStage),
    amount: v.optional(vMoney),
    ownerId: v.optional(v.id("members")),
    closeDate: v.optional(vDay),
    personIds: v.optional(v.array(v.id("people"))),
    lostReason: v.optional(v.string()),
    /** Quick-add from the board puts the new card first in its column. */
    atTop: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const title = cleanTitle(args.title);
    const account = await requireAccount(ctx, args.accountId);
    const stage = args.stage ?? "discovery";
    const amount = assertMoney(
      args.amount ?? { amount: 0, currency: DEFAULT_CURRENCY },
      "amount",
    );
    const ownerId = args.ownerId ?? ctx.viewer._id;
    await requireActiveMember(ctx, ownerId, "ownerId");
    const lostReason = cleanReason(args.lostReason);
    if (stage === "lost" && !lostReason) {
      invalid("lostReason", "Say why the deal was lost");
    }
    const now = Date.now();
    const id = await ctx.db.insert("deals", {
      accountId: account._id,
      title,
      stage,
      amount,
      ownerId,
      closeDate: cleanCloseDate(args.closeDate ?? null),
      personIds: await cleanPeople(ctx, args.personIds ?? [], account._id),
      position: args.atTop
        ? await startOfStage(ctx, stage)
        : await endOfStage(ctx, stage),
      lostReason: stage === "lost" ? lostReason : undefined,
      closedAt: isClosed(stage) ? now : undefined,
      updatedAt: now,
    });
    await logSystem(
      ctx,
      { accountId: account._id, dealId: id },
      `created the deal ${title}`,
      undefined,
      ctx.viewer._id,
    );
    return id;
  },
});

/** Returns the previous values so the client can offer undo. */
export const update = memberMutation({
  args: { id: v.id("deals"), patch: v.object(editable) },
  handler: async (ctx, { id, patch }) => {
    const deal = await ctx.db.get(id);
    if (!deal) notFound("Deal");
    const before = snapshot(deal);
    const next: Partial<Doc<"deals">> = {};
    const changes: { field: string; from?: string; to?: string }[] = [];

    if (patch.title !== undefined) {
      const title = cleanTitle(patch.title);
      if (title !== deal.title) {
        next.title = title;
        changes.push({ field: "Deal title", from: deal.title, to: title });
      }
    }

    const accountId = patch.accountId ?? deal.accountId;
    let movedFrom: Doc<"accounts"> | null = null;
    if (accountId !== deal.accountId) {
      await requireAccount(ctx, accountId);
      next.accountId = accountId;
      movedFrom = await ctx.db.get(deal.accountId);
    }

    if (patch.amount !== undefined) {
      const amount = assertMoney(patch.amount, "amount");
      if (
        amount.amount !== deal.amount.amount ||
        amount.currency !== deal.amount.currency
      ) {
        next.amount = amount;
        changes.push({
          field: "Amount",
          from: formatMoney(deal.amount),
          to: formatMoney(amount),
        });
      }
    }

    if (patch.ownerId !== undefined && patch.ownerId !== deal.ownerId) {
      const owner = await requireActiveMember(ctx, patch.ownerId, "ownerId");
      const from = await ctx.db.get(deal.ownerId);
      next.ownerId = patch.ownerId;
      changes.push({ field: "Owner", from: from?.name, to: owner.name });
    }

    if (patch.closeDate !== undefined) {
      const closeDate = cleanCloseDate(patch.closeDate);
      if (closeDate !== deal.closeDate) {
        next.closeDate = closeDate;
        changes.push({
          field: "Close date",
          from: deal.closeDate,
          to: closeDate,
        });
      }
    }

    const ids =
      patch.personIds !== undefined
        ? await cleanPeople(ctx, patch.personIds, accountId)
        : next.accountId
          ? await keepPeopleAt(ctx, deal.personIds, accountId)
          : undefined;
    if (ids) {
      const same =
        ids.length === deal.personIds.length &&
        ids.every((personId) => deal.personIds.includes(personId));
      if (!same) {
        next.personIds = ids;
        changes.push({
          field: "Contacts",
          from: await peopleNames(ctx, deal.personIds),
          to: await peopleNames(ctx, ids),
        });
      }
    }

    const stage = patch.stage ?? deal.stage;
    const reason =
      patch.lostReason !== undefined
        ? cleanReason(patch.lostReason)
        : deal.lostReason;
    const stageChanged = stage !== deal.stage;
    if (stageChanged || stage === "lost") {
      const effects = stageEffects(deal, stage, reason);
      Object.assign(next, effects);
      if (stageChanged) next.position = await endOfStage(ctx, stage);
      else if (effects.lostReason !== deal.lostReason) {
        changes.push({
          field: "Lost reason",
          from: deal.lostReason,
          to: effects.lostReason,
        });
      }
    }

    if (Object.keys(next).length === 0) return before;
    await ctx.db.patch(id, { ...next, updatedAt: Date.now() });

    const title = next.title ?? deal.title;
    if (next.accountId) {
      const to = await ctx.db.get(accountId);
      await logSystem(
        ctx,
        { accountId: deal.accountId, dealId: id },
        `moved the deal ${title} to ${to?.name ?? "another account"}`,
        undefined,
        ctx.viewer._id,
      );
      await logSystem(
        ctx,
        { accountId, dealId: id },
        `moved the deal ${title} here from ${movedFrom?.name ?? "another account"}`,
        undefined,
        ctx.viewer._id,
      );
    }
    await logChanges(ctx, { accountId, dealId: id }, ctx.viewer._id, changes);
    if (stageChanged) {
      await logStage(ctx, { _id: id, accountId, title }, stage, reason);
    }
    return before;
  },
});

async function keepPeopleAt(
  ctx: QueryCtx,
  ids: Id<"people">[],
  accountId: Id<"accounts">,
) {
  const kept: Id<"people">[] = [];
  for (const id of ids) {
    const person = await ctx.db.get(id);
    if (person?.accountId === accountId) kept.push(id);
  }
  return kept;
}

async function peopleNames(ctx: QueryCtx, ids: Id<"people">[]) {
  const names: string[] = [];
  for (const id of ids) {
    const person = await ctx.db.get(id);
    if (person) names.push(personName(person));
  }
  return names.join(", ") || undefined;
}

/** Board drag: new stage and position. Returns the previous placement for undo. */
export const move = memberMutation({
  args: {
    id: v.id("deals"),
    stage: vDealStage,
    position: v.number(),
    lostReason: v.optional(v.string()),
  },
  handler: async (ctx, { id, stage, position, lostReason }) => {
    const deal = await ctx.db.get(id);
    if (!deal) notFound("Deal");
    if (!Number.isFinite(position)) invalid("position", "Invalid position");
    const previous = {
      stage: deal.stage,
      position: deal.position,
      lostReason: deal.lostReason,
    };
    if (stage === deal.stage) {
      await ctx.db.patch(id, { position, updatedAt: Date.now() });
      return previous;
    }
    const reason = cleanReason(lostReason) ?? deal.lostReason;
    await ctx.db.patch(id, {
      ...stageEffects(deal, stage, reason),
      position,
      updatedAt: Date.now(),
    });
    await logStage(ctx, deal, stage, reason);
    return previous;
  },
});

const vStoredProposal = schema.tables.proposals.validator.omit("dealId");

/**
 * Deletes immediately with the deal's proposals, and unlinks its tasks; the
 * client keeps the returned copy to offer undo. Timeline entries keep the old
 * deal id so the account's history still reads right, and `restore` re-points them.
 */
export const remove = memberMutation({
  args: { id: v.id("deals") },
  handler: async (ctx, { id }) => {
    const deal = await ctx.db.get(id);
    if (!deal) notFound("Deal");
    const proposals = [];
    for (const proposal of await ctx.db
      .query("proposals")
      .withIndex("by_deal", (q) => q.eq("dealId", id))
      .collect()) {
      const { _id, _creationTime, dealId, ...stored } = proposal;
      void _creationTime;
      void dealId;
      await ctx.db.delete(_id);
      proposals.push(stored);
    }
    const taskIds: Id<"tasks">[] = [];
    for (const task of await ctx.db
      .query("tasks")
      .withIndex("by_deal", (q) => q.eq("dealId", id))
      .collect()) {
      await ctx.db.patch(task._id, { dealId: undefined });
      taskIds.push(task._id);
    }
    await ctx.db.delete(id);
    await logSystem(
      ctx,
      { accountId: deal.accountId },
      `deleted the deal ${deal.title}`,
      undefined,
      ctx.viewer._id,
    );
    const { _id, _creationTime, ...fields } = deal;
    void _creationTime;
    return { previousId: _id, deal: fields, proposals, taskIds };
  },
});

export const restore = memberMutation({
  args: {
    previousId: v.id("deals"),
    deal: v.object({
      accountId: v.id("accounts"),
      title: v.string(),
      stage: vDealStage,
      amount: vMoney,
      ownerId: v.id("members"),
      closeDate: v.optional(vDay),
      personIds: v.array(v.id("people")),
      position: v.number(),
      lostReason: v.optional(v.string()),
      closedAt: v.optional(v.number()),
      updatedAt: v.number(),
    }),
    proposals: v.optional(v.array(vStoredProposal)),
    taskIds: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, { previousId, deal, proposals = [], taskIds = [] }) => {
    const account = await requireAccount(ctx, deal.accountId);
    const owner = await ctx.db.get(deal.ownerId);
    const id = await ctx.db.insert("deals", {
      ...deal,
      title: cleanTitle(deal.title),
      amount: assertMoney(deal.amount, "amount"),
      ownerId: owner ? deal.ownerId : ctx.viewer._id,
      closeDate: cleanCloseDate(deal.closeDate ?? null),
      personIds: await keepPeopleAt(ctx, deal.personIds, account._id),
      updatedAt: Date.now(),
    });
    // Ids are never reused, so re-point history, tasks and proposals at the new document.
    const entries = await ctx.db
      .query("timeline")
      .withIndex("by_deal", (q) => q.eq("dealId", previousId))
      .collect();
    for (const entry of entries) await ctx.db.patch(entry._id, { dealId: id });
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_deal", (q) => q.eq("dealId", previousId))
      .collect();
    for (const task of tasks) await ctx.db.patch(task._id, { dealId: id });
    for (const taskId of taskIds) {
      const task = await ctx.db.get(taskId);
      if (task && !task.dealId) await ctx.db.patch(taskId, { dealId: id });
    }
    const versions = new Set<number>();
    for (const proposal of proposals) {
      if (versions.has(proposal.version)) continue;
      versions.add(proposal.version);
      checkLineCount(proposal.lines.length);
      await ctx.db.insert("proposals", { ...proposal, dealId: id });
    }
    await logSystem(
      ctx,
      { accountId: account._id, dealId: id },
      `restored the deal ${deal.title}`,
      undefined,
      ctx.viewer._id,
    );
    return id;
  },
});
