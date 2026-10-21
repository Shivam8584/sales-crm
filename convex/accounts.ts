import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { LIFECYCLE_STAGES } from "../lib/domain/enums";
import { STAGE_LABEL } from "../lib/domain/labels";
import { checkGstin, panRoot } from "../lib/domain/gstin";
import { cleanTags, normalizeDomain } from "../lib/domain/normalize";
import { sumMoney, type Money } from "../lib/domain/money";
import { accountStall, isOnPlatform } from "./lib/activation";
import { sourceFamily } from "./lib/enrichment";
import { emitAutomationTrigger } from "./lib/automations/engine";
import { fail, invalid } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import { findAccount } from "./lib/identity";
import { assertCanReassign } from "./lib/ownership";
import { assertCan } from "./lib/permissions";
import {
  accountName,
  checkImportSize,
  findMember,
  importFailure,
  memberIndex,
  memberRef,
  requireAccount,
  requireActiveMember,
  type ImportResult,
} from "./lib/records";
import { diff, logChanges, logSystem } from "./lib/timeline";
import { vLifecycleStage } from "./lib/validators";
import { bucketCounts, latestInteraction, windowStart } from "./timeline";

const editable = {
  name: v.optional(v.string()),
  domain: v.optional(v.union(v.string(), v.null())),
  ownerId: v.optional(v.id("members")),
  stage: v.optional(vLifecycleStage),
  tags: v.optional(v.array(v.string())),
  gstin: v.optional(v.union(v.string(), v.null())),
};

type Patch = {
  name?: string;
  domain?: string | null;
  ownerId?: Id<"members">;
  stage?: Doc<"accounts">["stage"];
  tags?: string[];
  gstin?: string | null;
};

const LABELS = {
  name: "Name",
  domain: "Website",
  stage: "Stage",
  tags: "Tags",
  gstin: "GSTIN",
} as const;

async function clean(ctx: MutationCtx, patch: Patch, selfId?: Id<"accounts">) {
  const out: Partial<Doc<"accounts">> = {};
  if (patch.name !== undefined) {
    out.name = accountName(patch.name);
  }
  if (patch.domain !== undefined) {
    if (patch.domain === null || !patch.domain.trim()) {
      out.domain = undefined;
    } else {
      const domain = normalizeDomain(patch.domain);
      if (!domain) invalid("domain", "Enter a website like acme.in");
      const taken = await ctx.db
        .query("accounts")
        .withIndex("by_domain", (q) => q.eq("domain", domain))
        .collect();
      const other = taken.find(
        (item) => item._id !== selfId && !item.archivedAt,
      );
      if (other)
        fail("conflict", `${other.name} already uses ${domain}`, "domain");
      out.domain = domain;
    }
  }
  if (patch.ownerId !== undefined) {
    await requireActiveMember(ctx, patch.ownerId, "ownerId");
    out.ownerId = patch.ownerId;
  }
  if (patch.stage !== undefined) out.stage = patch.stage;
  if (patch.tags !== undefined) out.tags = cleanTags(patch.tags);
  if (patch.gstin !== undefined) {
    if (patch.gstin === null || !patch.gstin.trim()) {
      out.gstin = undefined;
      out.panRoot = undefined;
    } else {
      const check = checkGstin(patch.gstin);
      if (!check.ok) invalid("gstin", "Enter a valid 15-character GSTIN");
      const pan = panRoot(check.gstin);
      const siblings = pan
        ? await ctx.db
            .query("accounts")
            .withIndex("by_pan_root", (q) => q.eq("panRoot", pan))
            .collect()
        : [];
      const other = siblings.find(
        (item) =>
          item._id !== selfId && !item.archivedAt && item.gstin === check.gstin,
      );
      if (other) {
        fail("conflict", `${other.name} already has this GSTIN`, "gstin");
      }
      out.gstin = check.gstin;
      out.panRoot = panRoot(check.gstin) ?? undefined;
    }
  }
  return out;
}

function snapshot(account: Doc<"accounts">): Patch {
  return {
    name: account.name,
    domain: account.domain ?? null,
    ownerId: account.ownerId,
    stage: account.stage,
    tags: account.tags,
    gstin: account.gstin ?? null,
  };
}

