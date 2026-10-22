import { v, type ObjectType } from "convex/values";
import {
  paginationOptsValidator,
  type FilterBuilder,
  type NamedTableInfo,
} from "convex/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { LIFECYCLE_STAGES } from "../lib/domain/enums";
import { STAGE_LABEL } from "../lib/domain/labels";
import { checkGstin, panRoot } from "../lib/domain/gstin";
import { logoProblem } from "../lib/domain/logo";
import { cleanTags, normalizeDomain } from "../lib/domain/normalize";
import { accountHealth } from "../lib/domain/health";
import { sumMoney } from "../lib/domain/money";
import { accountStall, isOnPlatform } from "./lib/activation";
import { sourceFamily } from "./lib/enrichment/kyc";
import { emitAutomationTrigger } from "./lib/automations/engine";
import { countAccounts } from "./lib/counts";
import { visibleCustom } from "./customFields";
import { fail, invalid, notFound } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import { findAccount } from "./lib/identity";
import {
  activityBounds,
  mapPage,
  searchText,
  vActivity,
  vDir,
  vSearch,
} from "./lib/lists";
import { assertCanReassign } from "./lib/ownership";
import { assertCan } from "./lib/permissions";
import { healthInput, latestSnapshot, stateEvents } from "./lib/platform";
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
import { literals, vLifecycleStage } from "./lib/validators";
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

const TREND_DAYS = 14;

async function accountStats(
  ctx: QueryCtx,
  account: Doc<"accounts">,
  now: number,
  activity: boolean,
) {
  const [deals, recent, lastInteraction, stall] = await Promise.all([
    ctx.db
      .query("deals")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .collect(),
    activity
      ? ctx.db
          .query("timeline")
          .withIndex("by_account", (q) =>
            q
              .eq("accountId", account._id)
              .gte("occurredAt", windowStart(TREND_DAYS, now)),
          )
          .collect()
      : [],
    latestInteraction(ctx, { accountId: account._id }),
    activity ? accountStall(ctx, account, now) : null,
  ]);
  const open = deals
    .filter((deal) => deal.stage !== "won" && deal.stage !== "lost")
    .map((deal) => deal.amount);
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
    openDeals: open.length,
    pipeline: sumMoney(open),
    gstVerified,
    onPlatform: isOnPlatform(account),
    stuck: Boolean(stall),
    trend: bucketCounts(
      recent.map((entry) => entry.occurredAt),
      TREND_DAYS,
      now,
    ),
    lastInteraction,
  };
}

const ORG_EVENT_LIMIT = 5000;

async function healthOf(ctx: QueryCtx, account: Doc<"accounts">, now: number) {
  const orgId = account.platformOrgId;
  if (!orgId || account.archivedAt) return null;
  const events = await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .order("desc")
    .take(ORG_EVENT_LIMIT);
  const health = accountHealth(
    healthInput(
      account,
      stateEvents(events.reverse()),
      await latestSnapshot(ctx, account._id),
      now,
    ),
  );
  return {
    score: health.score,
    band: health.band,
    signals: health.signals.map((signal) => signal.id),
  };
}

type AccountsTable = NamedTableInfo<DataModel, "accounts">;

/** Filters and sort of the list; `page`, `counts` and CSV export share them. */
export const vListArgs = {
  archived: v.optional(v.boolean()),
  ownerId: v.optional(v.id("members")),
  stage: v.optional(vLifecycleStage),
  activity: v.optional(vActivity),
  search: vSearch,
  sort: v.optional(literals(["activity", "name"])),
  dir: v.optional(vDir),
};
type ListArgs = ObjectType<typeof vListArgs>;

/**
 * The query behind the accounts list. Each owner or stage filter has an index
 * per sort; the other filters narrow the scan. Search ranks by relevance, and
 * archived accounts list the most recently archived first.
 */
