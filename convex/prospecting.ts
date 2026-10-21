import { v, type Infer } from "convex/values";
import {
  httpAction,
  internalAction,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  normalizeEmail,
  normalizePhone,
  cleanText,
} from "../lib/domain/normalize";
import {
  INBOUND_SOURCE,
  MAX_IMPORT_URLS,
  MAX_WATCHLIST_PRODUCTS,
  REVIEW_GAP_CONSENT,
  REVIEW_GAP_LEAD_SOURCE,
  parseReviewGap,
  VELOCITY_WINDOW_DAYS,
  benchmarksFor,
  brandKey,
  dailyGains,
  dayOf,
  domainKey,
  marketplaceName,
  parseProductUrl,
  sameBrand,
  scoreBand,
  scoreProduct,
  talkingPoint,
  velocity,
  type Benchmark,
  type Score,
} from "../lib/domain/prospecting";
import { fail, invalid, notFound } from "./lib/errors";
import { internalMutation, memberMutation, memberQuery } from "./lib/functions";
import {
  allowedOrigins,
  clientIp,
  corsHeaders,
  json,
  originAllowed,
  preflight,
  readJson,
  siteOrigins,
} from "./lib/http";
import {
  createLead,
  isOpen,
  leadHref,
  recordConsents,
  type NewLead,
} from "./lib/leads";
import { requireAccount } from "./lib/records";
import {
  MAX_BATCH,
  SCRAPER_ENV_HINT,
  sandboxScrape,
  scrapeBatch,
  scraperMode,
  type ScrapeResult,
} from "./lib/scraper";
import { rateLimiter } from "./lib/rateLimiter";
import { logSystem } from "./lib/timeline";
import { vMoney } from "./lib/validators";

const DAY_MS = 24 * 60 * 60_000;
const TREND_DAYS = 14;
const MAX_NAME = 80;
const MAX_BENCHMARK = 10_000_000;
const BATCH_STAGGER_MS = 20_000;

export const config = memberQuery({
  args: {},
  handler: async () => ({
    mode: scraperMode(process.env),
    envHint: SCRAPER_ENV_HINT,
  }),
});

// ── Scoring ─────────────────────────────────────────────────────────────────

type Scope = {
  watchlists: Map<Id<"watchlists">, Doc<"watchlists">>;
  products: Doc<"watchedProducts">[];
  /** Every curated listing, the market inbound audits are measured against. */
  peers: Doc<"watchedProducts">[];
};

const isInbound = (list: Doc<"watchlists">) => list.name === INBOUND_SOURCE;

async function productsOf(ctx: QueryCtx, watchlistId: Id<"watchlists">) {
  return (
    await ctx.db
      .query("watchedProducts")
      .withIndex("by_watchlist", (q) => q.eq("watchlistId", watchlistId))
      .collect()
  ).filter((product) => !product.removedAt);
}

async function liveWatchlists(ctx: QueryCtx) {
  const rows = await ctx.db.query("watchlists").collect();
  return new Map(
    rows.filter((row) => !row.deletedAt).map((row) => [row._id, row]),
  );
}

/** Every watched product, or only the watchlists that hold one of `keys`. */
async function loadScope(ctx: QueryCtx, keys?: string[]): Promise<Scope> {
  const watchlists = await liveWatchlists(ctx);
  let ids = [...watchlists.keys()];
  if (keys) {
    const seeds = await Promise.all(
      [...new Set(keys)].filter(Boolean).map((key) =>
        ctx.db
          .query("watchedProducts")
          .withIndex("by_brand", (q) => q.eq("brandKey", key))
          .collect(),
      ),
    );
    ids = [
      ...new Set(
        seeds
          .flat()
          .filter((row) => !row.removedAt && watchlists.has(row.watchlistId))
          .map((row) => row.watchlistId),
      ),
    ];
  }
  const load = async (lists: Id<"watchlists">[]) =>
    (await Promise.all(lists.map((id) => productsOf(ctx, id)))).flat();
  const products = await load(ids);
  const curated = [...watchlists.values()].filter((list) => !isInbound(list));
  const peers = ids.some((id) => isInbound(watchlists.get(id)!))
    ? keys
      ? await load(curated.map((list) => list._id))
      : products.filter((row) => !isInbound(watchlists.get(row.watchlistId)!))
    : [];
  return { watchlists, products, peers };
}

async function trendOf(ctx: QueryCtx, productId: Id<"watchedProducts">) {
  const now = Date.now();
  const since = dayOf(now - TREND_DAYS * DAY_MS);
  const snapshots = await ctx.db
    .query("productSnapshots")
    .withIndex("by_product_day", (q) =>
      q.eq("productId", productId).gte("day", since),
    )
    .collect();
  const points = snapshots
    .filter((row) => row.ratingsCount !== undefined)
    .map((row) => ({ at: row.takenAt, count: row.ratingsCount! }));
  return dailyGains(points, now, TREND_DAYS);
}

export type ProductRow = {
  _id: Id<"watchedProducts">;
  watchlistId: Id<"watchlists">;
  watchlist: string;
  inbound: boolean;
  marketplace: string;
  identifier: string;
  listingKey: string;
  url: string;
  status: Doc<"watchedProducts">["status"];
  checking: boolean;
  error: string | null;
  source: "live" | "sandbox" | null;
  title: string | null;
  brand: string | null;
  brandKey: string | null;
  category: string | null;
  price: Doc<"watchedProducts">["price"] | null;
  rating: number | null;
  ratingsCount: number | null;
  velocity: number | null;
  variants: number;
  checkedAt: number | null;
  addedAt: number;
  benchmark: Benchmark | null;
  score: Score | null;
};