function toRow(
  account: Doc<"accounts">,
  members: Awaited<ReturnType<typeof memberIndex>>,
  peopleCount: number,
) {
  return {
    _id: account._id,
    _creationTime: account._creationTime,
    name: account.name,
    domain: account.domain ?? null,
    logoUrl: account.logoUrl ?? null,
    stage: account.stage,
    tags: account.tags,
    gstin: account.gstin ?? null,
    linked: Boolean(account.platformOrgId),
    owner: memberRef(members, account.ownerId),
    peopleCount,
    lastActivityAt: account.lastActivityAt ?? null,
    archivedAt: account.archivedAt ?? null,
  };
}

async function countPeople(ctx: QueryCtx, accountId: Id<"accounts">) {
  const people = await ctx.db
    .query("people")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  return people.filter((person) => !person.archivedAt).length;
}

/** Every account, recently updated first; the list page sorts and filters it in the browser. */
export const list = memberQuery({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    const [accounts, members] = await Promise.all([
      ctx.db.query("accounts").withIndex("by_updated").order("desc").collect(),
      memberIndex(ctx),
    ]);
    const visible = accounts.filter(
      (account) => includeArchived || !account.archivedAt,
    );
    return await Promise.all(
      visible.map(async (account) =>
        toRow(account, members, await countPeople(ctx, account._id)),
      ),
    );
  },
});

/** Cursor-paginated accounts, recently updated first, optionally one owner's or one stage's. */
export const page = memberQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    ownerId: v.optional(v.id("members")),
    stage: v.optional(vLifecycleStage),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { ownerId, stage } = args;
    const base = ownerId
      ? ctx.db
          .query("accounts")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      : stage
        ? ctx.db
            .query("accounts")
            .withIndex("by_stage", (q) => q.eq("stage", stage))
        : ctx.db.query("accounts").withIndex("by_updated");
    const result = await base
      .filter((q) =>
        q.and(
          args.includeArchived ? true : q.eq(q.field("archivedAt"), undefined),
          ownerId && stage ? q.eq(q.field("stage"), stage) : true,
        ),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const members = await memberIndex(ctx);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (account) =>
          toRow(account, members, await countPeople(ctx, account._id)),
        ),
      ),
    };
  },
});

const TREND_DAYS = 14;

/**
 * Per-account rollups for the list: open deals and pipeline per currency,
 * GSTIN verification, timeline entries per day for the last two weeks, the
 * latest logged interaction and whether onboarding is stuck. Kept apart from
 * `list` so deal, fact and timeline churn doesn't re-run the main list query.
 */
export const listStats = memberQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const since = windowStart(TREND_DAYS, now);
    const [accounts, deals] = await Promise.all([
      ctx.db.query("accounts").collect(),
      ctx.db.query("deals").collect(),
    ]);
    const open = new Map<Id<"accounts">, Money[]>();
    for (const deal of deals) {
      if (deal.stage === "won" || deal.stage === "lost") continue;
      open.set(deal.accountId, [
        ...(open.get(deal.accountId) ?? []),
        deal.amount,
      ]);
    }
    return await Promise.all(
      accounts.map(async (account) => {
        const amounts = open.get(account._id) ?? [];
        const recent = await ctx.db
          .query("timeline")
          .withIndex("by_account", (q) =>
            q.eq("accountId", account._id).gte("occurredAt", since),
          )
          .collect();
        const lastInteraction = await latestInteraction(ctx, {
          accountId: account._id,
        });
        const gstin = account.gstin;
        let gstVerified = false;
        if (gstin && !account.archivedAt) {
          const facts = await ctx.db
            .query("facts")
            .withIndex("by_account", (q) => q.eq("accountId", account._id))
            .collect();
          gstVerified = facts.some(
            (fact) =>
              fact.field === "gstin" &&
              fact.value === gstin &&
              (fact.status === "applied" || fact.status === "accepted") &&
              sourceFamily(fact.source) === "gst",
          );
        }
        return {
          accountId: account._id,
          openDeals: amounts.length,
          pipeline: sumMoney(amounts),
          gstVerified,
          onPlatform: isOnPlatform(account),
          stuck: Boolean(await accountStall(ctx, account, now)),
          trend: bucketCounts(
            recent.map((entry) => entry.occurredAt),
            TREND_DAYS,
            now,
          ),
          lastInteraction,
        };
      }),
    );
  },
});