function listQuery(ctx: QueryCtx, args: ListArgs, now: number) {
  const accounts = ctx.db.query("accounts");
  const { ownerId, stage, archived = false } = args;
  const window = activityBounds(args.activity, now);
  const text = searchText(args.search);
  const narrow = (
    q: FilterBuilder<AccountsTable>,
    indexed: "owner" | "stage" | "both" | "none",
    ranged: boolean,
  ) =>
    q.and(
      indexed === "owner" && stage ? q.eq(q.field("stage"), stage) : true,
      !ranged && window?.since !== undefined
        ? q.gte(q.field("lastActivityAt"), window.since)
        : true,
      !ranged && window?.before !== undefined
        ? q.or(
            q.eq(q.field("lastActivityAt"), undefined),
            q.lt(q.field("lastActivityAt"), window.before),
          )
        : true,
    );

  if (text) {
    return accounts
      .withSearchIndex("search_name", (q) => {
        let search = q.search("name", text);
        if (!archived) search = search.eq("archivedAt", undefined);
        if (ownerId) search = search.eq("ownerId", ownerId);
        if (stage) search = search.eq("stage", stage);
        return search;
      })
      .filter((q) =>
        q.and(
          archived ? q.neq(q.field("archivedAt"), undefined) : true,
          narrow(q, "both", false),
        ),
      );
  }

  if (archived) {
    const query = ownerId
      ? accounts.withIndex("list_owner_activity", (q) =>
          q.eq("ownerId", ownerId).gt("archivedAt", 0),
        )
      : stage
        ? accounts.withIndex("list_stage_activity", (q) =>
            q.eq("stage", stage).gt("archivedAt", 0),
          )
        : accounts.withIndex("list_activity", (q) => q.gt("archivedAt", 0));
    return query
      .filter((q) => narrow(q, ownerId ? "owner" : "stage", false))
      .order("desc");
  }

  if (args.sort === "name") {
    const query = ownerId
      ? accounts.withIndex("list_owner_name", (q) =>
          q.eq("ownerId", ownerId).eq("archivedAt", undefined),
        )
      : stage
        ? accounts.withIndex("list_stage_name", (q) =>
            q.eq("stage", stage).eq("archivedAt", undefined),
          )
        : accounts.withIndex("list_name", (q) => q.eq("archivedAt", undefined));
    return query
      .filter((q) => narrow(q, ownerId ? "owner" : "stage", false))
      .order(args.dir ?? "asc");
  }

  const query = ownerId
    ? accounts.withIndex("list_owner_activity", (q) => {
        const base = q.eq("ownerId", ownerId).eq("archivedAt", undefined);
        return window?.since !== undefined
          ? base.gte("lastActivityAt", window.since)
          : window?.before !== undefined
            ? base.lt("lastActivityAt", window.before)
            : base;
      })
    : stage
      ? accounts.withIndex("list_stage_activity", (q) => {
          const base = q.eq("stage", stage).eq("archivedAt", undefined);
          return window?.since !== undefined
            ? base.gte("lastActivityAt", window.since)
            : window?.before !== undefined
              ? base.lt("lastActivityAt", window.before)
              : base;
        })
      : accounts.withIndex("list_activity", (q) => {
          const base = q.eq("archivedAt", undefined);
          return window?.since !== undefined
            ? base.gte("lastActivityAt", window.since)
            : window?.before !== undefined
              ? base.lt("lastActivityAt", window.before)
              : base;
        });
  return query
    .filter((q) => narrow(q, ownerId ? "owner" : "stage", true))
    .order(args.dir ?? "desc");
}

/**
 * The list's rows for these accounts: rollups, health and owner. Without
 * `activity` the trend and stalled flag are left empty, which the CSV export
 * doesn't show.
 */
async function rowsFor(
  ctx: QueryCtx,
  accounts: Doc<"accounts">[],
  activity = true,
) {
  const now = Date.now();
  const members = await memberIndex(ctx);
  return await Promise.all(
    accounts.map(async (account) => {
      const [peopleCount, stats, health] = await Promise.all([
        countPeople(ctx, account._id),
        accountStats(ctx, account, now, activity),
        healthOf(ctx, account, now),
      ]);
      return { ...toRow(account, members, peopleCount), ...stats, health };
    }),
  );
}

/** One page of the accounts list, with each row's rollups and health. */
export const page = memberQuery({
  args: { paginationOpts: paginationOptsValidator, ...vListArgs },
  handler: async (ctx, { paginationOpts, ...args }) => {
    const result = await listQuery(ctx, args, Date.now()).paginate(
      paginationOpts,
    );
    return await mapPage(result, (accounts) => rowsFor(ctx, accounts));
  },
});