function scoreScope(scope: Scope): ProductRow[] {
  const byList = new Map<Id<"watchlists">, Doc<"watchedProducts">[]>();
  for (const product of scope.products) {
    byList.set(product.watchlistId, [
      ...(byList.get(product.watchlistId) ?? []),
      product,
    ]);
  }
  const peer = (product: Doc<"watchedProducts">) => ({
    id: product._id,
    category: product.category ?? null,
    ratingsCount: product.ratingsCount ?? null,
    velocity: product.velocity ?? null,
  });
  const rows: ProductRow[] = [];
  for (const [watchlistId, products] of byList) {
    const watchlist = scope.watchlists.get(watchlistId)!;
    const inbound = isInbound(watchlist);
    const set = watchlist.benchmark ?? null;
    const shared = inbound ? null : benchmarksFor(products.map(peer), set);
    for (const product of products) {
      // Each public check is measured against the curated market alone, not other checks.
      const benchmark =
        (shared ?? benchmarksFor([product, ...scope.peers].map(peer), set)).get(
          product._id,
        ) ?? null;
      rows.push({
        _id: product._id,
        watchlistId,
        watchlist: watchlist.name,
        inbound,
        marketplace: product.marketplace,
        identifier: product.identifier,
        listingKey: product.listingKey,
        url: product.url,
        status: product.status,
        checking: product.queuedAt !== undefined,
        error: product.error ?? null,
        source: product.source ?? null,
        title: product.title ?? null,
        brand: product.brand ?? null,
        brandKey: product.brandKey ?? null,
        category: product.category ?? null,
        price: product.price ?? null,
        rating: product.rating ?? null,
        ratingsCount: product.ratingsCount ?? null,
        velocity: product.velocity ?? null,
        variants: product.variants ?? 0,
        checkedAt: product.checkedAt ?? null,
        addedAt: product._creationTime,
        benchmark,
        score: scoreProduct({
          ratingsCount: product.ratingsCount ?? null,
          rating: product.rating ?? null,
          velocity: product.velocity ?? null,
          benchmark,
        }),
      });
    }
  }
  return rows;
}

type AccountRef = {
  _id: Id<"accounts">;
  name: string;
  domain: string | null;
  logoUrl: string | null;
};

function accountRef(account: Doc<"accounts">): AccountRef {
  return {
    _id: account._id,
    name: account.name,
    domain: account.domain ?? null,
    logoUrl: account.logoUrl ?? null,
  };
}

async function brandDecisions(ctx: QueryCtx, keys: string[]) {
  const map = new Map<string, Doc<"prospectBrands">>();
  for (const key of new Set(keys)) {
    const row = await ctx.db
      .query("prospectBrands")
      .withIndex("by_brand", (q) => q.eq("brandKey", key))
      .unique();
    if (row) map.set(key, row);
  }
  return map;
}

type GapRef = {
  productId: Id<"watchedProducts">;
  title: string;
  marketplace: string;
  ratingsCount: number;
  benchmark: number;
  share: number;
};

function gapRef(row: ProductRow): GapRef {
  return {
    productId: row._id,
    title: row.title ?? row.identifier,
    marketplace: row.marketplace,
    ratingsCount: row.ratingsCount!,
    benchmark: row.benchmark!.ratings,
    share: row.score!.share,
  };
}

const MATCH_SCAN = 10;

/** An active account named or hosted like the brand, found by name search and website prefix. */
async function matchAccount(ctx: QueryCtx, key: string, brand: string) {
  const [named, hosted] = await Promise.all([
    ctx.db
      .query("accounts")
      .withSearchIndex("search_name", (q) =>
        q.search("name", brand).eq("archivedAt", undefined),
      )
      .take(MATCH_SCAN),
    ctx.db
      .query("accounts")
      .withIndex("by_domain", (q) =>
        q.gte("domain", `${key}.`).lt("domain", `${key}/`),
      )
      .take(MATCH_SCAN),
  ]);
  return (
    [...named, ...hosted].find(
      (account) => !account.archivedAt && sameBrand(key, account),
    ) ?? null
  );
}