/** Takes a raw string because the id comes from the URL and may be stale or mistyped. */
export const get = memberQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("accounts", args.id);
    const account = id ? await ctx.db.get(id) : null;
    if (!account) return null;
    const members = await memberIndex(ctx);
    const owner = members.get(account.ownerId);
    return {
      ...account,
      domain: account.domain ?? null,
      gstin: account.gstin ?? null,
      owner: owner
        ? { _id: owner._id, name: owner.name, email: owner.email }
        : null,
    };
  },
});

async function insertAccount(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  fields: Partial<Doc<"accounts">>,
  subject: string,
) {
  const now = Date.now();
  const id = await ctx.db.insert("accounts", {
    name: fields.name!,
    domain: fields.domain,
    ownerId: fields.ownerId!,
    stage: fields.stage!,
    tags: fields.tags ?? [],
    gstin: fields.gstin,
    panRoot: fields.panRoot,
    updatedAt: now,
    lastActivityAt: now,
  });
  await logSystem(ctx, { accountId: id }, subject, undefined, ctx.viewer._id);
  return id;
}

export const create = memberMutation({
  args: {
    name: v.string(),
    domain: v.optional(v.string()),
    ownerId: v.optional(v.id("members")),
    stage: v.optional(vLifecycleStage),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const fields = await clean(ctx, {
      ...args,
      ownerId: args.ownerId ?? ctx.viewer._id,
      stage: args.stage ?? "prospect",
      tags: args.tags ?? [],
    });
    return await insertAccount(ctx, fields, "created the account");
  },
});

const vImportRow = v.object({
  name: v.string(),
  domain: v.optional(v.string()),
  stage: v.optional(v.string()),
  owner: v.optional(v.string()),
  tags: v.optional(v.string()),
  gstin: v.optional(v.string()),
});

function parseStage(value: string | undefined) {
  const text = value?.trim().toLowerCase();
  if (!text) return "prospect" as const;
  const stage = LIFECYCLE_STAGES.find(
    (item) =>
      item === text.replace(/\s+/g, "_") ||
      STAGE_LABEL[item].toLowerCase() === text,
  );
  if (!stage) invalid("stage", `Unknown stage “${value!.trim()}”`);
  return stage;
}

/**
 * Validates every row with the same rules as `create`. With `dryRun` nothing
 * is written, so the client can preview errors and duplicates first.
 */
export const importRows = memberMutation({
  args: { rows: v.array(vImportRow), dryRun: v.boolean() },
  handler: async (ctx, { rows, dryRun }) => {
    checkImportSize(rows.length);
    const [accounts, members] = await Promise.all([
      ctx.db.query("accounts").collect(),
      ctx.db.query("members").collect(),
    ]);
    const names = new Map(
      accounts
        .filter((account) => !account.archivedAt)
        .map((account) => [account.name.toLowerCase(), account.name]),
    );
    const domains = new Set<string>();
    const pans = new Set<string>();
    const results: ImportResult[] = [];
    for (const [row, input] of rows.entries()) {
      try {
        const fields = await clean(ctx, {
          name: input.name,
          domain: input.domain,
          gstin: input.gstin,
          stage: parseStage(input.stage),
          ownerId: input.owner?.trim()
            ? findMember(members, input.owner)._id
            : ctx.viewer._id,
          tags: (input.tags ?? "").split(/[,;|]/),
        });
        const key = fields.name!.toLowerCase();
        const existing =
          names.get(key) ??
          (
            await findAccount(ctx, {
              gstin: fields.gstin,
              domain: fields.domain,
            })
          )?.name;
        if (existing) {
          results.push({
            row,
            status: "duplicate",
            message: `${existing} already exists`,
          });
          continue;
        }
        if (fields.domain && domains.has(fields.domain)) {
          results.push({
            row,
            status: "duplicate",
            message: `${fields.domain} appears earlier in the file`,
          });
          continue;
        }
        if (fields.panRoot && pans.has(fields.panRoot)) {
          results.push({
            row,
            status: "duplicate",
            message: "The same business (PAN) appears earlier in the file",
          });
          continue;
        }
        names.set(key, fields.name!);
        if (fields.domain) domains.add(fields.domain);
        if (fields.panRoot) pans.add(fields.panRoot);
        if (dryRun) {
          results.push({ row, status: "ready" });
        } else {
          const id = await insertAccount(ctx, fields, "imported the account");
          results.push({ row, status: "created", id });
        }
      } catch (error) {
        results.push(importFailure(row, error));
      }
    }
    return results;
  },
});

