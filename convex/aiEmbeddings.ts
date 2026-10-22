import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { embed, embedModel } from "./lib/ai";
import { contextHash } from "./lib/aiContext";
import {
  closeness,
  embedText,
  sharedWords,
  type EmbedFacts,
} from "./lib/aiEmbedText";
import { notFound } from "./lib/errors";
import { internalMutation } from "./lib/functions";
import { vLifecycleStage } from "./lib/validators";
import {
  brandKey,
  domainKey,
  marketplaceName,
} from "../lib/domain/prospecting";

const BATCH = 64;
const RUN_MAX = 500;
const LOOKALIKES = 12;

export type Lookalike = {
  accountId: Id<"accounts">;
  name: string;
  domain: string | null;
  logoUrl: string | null;
  stage: Doc<"accounts">["stage"];
  score: "close" | "similar";
  reasonWords: string[];
};

const indexable = (account: Doc<"accounts">) =>
  !account.archivedAt && !account.mergedIntoId;

async function factsOf(
  ctx: QueryCtx,
  account: Doc<"accounts">,
): Promise<EmbedFacts> {
  const orgId = account.platformOrgId;
  const [facts, stages, linked] = await Promise.all([
    ctx.db
      .query("facts")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .take(40),
    orgId
      ? ctx.db
          .query("activationStages")
          .withIndex("by_org", (q) => q.eq("orgId", orgId))
          .first()
      : null,
    ctx.db
      .query("prospectBrands")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .take(3),
  ]);
  const keys = new Set(
    [
      brandKey(account.name),
      domainKey(account.domain),
      ...linked.map((row) => row.brandKey),
    ].filter((key) => key.length > 1),
  );
  const products = (
    await Promise.all(
      [...keys].map((key) =>
        ctx.db
          .query("watchedProducts")
          .withIndex("by_brand", (q) => q.eq("brandKey", key))
          .take(10),
      ),
    )
  )
    .flat()
    .filter((product) => !product.removedAt);

  const reached = stages?.stages;
  return {
    name: account.name,
    stage: account.stage,
    tags: account.tags,
    domain: account.domain ?? null,
    about: facts
      .filter(
        (fact) =>
          fact.field === "siteDescription" &&
          (fact.status === "applied" || fact.status === "accepted"),
      )
      .sort((a, b) => b.observedAt - a.observedAt)
      .slice(0, 1)
      .map((fact) => fact.value),
    platform: !orgId
      ? "not on the platform"
      : reached?.activated
        ? "activated on the platform"
        : reached?.live
          ? "live on the platform"
          : reached?.funded
            ? "funded, not live yet"
            : "signed up on the platform",
    marketplaces: products.map((product) =>
      marketplaceName(product.marketplace),
    ),
    categories: products.flatMap((product) =>
      product.category ? [product.category] : [],
    ),
  };
}

const stored = (ctx: QueryCtx, accountId: Id<"accounts">) =>
  ctx.db
    .query("accountEmbeddings")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

/** Accounts whose embedded text changed since the stored vector, or that have none. */
async function pendingOf(ctx: QueryCtx, accounts: (Doc<"accounts"> | null)[]) {
  const out = [];
  for (const account of accounts) {
    if (!account) continue;
    const text = embedText(await factsOf(ctx, account));
    const hash = await contextHash({ model: embedModel(), text });
    if ((await stored(ctx, account._id))?.hash !== hash) {
      out.push({ accountId: account._id, stage: account.stage, text, hash });
    }
  }
  return out;
}

type Pending = Awaited<ReturnType<typeof pendingOf>>;

export const pendingFor = internalQuery({
  args: { ids: v.array(v.id("accounts")) },
  handler: async (ctx, { ids }) =>
    await pendingOf(ctx, await Promise.all(ids.map((id) => ctx.db.get(id)))),
});

export const pendingPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("accounts")
      .paginate({ numItems: BATCH, cursor });
    return {
      items: await pendingOf(ctx, page.page.filter(indexable)),
      next: page.isDone ? null : page.continueCursor,
    };
  },
});

