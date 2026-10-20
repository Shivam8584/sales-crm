import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { STAGE_LABEL } from "../lib/domain/labels";
import { checkGstin, panRoot } from "../lib/domain/gstin";
import { cleanTags, normalizeDomain } from "../lib/domain/normalize";
import { fail, invalid } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import {
  accountName,
  memberIndex,
  memberRef,
  requireAccount,
  requireActiveMember,
} from "./lib/records";
import { diff, logChanges, logSystem } from "./lib/timeline";
import { vLifecycleStage } from "./lib/validators";

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

export const list = memberQuery({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    const [accounts, people, members] = await Promise.all([
      ctx.db.query("accounts").withIndex("by_updated").order("desc").collect(),
      ctx.db.query("people").collect(),
      memberIndex(ctx),
    ]);
    const peopleCount = new Map<Id<"accounts">, number>();
    for (const person of people) {
      if (person.accountId && !person.archivedAt) {
        peopleCount.set(
          person.accountId,
          (peopleCount.get(person.accountId) ?? 0) + 1,
        );
      }
    }
    return accounts
      .filter((account) => includeArchived || !account.archivedAt)
      .map((account) => ({
        _id: account._id,
        _creationTime: account._creationTime,
        name: account.name,
        domain: account.domain ?? null,
        logoUrl: account.logoUrl ?? null,
        stage: account.stage,
        tags: account.tags,
        gstin: account.gstin ?? null,
        owner: memberRef(members, account.ownerId),
        peopleCount: peopleCount.get(account._id) ?? 0,
        lastActivityAt: account.lastActivityAt ?? null,
        archivedAt: account.archivedAt ?? null,
      }));
  },
});

export const get = memberQuery({
  args: { id: v.id("accounts") },
  handler: async (ctx, { id }) => {
    const account = await ctx.db.get(id);
    if (!account) return null;
    const members = await memberIndex(ctx);
    return {
      ...account,
      domain: account.domain ?? null,
      gstin: account.gstin ?? null,
      owner: memberRef(members, account.ownerId),
    };
  },
});

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
    const now = Date.now();
    const id = await ctx.db.insert("accounts", {
      name: fields.name!,
      domain: fields.domain,
      ownerId: fields.ownerId!,
      stage: fields.stage!,
      tags: fields.tags ?? [],
      updatedAt: now,
      lastActivityAt: now,
    });
    await logSystem(
      ctx,
      { accountId: id },
      "created the account",
      undefined,
      ctx.viewer._id,
    );
    return id;
  },
});

/** Returns the previous values so the client can offer undo. */
export const update = memberMutation({
  args: { id: v.id("accounts"), patch: v.object(editable) },
  handler: async (ctx, { id, patch }) => {
    const account = await requireAccount(ctx, id);
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