/** Returns the previous values so the client can offer undo. */
export const update = memberMutation({
  args: { id: v.id("accounts"), patch: v.object(editable) },
  handler: async (ctx, { id, patch }) => {
    const account = await requireAccount(ctx, id);
    if (patch.ownerId !== undefined && patch.ownerId !== account.ownerId) {
      await assertCanReassign(
        ctx,
        ctx.viewer,
        "account.reassign",
        [account.ownerId],
        {
          accountId: account._id,
        },
      );
    }
    const fields = await clean(ctx, patch, id);
    const before = snapshot(account);
    const changes = diff(
      { ...account, stage: STAGE_LABEL[account.stage] },
      {
        ...fields,
        ...(fields.stage ? { stage: STAGE_LABEL[fields.stage] } : {}),
      },
      LABELS,
    );
    if (fields.ownerId && fields.ownerId !== account.ownerId) {
      const [from, to] = await Promise.all([
        ctx.db.get(account.ownerId),
        ctx.db.get(fields.ownerId),
      ]);
      changes.push({ field: "Owner", from: from?.name, to: to?.name });
    }
    if (changes.length === 0) return before;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
    await logChanges(ctx, { accountId: id }, ctx.viewer._id, changes);
    if (fields.stage && fields.stage !== account.stage) {
      await emitAutomationTrigger(ctx, {
        kind: "account_stage_changed",
        refs: { accountId: id },
        value: fields.stage,
      });
    }
    return before;
  },
});

export const setArchived = memberMutation({
  args: { ids: v.array(v.id("accounts")), archived: v.boolean() },
  handler: async (ctx, { ids, archived }) => {
    const now = Date.now();
    for (const id of ids) {
      const account = await requireAccount(ctx, id);
      if (Boolean(account.archivedAt) === archived) continue;
      assertCan(ctx.viewer, "account.archive", [account.ownerId]);
      const twin = archived
        ? null
        : await findAccount(
            ctx,
            { domain: account.domain, gstin: account.gstin },
            { exclude: account._id },
          );
      if (
        twin &&
        ((account.domain && twin.domain === account.domain) ||
          (account.gstin && twin.gstin === account.gstin))
      ) {
        fail("conflict", `${twin.name} now uses the same website or GSTIN`);
      }
      await ctx.db.patch(id, {
        archivedAt: archived ? now : undefined,
        updatedAt: now,
      });
      await logSystem(
        ctx,
        { accountId: id },
        archived ? "archived the account" : "restored the account",
        undefined,
        ctx.viewer._id,
      );
    }
  },
});

export const setOwner = memberMutation({
  args: { ids: v.array(v.id("accounts")), ownerId: v.id("members") },
  handler: async (ctx, { ids, ownerId }) => {
    const owner = await requireActiveMember(ctx, ownerId, "ownerId");
    const previous: { id: Id<"accounts">; ownerId: Id<"members"> }[] = [];
    const now = Date.now();
    for (const id of ids) {
      const account = await requireAccount(ctx, id);
      if (account.ownerId === ownerId) continue;
      await assertCanReassign(
        ctx,
        ctx.viewer,
        "account.reassign",
        [account.ownerId],
        {
          accountId: account._id,
        },
      );
      const from = await ctx.db.get(account.ownerId);
      previous.push({ id, ownerId: account.ownerId });
      await ctx.db.patch(id, { ownerId, updatedAt: now });
      await logChanges(ctx, { accountId: id }, ctx.viewer._id, [
        { field: "Owner", from: from?.name, to: owner.name },
      ]);
    }
    return previous;
  },
});