/** Groups scored listings by brand, matched against the CRM. */
async function brandsOf(ctx: QueryCtx, rows: ProductRow[]) {
  const unique = new Map<string, ProductRow>();
  for (const row of rows) {
    if (!row.brandKey) continue;
    const current = unique.get(row.listingKey);
    if (!current || (row.score?.score ?? -1) > (current.score?.score ?? -1)) {
      unique.set(row.listingKey, row);
    }
  }
  const byBrand = new Map<string, ProductRow[]>();
  for (const row of unique.values()) {
    byBrand.set(row.brandKey!, [...(byBrand.get(row.brandKey!) ?? []), row]);
  }
  const keys = [...byBrand.keys()];
  const decisions = await brandDecisions(ctx, keys);

  const out = [];
  for (const [key, products] of byBrand) {
    const decision = decisions.get(key);
    const brand =
      decision?.brand ??
      products.map((row) => row.brand!).sort((a, b) => b.length - a.length)[0];
    const linked = decision?.accountId
      ? await ctx.db.get(decision.accountId)
      : null;
    const matched = linked ? null : await matchAccount(ctx, key, brand);
    const lead = decision?.leadId ? await ctx.db.get(decision.leadId) : null;
    const scored = products
      .filter((row) => row.score !== null)
      .sort((a, b) => a.score!.share - b.score!.share);
    const top = [...scored].sort((a, b) => b.score!.score - a.score!.score)[0];
    const worst = scored[0];
    const best = scored[scored.length - 1];
    const gains = Array.from({ length: TREND_DAYS }, () => 0);
    for (const row of products) {
      const trend = await trendOf(ctx, row._id);
      trend.forEach((value, index) => (gains[index] += value));
    }
    const velocities = products
      .map((row) => row.velocity)
      .filter((value): value is number => value !== null);
    out.push({
      key,
      brand,
      products: products.length,
      marketplaces: [...new Set(products.map((row) => row.marketplace))].sort(),
      watchlistIds: [...new Set(products.map((row) => row.watchlistId))],
      inbound: products.some((row) => row.inbound),
      score: top ? top.score!.score : null,
      band: top ? scoreBand(top.score!.score) : null,
      reasons: top ? top.score!.reasons : [],
      topProductId: top?._id ?? null,
      worst: worst ? gapRef(worst) : null,
      best: best && best !== worst ? gapRef(best) : null,
      velocity: velocities.length
        ? Math.round(velocities.reduce((sum, value) => sum + value, 0) * 10) /
          10
        : null,
      gains,
      talkingPoint:
        top && top.score!.gap > 0
          ? talkingPoint({
              title: top.title ?? top.identifier,
              marketplace: top.marketplace,
              ratingsCount: top.ratingsCount!,
              benchmark: top.benchmark!,
            })
          : null,
      account: linked
        ? { via: "linked" as const, ...accountRef(linked) }
        : matched
          ? { via: "matched" as const, ...accountRef(matched) }
          : null,
      lead: lead
        ? {
            _id: lead._id,
            name: lead.name,
            status: lead.status,
            open: isOpen(lead),
          }
        : null,
      checkedAt:
        Math.max(0, ...products.map((row) => row.checkedAt ?? 0)) || null,
    });
  }
  return out;
}

export type BrandRow = Awaited<ReturnType<typeof brandsOf>>[number];

/** Watched listings and the brands behind them, scored. */
export const overview = memberQuery({
  args: {},
  handler: async (ctx) => {
    const scope = await loadScope(ctx);
    const products = scoreScope(scope);
    return {
      mode: scraperMode(process.env),
      products,
      brands: await brandsOf(ctx, products),
    };
  },
});

/** One brand: its listings with recent history, and the CRM records it maps to. */
export const brand = memberQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const scope = await loadScope(ctx, [key]);
    const all = scoreScope(scope);
    const [row] = await brandsOf(
      ctx,
      all.filter((item) => item.brandKey === key),
    );
    if (!row) return null;
    const products = [];
    for (const item of all.filter((product) => product.brandKey === key)) {
      products.push({ ...item, gains: await trendOf(ctx, item._id) });
    }
    return { ...row, mode: scraperMode(process.env), items: products };
  },
});

/** Listings of the brands an account sells under, with their rating trend. */
export const forAccount = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    const linked = await ctx.db
      .query("prospectBrands")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    const candidates = new Set(linked.map((row) => row.brandKey));
    candidates.add(brandKey(account.name));
    if (account.domain) candidates.add(domainKey(account.domain));
    const keys: string[] = [];
    for (const key of candidates) {
      const decision = await ctx.db
        .query("prospectBrands")
        .withIndex("by_brand", (q) => q.eq("brandKey", key))
        .unique();
      const ownedElsewhere =
        decision?.accountId && decision.accountId !== accountId;
      if (!ownedElsewhere && (decision?.accountId || sameBrand(key, account))) {
        keys.push(key);
      }
    }
    if (keys.length === 0) return { keys, products: [] };
    const rows = scoreScope(await loadScope(ctx, keys)).filter(
      (row) => row.brandKey && keys.includes(row.brandKey),
    );
    const seen = new Set<string>();
    const products = [];
    for (const row of rows.sort(
      (a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1),
    )) {
      if (seen.has(row.listingKey)) continue;
      seen.add(row.listingKey);
      products.push({ ...row, gains: await trendOf(ctx, row._id) });
    }
    return { keys, products };
  },
});

// ── Watchlists ──────────────────────────────────────────────────────────────