export const vector = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) =>
    (await stored(ctx, accountId))?.embedding ?? null,
});

export const store = internalMutation({
  args: {
    rows: v.array(
      v.object({
        accountId: v.id("accounts"),
        stage: vLifecycleStage,
        embedding: v.array(v.float64()),
        hash: v.string(),
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const next = { ...row, updatedAt: Date.now() };
      const existing = await stored(ctx, row.accountId);
      if (existing) await ctx.db.replace(existing._id, next);
      else await ctx.db.insert("accountEmbeddings", next);
    }
  },
});

/** Embeds one batch of pending accounts and stores the vectors; returns them in order. */
async function embedPending(ctx: ActionCtx, items: Pending) {
  const vectors = await embed(items.map((item) => item.text));
  await ctx.runMutation(internal.aiEmbeddings.store, {
    rows: items.map(({ accountId, stage, hash }, index) => ({
      accountId,
      stage,
      hash,
      embedding: vectors[index],
    })),
  });
  return vectors;
}

export const embedBatch = internalAction({
  args: { accountIds: v.array(v.id("accounts")) },
  handler: async (ctx, { accountIds }): Promise<number> => {
    let done = 0;
    for (let at = 0; at < accountIds.length; at += BATCH) {
      const items = await ctx.runQuery(internal.aiEmbeddings.pendingFor, {
        ids: accountIds.slice(at, at + BATCH),
      });
      if (items.length === 0) continue;
      await embedPending(ctx, items);
      done += items.length;
    }
    return done;
  },
});

/** The nightly sweep: embeds what changed, up to a daily cap. Does nothing without an AI key. */
export const embedStale = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    if (!process.env.OPENAI_API_KEY?.trim()) return 0;
    let done = 0;
    let cursor: string | null = null;
    do {
      const page: {
        items: Pending;
        next: string | null;
      } = await ctx.runQuery(internal.aiEmbeddings.pendingPage, { cursor });
      const items = page.items.slice(0, RUN_MAX - done);
      if (items.length > 0) {
        await embedPending(ctx, items);
        done += items.length;
      }
      cursor = done >= RUN_MAX ? null : page.next;
    } while (cursor);
    return done;
  },
});

export const neighbours = internalQuery({
  args: {
    accountId: v.id("accounts"),
    hits: v.array(
      v.object({ id: v.id("accountEmbeddings"), score: v.number() }),
    ),
  },
  handler: async (ctx, { accountId, hits }): Promise<Lookalike[]> => {
    const source = await ctx.db.get(accountId);
    if (!source) notFound("Account");
    const sourceFacts = await factsOf(ctx, source);
    const out: Lookalike[] = [];
    for (const hit of hits) {
      const row = await ctx.db.get(hit.id);
      const account = row && (await ctx.db.get(row.accountId));
      if (!account || account._id === accountId || !indexable(account))
        continue;
      out.push({
        accountId: account._id,
        name: account.name,
        domain: account.domain ?? null,
        logoUrl: account.logoUrl ?? null,
        stage: account.stage,
        score: closeness(hit.score),
        reasonWords: sharedWords(sourceFacts, await factsOf(ctx, account)),
      });
      if (out.length === LOOKALIKES) break;
    }
    return out;
  },
});

/** Embeds the account now if its vector is missing or stale, then finds its nearest neighbours. */
export async function lookalikes(
  ctx: ActionCtx,
  accountId: Id<"accounts">,
): Promise<Lookalike[]> {
  const [item] = await ctx.runQuery(internal.aiEmbeddings.pendingFor, {
    ids: [accountId],
  });
  const vector = item
    ? (await embedPending(ctx, [item]))[0]
    : await ctx.runQuery(internal.aiEmbeddings.vector, { accountId });
  if (!vector) notFound("Account");
  const hits = await ctx.vectorSearch("accountEmbeddings", "by_embedding", {
    vector,
    limit: LOOKALIKES + 4,
  });
  return await ctx.runQuery(internal.aiEmbeddings.neighbours, {
    accountId,
    hits: hits.map((hit) => ({ id: hit._id, score: hit._score })),
  });
}