/** CSV export, step 1: the ids the list would show, without building rows. */
export const exportIds = memberQuery({
  args: { paginationOpts: paginationOptsValidator, ...vListArgs },
  handler: async (ctx, { paginationOpts, ...args }) => {
    const result = await listQuery(ctx, args, Date.now()).paginate(
      paginationOpts,
    );
    return {
      ids: result.page.map((account) => account._id),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** CSV export, step 2: list rows for ids from `exportIds`, in the same order. */
export const exportRows = memberQuery({
  args: { ids: v.array(v.id("accounts")) },
  handler: async (ctx, { ids }) => {
    const accounts = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return await rowsFor(
      ctx,
      accounts.filter((account) => account !== null),
      false,
    );
  },
});

/**
 * Exact counts for the list's views, and for the current filters when they
 * can be counted without a scan (`inView` is null with a search or an
 * activity filter).
 */
export const counts = memberQuery({
  args: vListArgs,
  handler: async (ctx, args) => {
    const [all, mine, archived, inView] = await Promise.all([
      countAccounts(ctx, { archived: false }),
      countAccounts(ctx, { archived: false, ownerId: ctx.viewer._id }),
      countAccounts(ctx, { archived: true }),
      searchText(args.search) || args.activity
        ? null
        : countAccounts(ctx, {
            archived: Boolean(args.archived),
            ownerId: args.ownerId,
            stage: args.stage,
          }),
    ]);
    return { views: { all, mine, archived }, inView };
  },
});

/** Active accounts matching `search` by name, or the recently active ones when it's empty. */
export async function findAccounts(
  ctx: QueryCtx,
  search: string,
  limit: number,
) {
  const text = searchText(search);
  const accounts = text
    ? await ctx.db
        .query("accounts")
        .withSearchIndex("search_name", (q) =>
          q.search("name", text).eq("archivedAt", undefined),
        )
        .take(limit)
    : await ctx.db
        .query("accounts")
        .withIndex("list_activity", (q) => q.eq("archivedAt", undefined))
        .order("desc")
        .take(limit);
  return accounts.map((account) => ({
    _id: account._id,
    name: account.name,
    domain: account.domain ?? null,
    logoUrl: account.logoUrl ?? null,
  }));
}

/** For account pickers; `selected` is always included so the picker can name it. */
export const search = memberQuery({
  args: { search: v.string(), selected: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const found = await findAccounts(ctx, args.search, 20);
    const id = args.selected && ctx.db.normalizeId("accounts", args.selected);
    if (!id || found.some((account) => account._id === id)) return found;
    const account = await ctx.db.get(id);
    if (!account) return found;
    return [
      {
        _id: account._id,
        name: account.name,
        domain: account.domain ?? null,
        logoUrl: account.logoUrl ?? null,
      },
      ...found,
    ];
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
    const winner = account.mergedIntoId
      ? await ctx.db.get(account.mergedIntoId)
      : null;
    return {
      ...account,
      mergedInto: winner ? { _id: winner._id, name: winner.name } : null,
      domain: account.domain ?? null,
      gstin: account.gstin ?? null,
      custom: await visibleCustom(ctx, "account", account.custom),
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

/**
 * Sets or (with null) removes the account's own logo; without one the domain's
 * favicon shows. A refused upload is answered, not thrown: an error would roll
 * back the deletion of the blob it leaves behind.
 */
export const setLogo = memberMutation({
  args: {
    id: v.id("accounts"),
    storageId: v.union(v.id("_storage"), v.null()),
  },
  handler: async (ctx, { id, storageId }) => {
    const account = await requireAccount(ctx, id);
    if ((storageId ?? undefined) === account.logoStorageId) {
      return { ok: true as const };
    }
    let logoUrl: string | undefined;
    if (storageId) {
      const meta = await ctx.db.system.get(storageId);
      if (!meta) notFound("File");
      const [logo, attachment] = await Promise.all([
        ctx.db
          .query("accounts")
          .withIndex("by_logo_storage", (q) => q.eq("logoStorageId", storageId))
          .first(),
        ctx.db
          .query("attachments")
          .withIndex("by_storage", (q) => q.eq("storageId", storageId))
          .first(),
      ]);
      if (logo || attachment) fail("conflict", "That file is already in use");
      const message = logoProblem({
        type: meta.contentType ?? "",
        size: meta.size,
      });
      if (message) {
        await ctx.storage.delete(storageId);
        return { ok: false as const, message };
      }
      logoUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
    }
    const previous = account.logoStorageId;
    if (previous && (await ctx.db.system.get(previous))) {
      await ctx.storage.delete(previous);
    }
    await ctx.db.patch(id, {
      logoUrl,
      logoStorageId: storageId ?? undefined,
      updatedAt: Date.now(),
    });
    await logSystem(
      ctx,
      { accountId: id },
      storageId ? "changed the logo" : "removed the custom logo",
      undefined,
      ctx.viewer._id,
    );
    return { ok: true as const };
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
      if (account.mergedIntoId) {
        fail("conflict", `${account.name} was merged into another account`);
      }
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