/** Sources for the filter and the add dialog, by name. */
export const watchlists = memberQuery({
  args: {},
  handler: async (ctx) => {
    const out = [];
    for (const list of (await liveWatchlists(ctx)).values()) {
      out.push({
        _id: list._id,
        name: list.name,
        benchmark: list.benchmark ?? null,
        inbound: isInbound(list),
        products: (await productsOf(ctx, list._id)).length,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

function cleanName(value: string) {
  const name = cleanText(value);
  if (!name) invalid("name", "Name the source");
  if (name.length > MAX_NAME) invalid("name", "Name is too long");
  if (name.toLowerCase() === INBOUND_SOURCE.toLowerCase()) {
    invalid("name", `${INBOUND_SOURCE} is kept for public review-gap checks`);
  }
  return name;
}

function cleanBenchmark(value: number | null | undefined) {
  if (value === null || value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > MAX_BENCHMARK) {
    invalid("benchmark", "Enter a whole number of ratings, or leave it empty");
  }
  return value;
}

async function requireWatchlist(ctx: QueryCtx, id: Id<"watchlists">) {
  const list = await ctx.db.get(id);
  if (!list || list.deletedAt) notFound("Source");
  return list;
}

/** Curated sources only: inbound audits are filled by the public check. */
async function requireCurated(ctx: QueryCtx, id: Id<"watchlists">) {
  const list = await requireWatchlist(ctx, id);
  if (isInbound(list)) {
    fail(
      "forbidden",
      `${INBOUND_SOURCE} is filled by public review-gap checks`,
    );
  }
  return list;
}

export const createWatchlist = memberMutation({
  args: { name: v.string(), benchmark: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const name = cleanName(args.name);
    const existing = await liveWatchlists(ctx);
    if (
      [...existing.values()].some(
        (row) => row.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      invalid("name", "A source with this name already exists");
    }
    return await ctx.db.insert("watchlists", {
      name,
      benchmark: cleanBenchmark(args.benchmark),
      createdById: ctx.viewer._id,
      updatedAt: Date.now(),
    });
  },
});

/** Renames a watchlist or sets its benchmark; returns the previous values. */
export const updateWatchlist = memberMutation({
  args: {
    id: v.id("watchlists"),
    name: v.optional(v.string()),
    benchmark: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { id, ...args }) => {
    const list = await requireCurated(ctx, id);
    const patch: Partial<Doc<"watchlists">> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = cleanName(args.name);
    if (args.benchmark !== undefined) {
      patch.benchmark = cleanBenchmark(args.benchmark);
    }
    await ctx.db.patch(id, patch);
    return { name: list.name, benchmark: list.benchmark ?? null };
  },
});

export const setWatchlistDeleted = memberMutation({
  args: { id: v.id("watchlists"), deleted: v.boolean() },
  handler: async (ctx, { id, deleted }) => {
    const list = await ctx.db.get(id);
    if (!list) notFound("Source");
    if (isInbound(list)) {
      fail(
        "forbidden",
        `${INBOUND_SOURCE} is filled by public review-gap checks`,
      );
    }
    await ctx.db.patch(id, {
      deletedAt: deleted ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
  },
});

// ── Products ────────────────────────────────────────────────────────────────

/** Spends `count` of the member's hourly scrape budget, or fails with the wait. */
async function spendBudget(
  ctx: MutationCtx,
  memberId: Id<"members">,
  count: number,
) {
  const { ok, retryAfter } = await rateLimiter.limit(ctx, "productChecks", {
    key: memberId,
    count,
  });
  if (!ok) {
    fail(
      "rate_limited",
      `That's more than your hourly budget of product checks allows. Check fewer products or wait ${Math.ceil(retryAfter / 60_000)} min.`,
    );
  }
}

async function queueChecks(
  ctx: MutationCtx,
  ids: Id<"watchedProducts">[],
  delayMs = 0,
) {
  const now = Date.now();
  for (const id of ids) await ctx.db.patch(id, { queuedAt: now });
  for (let start = 0; start < ids.length; start += MAX_BATCH) {
    await ctx.scheduler.runAfter(
      delayMs + (start / MAX_BATCH) * BATCH_STAGGER_MS,
      internal.prospecting.scrape,
      { productIds: ids.slice(start, start + MAX_BATCH) },
    );
  }
}

/** Adds product links to a source and queues a first check of each. */
export const addProducts = memberMutation({
  args: { watchlistId: v.id("watchlists"), urls: v.array(v.string()) },
  handler: async (ctx, { watchlistId, urls }) => {
    await requireCurated(ctx, watchlistId);
    if (urls.length === 0) invalid("urls", "Paste at least one product link");
    if (urls.length > MAX_IMPORT_URLS) {
      invalid("urls", `Add up to ${MAX_IMPORT_URLS} links at a time`);
    }
    const existing = await productsOf(ctx, watchlistId);
    const keys = new Set(existing.map((row) => row.listingKey));
    const invalidLinks: { input: string; reason: string }[] = [];
    const ready = [];
    let duplicates = 0;
    for (const input of urls) {
      const parsed = parseProductUrl(input);
      if (!parsed.ok) invalidLinks.push({ input, reason: parsed.reason });
      else if (keys.has(parsed.key)) duplicates++;
      else {
        keys.add(parsed.key);
        ready.push(parsed);
      }
    }
    if (existing.length + ready.length > MAX_WATCHLIST_PRODUCTS) {
      invalid(
        "urls",
        `A source holds up to ${MAX_WATCHLIST_PRODUCTS} products; this one has ${existing.length}`,
      );
    }
    if (ready.length > 0) await spendBudget(ctx, ctx.viewer._id, ready.length);
    const ids = [];
    for (const parsed of ready) {
      ids.push(
        await ctx.db.insert("watchedProducts", {
          watchlistId,
          marketplace: parsed.marketplace,
          identifier: parsed.identifier,
          listingKey: parsed.key,
          url: parsed.url,
          status: "pending",
          addedById: ctx.viewer._id,
        }),
      );
    }
    await queueChecks(ctx, ids);
    await ctx.db.patch(watchlistId, { updatedAt: Date.now() });
    return { added: ids.length, duplicates, invalid: invalidLinks };
  },
});

export const setProductsRemoved = memberMutation({
  args: { ids: v.array(v.id("watchedProducts")), removed: v.boolean() },
  handler: async (ctx, { ids, removed }) => {
    for (const id of ids) {
      const product = await ctx.db.get(id);
      if (!product) continue;
      await ctx.db.patch(id, { removedAt: removed ? Date.now() : undefined });
    }
  },
});

/** Re-checks every product in a source (or all of them) now. */
export const refresh = memberMutation({
  args: {
    watchlistId: v.optional(v.id("watchlists")),
    productIds: v.optional(v.array(v.id("watchedProducts"))),
  },
  handler: async (ctx, { watchlistId, productIds }) => {
    let products: Doc<"watchedProducts">[];
    if (productIds) {
      products = [];
      for (const id of productIds) {
        const product = await ctx.db.get(id);
        if (product && !product.removedAt) products.push(product);
      }
    } else if (watchlistId) {
      await requireWatchlist(ctx, watchlistId);
      products = await productsOf(ctx, watchlistId);
    } else {
      products = (await loadScope(ctx)).products;
    }
    const due = products.filter((row) => row.queuedAt === undefined);
    if (due.length === 0) return 0;
    await spendBudget(ctx, ctx.viewer._id, due.length);
    await queueChecks(
      ctx,
      due.map((row) => row._id),
    );
    return due.length;
  },
});

export const scrapeTargets = internalQuery({
  args: { productIds: v.array(v.id("watchedProducts")) },
  handler: async (ctx, { productIds }) => {
    const out = [];
    for (const id of productIds) {
      const product = await ctx.db.get(id);
      if (product && !product.removedAt) out.push({ id, url: product.url });
    }
    return out;
  },
});

const vResult = v.object({
  id: v.id("watchedProducts"),
  error: v.optional(v.string()),
  listing: v.optional(
    v.object({
      title: v.string(),
      brand: v.optional(v.string()),
      category: v.optional(v.string()),
      price: v.optional(vMoney),
      mrp: v.optional(vMoney),
      rating: v.optional(v.number()),
      ratingsCount: v.optional(v.number()),
      imageUrl: v.optional(v.string()),
      variants: v.number(),
    }),
  ),
});

function toRecord(result: ScrapeResult) {
  const id = result.id as Id<"watchedProducts">;
  if (!result.ok) return { id, error: result.error };
  const { listing } = result;
  return {
    id,
    listing: {
      title: listing.title,
      brand: listing.brand ?? undefined,
      category: listing.category ?? undefined,
      price: listing.price ?? undefined,
      mrp: listing.mrp ?? undefined,
      rating: listing.rating ?? undefined,
      ratingsCount: listing.ratingsCount ?? undefined,
      imageUrl: listing.imageUrl ?? undefined,
      variants: listing.variants,
    },
  };
}

/** Reads listings through the scraper worker, or the sandbox when SCRAPER_SANDBOX=1. */
async function readListings(items: { id: string; url: string }[], at: number) {
  const mode = scraperMode(process.env);
  let results: ScrapeResult[];
  if (mode === "live") results = await scrapeBatch(process.env, items);
  else if (mode === "sandbox") {
    results = items.map((item) => sandboxScrape(item, at));
  } else {
    results = items.map((item) => ({
      id: item.id,
      ok: false,
      error: `The scraper isn't set up. ${SCRAPER_ENV_HINT}`,
      retryable: true,
    }));
  }
  return { source: mode ?? ("live" as const), results };
}

export const scrape = internalAction({
  args: { productIds: v.array(v.id("watchedProducts")) },
  handler: async (ctx, { productIds }) => {
    const items: { id: Id<"watchedProducts">; url: string }[] =
      await ctx.runQuery(internal.prospecting.scrapeTargets, { productIds });
    if (items.length === 0) return;
    const at = Date.now();
    const { source, results } = await readListings(items, at);
    await ctx.runMutation(internal.prospecting.record, {
      at,
      source,
      results: results.map(toRecord),
    });
  },
});

async function writeSnapshot(
  ctx: MutationCtx,
  productId: Id<"watchedProducts">,
  at: number,
  reading: Pick<Doc<"productSnapshots">, "rating" | "ratingsCount" | "price">,
) {
  const day = dayOf(at);
  const existing = await ctx.db
    .query("productSnapshots")
    .withIndex("by_product_day", (q) =>
      q.eq("productId", productId).eq("day", day),
    )
    .unique();
  if (existing) await ctx.db.patch(existing._id, { takenAt: at, ...reading });
  else {
    await ctx.db.insert("productSnapshots", {
      productId,
      day,
      takenAt: at,
      ...reading,
    });
  }
}

async function velocityOf(
  ctx: MutationCtx,
  productId: Id<"watchedProducts">,
  at: number,
) {
  const rows = await ctx.db
    .query("productSnapshots")
    .withIndex("by_product_day", (q) =>
      q
        .eq("productId", productId)
        .gte("day", dayOf(at - VELOCITY_WINDOW_DAYS * DAY_MS)),
    )
    .collect();
  return velocity(
    rows
      .filter((row) => row.ratingsCount !== undefined)
      .map((row) => ({ at: row.takenAt, count: row.ratingsCount! })),
    at,
  );
}

type Reading = Infer<typeof vResult>;
type ReadSource = "live" | "sandbox";

/** Stores one scrape on its product: today's snapshot, the listing and its ratings pace. */
async function applyReading(
  ctx: MutationCtx,
  result: Reading,
  at: number,
  source: ReadSource,
) {
  if (!result.listing) {
    await ctx.db.patch(result.id, {
      status: "failed",
      error: result.error ?? "The check failed",
      queuedAt: undefined,
    });
    return;
  }
  const { listing } = result;
  await writeSnapshot(ctx, result.id, at, {
    rating: listing.rating,
    ratingsCount: listing.ratingsCount,
    price: listing.price,
  });
  const key = listing.brand ? brandKey(listing.brand) : "";
  await ctx.db.patch(result.id, {
    ...listing,
    brandKey: key || undefined,
    status: "ok",
    error: undefined,
    source,
    velocity: (await velocityOf(ctx, result.id, at)) ?? undefined,
    queuedAt: undefined,
    checkedAt: at,
  });
}

const vSource = v.union(v.literal("live"), v.literal("sandbox"));

export const record = internalMutation({
  args: { at: v.number(), source: vSource, results: v.array(vResult) },
  handler: async (ctx, { at, source, results }) => {
    const touched = new Set<Id<"watchlists">>();
    for (const result of results) {
      const product = await ctx.db.get(result.id);
      if (!product) continue;
      touched.add(product.watchlistId);
      await applyReading(ctx, result, at, source);
    }
    for (const id of touched) await ctx.db.patch(id, { refreshedAt: at });
  },
});

/** Daily: re-check every watched product, spread over time in batches. */
export const refreshAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { products } = await loadScope(ctx);
    await queueChecks(
      ctx,
      products.map((row) => row._id),
    );
    return products.length;
  },
});

// ── Turning prospects into CRM records ──────────────────────────────────────

async function brandDecision(ctx: MutationCtx, key: string) {
  const products = await ctx.db
    .query("watchedProducts")
    .withIndex("by_brand", (q) => q.eq("brandKey", key))
    .collect();
  const live = products.filter((row) => !row.removedAt && row.brand);
  if (live.length === 0) notFound("Brand");
  const existing = await ctx.db
    .query("prospectBrands")
    .withIndex("by_brand", (q) => q.eq("brandKey", key))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("prospectBrands", {
    brandKey: key,
    brand: live[0].brand!,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

/** Links a brand's listings to an account (or unlinks with null); returns the previous link. */
export const linkAccount = memberMutation({
  args: { key: v.string(), accountId: v.union(v.id("accounts"), v.null()) },
  handler: async (ctx, { key, accountId }) => {
    const decision = await brandDecision(ctx, key);
    const previous = decision.accountId ?? null;
    if (previous === accountId) return previous;
    if (accountId) {
      const account = await requireAccount(ctx, accountId);
      if (account.archivedAt) invalid("accountId", "That account is archived");
      await logSystem(
        ctx,
        { accountId },
        `linked ${decision.brand}'s marketplace listings`,
        undefined,
        ctx.viewer._id,
      );
    }
    await ctx.db.patch(decision._id, {
      accountId: accountId ?? undefined,
      updatedAt: Date.now(),
    });
    return previous;
  },
});

async function openLeadFor(ctx: MutationCtx, decision: Doc<"prospectBrands">) {
  const lead = decision.leadId ? await ctx.db.get(decision.leadId) : null;
  return lead && isOpen(lead) ? lead : null;
}

/** Creates the brand's lead, opening with its review-gap talking point, and remembers it on the brand. */
async function prospectLead(
  ctx: MutationCtx,
  decision: Doc<"prospectBrands">,
  lead: Omit<NewLead, "companyName">,
  subject: string,
  actorId?: Id<"members">,
) {
  const { id } = await createLead(
    ctx,
    { ...lead, companyName: decision.brand },
    { announce: actorId ? false : "lead_new" },
  );
  await logSystem(ctx, { leadId: id }, subject, lead.message, actorId);
  await ctx.db.patch(decision._id, { leadId: id, updatedAt: Date.now() });
  return id;
}

/** A lead for a brand, owned by the viewer, opening with the review-gap talking point. */
export const createProspectLead = memberMutation({
  args: {
    key: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const decision = await brandDecision(ctx, args.key);
    if (await openLeadFor(ctx, decision)) {
      fail("conflict", `${decision.brand} already has an open lead`);
    }
    const email = args.email?.trim()
      ? (normalizeEmail(args.email) ?? invalid("email", "Enter a valid email"))
      : undefined;
    const phone = args.phone?.trim()
      ? (normalizePhone(args.phone) ??
        invalid("phone", "Enter a mobile number like 98200 12345"))
      : undefined;
    const message = cleanText(args.message);
    if (!message) invalid("message", "Add the talking point");
    if (message.length > 2000)
      invalid("message", "Keep it under 2,000 characters");
    const name = cleanText(args.name) ?? decision.brand;
    if (name.length > 120) invalid("name", "Name is too long");
    const id = await prospectLead(
      ctx,
      decision,
      {
        kind: "manual",
        name,
        email,
        phone,
        message,
        source: "prospecting",
        utm: {},
        ownerId: ctx.viewer._id,
        // Owning a lead you created counts as the first touch, as for manual leads.
        firstTouchedAt: Date.now(),
      },
      `created the lead from ${decision.brand}'s marketplace review gap`,
      ctx.viewer._id,
    );
    return { id, href: leadHref(id) };
  },
});

// ── Public review-gap check ─────────────────────────────────────────────────

const MIN_FILL_MS = 1500;

const auditOrigins = () => allowedOrigins("LEAD_FORM_ORIGINS", siteOrigins());

export const reviewGapPreflight = httpAction(async (_ctx, request) =>
  preflight(request, auditOrigins()),
);

/**
 * Public "How far behind is your listing?" check: reads one listing with the
 * same scraper and scoring as Prospecting, files it under Inbound audits and
 * opens a lead with the visitor's consent. CORS-limited, rate-limited per IP
 * and honeypot-guarded like the demo form; the hourly check budget is shared
 * by every visitor so the public page can't run the scraper hot.
 */
export const reviewGap = httpAction(async (ctx, request) => {
  const origins = auditOrigins();
  const cors = corsHeaders(request, origins);
  if (!originAllowed(request, origins)) {
    return json({ ok: false, error: "Origin not allowed" }, 403, cors);
  }
  const ip = clientIp(request);
  const limited = await rateLimiter.limit(ctx, "leadForm", {
    key: `review-gap:${ip}`,
  });
  if (!limited.ok) {
    return json(
      { ok: false, error: "Too many checks. Try again in a minute." },
      429,
      { ...cors, "Retry-After": "60" },
    );
  }
  const body = await readJson(request);
  if (!body.ok)
    return json({ ok: false, error: body.error }, body.status, cors);
  const { value } = body;
  const elapsed = Number(value.elapsedMs);
  const trapped = typeof value.fax === "string" && value.fax.trim() !== "";
  if (trapped || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    return json({ ok: true, report: null }, 200, cors);
  }
  const parsed = parseReviewGap(value);
  if (!parsed.ok) {
    return json(
      {
        ok: false,
        error: "Check the highlighted fields",
        errors: parsed.errors,
      },
      422,
      cors,
    );
  }
  const budget = await rateLimiter.limit(ctx, "productChecks", {
    key: "public",
  });
  if (!budget.ok) {
    return json(
      {
        ok: false,
        error: "We're checking a lot of listings right now. Try again shortly.",
      },
      429,
      { ...cors, "Retry-After": String(Math.ceil(budget.retryAfter / 1000)) },
    );
  }
  const { listing, ...contact } = parsed.value;
  const at = Date.now();
  const { source, results } = await readListings(
    [{ id: listing.key, url: listing.url }],
    at,
  );
  const report = await ctx.runMutation(internal.prospecting.recordAudit, {
    at,
    source,
    url: listing.url,
    marketplace: listing.marketplace,
    identifier: listing.identifier,
    listingKey: listing.key,
    reading: toReading(results[0]),
    contact,
    ip: ip === "unknown" ? undefined : ip,
  });
  return json({ ok: true, report }, 200, cors);
});

const vReading = v.object({
  error: v.optional(v.string()),
  listing: vResult.fields.listing,
});

function toReading(result: ScrapeResult) {
  const { id, ...reading } = toRecord(result);
  void id;
  return reading;
}

async function inboundSource(ctx: MutationCtx, memberId: Id<"members">) {
  const lists = await liveWatchlists(ctx);
  const existing = [...lists.values()].find(isInbound);
  if (existing) return existing._id;
  return await ctx.db.insert("watchlists", {
    name: INBOUND_SOURCE,
    createdById: memberId,
    updatedAt: Date.now(),
  });
}

export const recordAudit = internalMutation({
  args: {
    at: v.number(),
    source: vSource,
    url: v.string(),
    marketplace: v.string(),
    identifier: v.string(),
    listingKey: v.string(),
    reading: vReading,
    contact: v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      utm: v.record(v.string(), v.string()),
      referrer: v.optional(v.string()),
      landingPage: v.optional(v.string()),
    }),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const keeper =
      members.find((member) => member.role === "admin") ?? members[0];
    if (!keeper) fail("conflict", "The CRM has no active members yet");
    const watchlistId = await inboundSource(ctx, keeper._id);
    const existing = await ctx.db
      .query("watchedProducts")
      .withIndex("by_watchlist_listing", (q) =>
        q.eq("watchlistId", watchlistId).eq("listingKey", args.listingKey),
      )
      .unique();
    const productId =
      existing?._id ??
      (await ctx.db.insert("watchedProducts", {
        watchlistId,
        marketplace: args.marketplace,
        identifier: args.identifier,
        listingKey: args.listingKey,
        url: args.url,
        status: "pending",
        addedById: keeper._id,
      }));
    if (existing?.removedAt) {
      await ctx.db.patch(productId, { removedAt: undefined });
    }
    await applyReading(
      ctx,
      { id: productId, ...args.reading },
      args.at,
      args.source,
    );
    await ctx.db.patch(watchlistId, { refreshedAt: args.at });

    const product = (await ctx.db.get(productId))!;
    const row = product.brandKey
      ? scoreScope(await loadScope(ctx, [product.brandKey])).find(
          (item) => item._id === productId,
        )
      : undefined;
    const pitch =
      row?.score && row.benchmark && row.score.gap > 0
        ? talkingPoint({
            title: row.title ?? row.identifier,
            marketplace: row.marketplace,
            ratingsCount: row.ratingsCount!,
            benchmark: row.benchmark,
          })
        : null;

    const { contact } = args;
    const message = [
      pitch ?? `Ran a review-gap check on ${args.url}`,
      row?.score?.reasons.join(". "),
    ]
      .filter(Boolean)
      .join("\n\n");
    const consent = {
      text: REVIEW_GAP_CONSENT,
      source: REVIEW_GAP_LEAD_SOURCE,
      ip: args.ip,
    };
    const decision = product.brand
      ? await brandDecision(ctx, product.brandKey!)
      : null;
    const open = decision ? await openLeadFor(ctx, decision) : null;
    let leadId = open?._id;
    if (open) {
      await logSystem(
        ctx,
        { leadId: open._id },
        "ran the public review-gap check again",
        message,
      );
    } else {
      const lead: NewLead = {
        kind: "contact",
        name:
          contact.name ??
          contact.email ??
          `${product.brand ?? "Review-gap"} contact`,
        email: contact.email,
        phone: contact.phone,
        companyName: product.brand ?? product.title ?? args.url,
        message,
        source: REVIEW_GAP_LEAD_SOURCE,
        utm: contact.utm,
        referrer: contact.referrer,
        landingPage: contact.landingPage,
      };
      leadId = decision
        ? await prospectLead(
            ctx,
            decision,
            lead,
            `created the lead from a public review-gap check on ${marketplaceName(args.marketplace)}`,
          )
        : (await createLead(ctx, lead)).id;
    }
    await recordConsents(ctx, leadId!, contact, consent);

    if (!row || product.status !== "ok") return null;
    return {
      title: row.title ?? row.identifier,
      brand: row.brand,
      marketplace: row.marketplace,
      rating: row.rating,
      ratingsCount: row.ratingsCount,
      velocity: row.velocity,
      benchmark: row.benchmark,
      score: row.score,
      band: row.score ? scoreBand(row.score.score) : null,
      talkingPoint: pitch,
      sandbox: args.source === "sandbox",
    };
  },
});

// ── Demo data ───────────────────────────────────────────────────────────────

const DEMO_NAME = "Hair & skin care (demo)";
const DEMO_DAYS = 21;
const DEMO_URLS = [
  "https://www.amazon.in/Kesarleaf-Saffron-Face-Serum/dp/B0D4KL7Q21",
  "https://www.nykaa.com/kesarleaf-kumkumadi-face-cream/p/7731042",
  "https://www.flipkart.com/glowtheory-vitamin-c-face-serum/p/itm5a8d2e7c41b9",
  "https://www.amazon.in/Glowtheory-Niacinamide-Face-Toner/dp/B0C9TQ4M8X",
  "https://www.amazon.in/Ojasveda-Bhringraj-Hair-Oil/dp/B0BX2R7HJK",
  "https://www.nykaa.com/ojasveda-onion-hair-shampoo/p/6610385",
  "https://www.purplle.com/product/neelam-botanicals-rosemary-hair-oil-48213",
  "https://www.amazon.in/Neelam-Botanicals-Rice-Water-Shampoo/dp/B0CQ8N2V5L",
  "https://www.myntra.com/face-serum/rangrez/rangrez-retinol-night-face-serum/26118034/buy",
  "https://www.amazon.in/Doodhwala-Ceramide-Face-Moisturiser/dp/B0B7P3KX2W",
  "https://www.flipkart.com/doodhwala-hair-growth-onion-shampoo/p/itm3c1f9a2b7d40",
  "https://www.amazon.in/Gulmohar-Kesar-Ubtan-Face-Wash/dp/B09XK2M7QZ",
];

/** Seeds one demo watchlist with three weeks of sandbox history. Safe to run twice. */
export const seedDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const lists = await ctx.db.query("watchlists").collect();
    if (lists.some((row) => row.name === DEMO_NAME && !row.deletedAt)) {
      return "exists";
    }
    const members = await ctx.db.query("members").collect();
    const owner =
      members.find((row) => row.role === "admin" && row.status === "active") ??
      members.find((row) => row.status === "active");
    if (!owner) return "no members";
    const now = Date.now();
    const watchlistId = await ctx.db.insert("watchlists", {
      name: DEMO_NAME,
      createdById: owner._id,
      refreshedAt: now,
      updatedAt: now,
    });
    for (const url of DEMO_URLS) {
      const parsed = parseProductUrl(url);
      if (!parsed.ok) continue;
      const id = await ctx.db.insert("watchedProducts", {
        watchlistId,
        marketplace: parsed.marketplace,
        identifier: parsed.identifier,
        listingKey: parsed.key,
        url: parsed.url,
        status: "pending",
        addedById: owner._id,
      });
      let last: ScrapeResult | null = null;
      for (let day = DEMO_DAYS; day >= 0; day--) {
        const at = now - day * DAY_MS;
        last = sandboxScrape({ id, url: parsed.url }, at);
        if (!last.ok) break;
        await writeSnapshot(ctx, id, at, {
          rating: last.listing.rating ?? undefined,
          ratingsCount: last.listing.ratingsCount ?? undefined,
          price: last.listing.price ?? undefined,
        });
      }
      await applyReading(ctx, toRecord(last!), now, "sandbox");
    }
    return `seeded ${DEMO_URLS.length} products`;
  },
});
