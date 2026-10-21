import { CURRENCIES, type Money } from "../../lib/domain/money";
import { parseProductUrl } from "../../lib/domain/prospecting";

/**
 * Client for Hypedrive's scraper-worker (POST /v1/scrape/batch). Nothing here
 * touches the database, so it runs inside Convex actions and in plain Node.
 */

type Env = Record<string, string | undefined>;

export type ScraperMode = "live" | "sandbox" | null;

export const SCRAPER_ENV_HINT =
  "Set SCRAPER_WORKER_URL and SCRAPER_AUTH_TOKEN on the Convex deployment (or SCRAPER_SANDBOX=1 for local test data).";

/** The worker rejects larger batches. */
export const MAX_BATCH = 50;
// 50 items at the worker's fan-out of 8, 2–15 s each, plus browser fallbacks.
const BATCH_TIMEOUT_MS = 150_000;

export type Listing = {
  title: string;
  brand: string | null;
  category: string | null;
  identifier: string | null;
  price: Money | null;
  mrp: Money | null;
  rating: number | null;
  ratingsCount: number | null;
  imageUrl: string | null;
  variants: number;
};

export type ScrapeResult = { id: string } & (
  | { ok: true; listing: Listing }
  | { ok: false; error: string; retryable: boolean }
);

export function scraperMode(env: Env): ScraperMode {
  if (env.SCRAPER_WORKER_URL && env.SCRAPER_AUTH_TOKEN) return "live";
  if (env.SCRAPER_SANDBOX === "1") return "sandbox";
  return null;
}

type Problem = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  retryable?: boolean;
};

type WireMoney = { amount?: unknown; currency?: unknown } | null | undefined;

type WireProduct = {
  title?: unknown;
  brand?: unknown;
  category?: unknown;
  identifier?: unknown;
  sale_price?: WireMoney;
  mrp?: WireMoney;
  images?: { url?: unknown; is_primary?: unknown }[];
  rating?: { value?: unknown; count?: unknown } | null;
  variations?: unknown[];
};

type WireItem = {
  id?: unknown;
  status?: unknown;
  product?: WireProduct;
  error?: Problem;
};

function text(value: unknown, max = 300) {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ");
  return clean ? clean.slice(0, max) : null;
}

function money(value: WireMoney): Money | null {
  if (!value || typeof value.amount !== "number") return null;
  const currency = (CURRENCIES as readonly string[]).includes(
    String(value.currency),
  )
    ? (value.currency as Money["currency"])
    : null;
  if (!currency || !Number.isInteger(value.amount) || value.amount <= 0) {
    return null;
  }
  return { amount: value.amount, currency };
}

export function toListing(product: WireProduct): Listing | null {
  const title = text(product.title);
  if (!title) return null;
  const value = Number(product.rating?.value);
  const count = Number(product.rating?.count);
  const images = Array.isArray(product.images) ? product.images : [];
  const image = images.find((item) => item.is_primary) ?? images[0];
  return {
    title,
    brand: text(product.brand, 120),
    category: text(product.category, 120),
    identifier: text(product.identifier, 120),
    price: money(product.sale_price),
    mrp: money(product.mrp),
    rating:
      product.rating && Number.isFinite(value) && value >= 0 && value <= 5
        ? Math.round(value * 10) / 10
        : null,
    ratingsCount:
      product.rating && Number.isFinite(count) && count >= 0
        ? Math.round(count)
        : null,
    imageUrl: text(image?.url, 1000),
    variants: Array.isArray(product.variations) ? product.variations.length : 0,
  };
}

const PROBLEM_MESSAGE: Record<string, string> = {
  "unsupported-platform": "The scraper doesn't read this marketplace",
  "unknown-platform": "The scraper doesn't know this marketplace",
  "product-not-found": "Product not found: it may be delisted",
  "extraction-failed":
    "Couldn't read the product page; it retries on the next refresh",
  "invalid-request": "The scraper rejected this link",
};

/** A readable message for an RFC 9457 problem from the worker. */
export function problemMessage(problem: Problem | undefined, status: number) {
  const kind = problem?.type?.split("/").pop() ?? "";
  if (PROBLEM_MESSAGE[kind]) return PROBLEM_MESSAGE[kind];
  if (status === 401 || status === 403) {
    return "The scraper rejected the token. Check SCRAPER_AUTH_TOKEN.";
  }
  return (
    problem?.detail ||
    problem?.title ||
    `The scraper returned an error (HTTP ${status})`
  );
}

function retryAfter(header: string | null) {
  const value = header?.trim();
  if (value && /^\d+$/.test(value)) return Number(value);
  const at = value ? Date.parse(value) : NaN;
  return Number.isNaN(at)
    ? 60
    : Math.max(1, Math.ceil((at - Date.now()) / 1000));
}

function failAll(
  items: { id: string }[],
  error: string,
  retryable: boolean,
): ScrapeResult[] {
  return items.map((item) => ({ id: item.id, ok: false, error, retryable }));
}

/** Scrapes up to `MAX_BATCH` links in one call; each item succeeds or fails on its own. */
export async function scrapeBatch(
  env: Env,
  items: { id: string; url: string }[],
  fetchImpl: typeof fetch = fetch,
): Promise<ScrapeResult[]> {
  if (items.length === 0) return [];
  if (items.length > MAX_BATCH) {
    throw new Error(`scrapeBatch takes at most ${MAX_BATCH} links`);
  }
  const base = (env.SCRAPER_WORKER_URL ?? "").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
  let response: Response;
  let body: string;
  try {
    response = await fetchImpl(`${base}/v1/scrape/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, application/problem+json",
        Authorization: `Bearer ${env.SCRAPER_AUTH_TOKEN}`,
      },
      body: JSON.stringify({ requests: items }),
      signal: controller.signal,
    });
    body = await response.text();
  } catch {
    return failAll(
      items,
      controller.signal.aborted
        ? "The scraper took too long to answer"
        : "Couldn't reach the scraper",
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body);
  } catch {}

  if (response.status === 429 || response.status === 503) {
    return failAll(
      items,
      `Scraper busy, retry in ${retryAfter(response.headers.get("Retry-After"))} s`,
      true,
    );
  }
  if (response.status !== 207 && response.status !== 200) {
    return failAll(
      items,
      problemMessage(parsed as Problem | undefined, response.status),
      response.status >= 500,
    );
  }
  const responses = (parsed as { responses?: WireItem[] } | null)?.responses;
  if (!Array.isArray(responses)) {
    return failAll(items, "The scraper sent an unreadable response", true);
  }
  const byId = new Map(responses.map((item) => [String(item.id), item]));
  return items.map((item): ScrapeResult => {
    const result = byId.get(item.id);
    if (!result) {
      return {
        id: item.id,
        ok: false,
        error: "No result for this link",
        retryable: true,
      };
    }
    const status = Number(result.status);
    if (status === 200 && result.product) {
      const listing = toListing(result.product);
      return listing
        ? { id: item.id, ok: true, listing }
        : {
            id: item.id,
            ok: false,
            error: "The page had no product title",
            retryable: true,
          };
    }
    return {
      id: item.id,
      ok: false,
      error: problemMessage(result.error, status),
      retryable: result.error?.retryable ?? status >= 500,
    };
  });
}

// ── Sandbox ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60_000;
const SANDBOX_EPOCH = Date.UTC(2026, 8, 1);

const SANDBOX_BRANDS = [
  "Kesar Leaf",
  "Vayu Naturals",
  "Mitti & Co",
  "Neel Threads",
  "Saffron Ritual",
  "Indigo Home",
];

const CATEGORY_WORDS: [string, string[]][] = [
  ["Hair care", ["hair", "shampoo", "conditioner", "onion", "scalp"]],
  [
    "Skin care",
    [
      "face",
      "serum",
      "cream",
      "sunscreen",
      "moisturi",
      "toner",
      "skin",
      "lotion",
      "wash",
    ],
  ],
  ["Makeup", ["lipstick", "kajal", "foundation", "lip", "mascara", "nail"]],
  ["Apparel", ["shirt", "tee", "kurta", "dress", "jeans", "saree", "hoodie"]],
  [
    "Electronics",
    ["earbuds", "headphone", "speaker", "charger", "watch", "cable"],
  ],
  [
    "Food & beverage",
    ["tea", "coffee", "snack", "honey", "ghee", "masala", "chocolate"],
  ],
  ["Baby care", ["baby", "diaper", "kids"]],
];

function hash(value: string) {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function titleCase(words: string[]) {
  return words
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** The descriptive slug of a product link, e.g. "mamaearth-onion-hair-oil". */
function slugOf(url: URL, marketplace: string) {
  const segments = url.pathname.split("/").filter(Boolean);
  if (marketplace === "myntra" && segments.length >= 4) {
    return { brand: segments[1], slug: segments[2] };
  }
  const slug = segments
    .filter((segment) => /[a-z]/i.test(segment) && segment.includes("-"))
    .sort((a, b) => b.length - a.length)[0];
  return { brand: null, slug: slug ?? null };
}

/**
 * Deterministic stand-in for the worker, keyed by the product id: a listing's
 * ratings grow by a fixed amount a day, so snapshots taken on different days
 * build a believable history. Ids with six zeros in a row are "not found"; ids
 * ending in 9999 fail as an extraction error.
 */
export function sandboxScrape(
  item: { id: string; url: string },
  at: number,
): ScrapeResult {
  const parsed = parseProductUrl(item.url);
  if (!parsed.ok) {
    return { id: item.id, ok: false, error: parsed.reason, retryable: false };
  }
  const { marketplace, identifier } = parsed;
  if (/000000/.test(identifier)) {
    return {
      id: item.id,
      ok: false,
      error: PROBLEM_MESSAGE["product-not-found"],
      retryable: false,
    };
  }
  if (/9999$/.test(identifier)) {
    return {
      id: item.id,
      ok: false,
      error: PROBLEM_MESSAGE["extraction-failed"],
      retryable: true,
    };
  }
  const h = hash(`${marketplace}:${identifier.toLowerCase()}`);
  const url = new URL(parsed.url);
  const { brand: brandSegment, slug } = slugOf(url, marketplace);
  const words = (slug ?? "")
    .toLowerCase()
    .split("-")
    .filter((word) => /^[a-z]+$/.test(word));
  const brand = brandSegment
    ? titleCase(brandSegment.split("-"))
    : words[0]
      ? titleCase([words[0]])
      : SANDBOX_BRANDS[h % SANDBOX_BRANDS.length];
  const haystack = `${slug ?? ""} ${brandSegment ?? ""}`.toLowerCase();
  const category =
    CATEGORY_WORDS.find(([, keys]) =>
      keys.some((key) => haystack.includes(key)),
    )?.[0] ?? CATEGORY_WORDS[(h >>> 5) % CATEGORY_WORDS.length][0];
  const title =
    words.length > 1
      ? titleCase(words)
      : `${brand} ${category} ${["Essentials", "Classic", "Daily", "Pro"][(h >>> 9) % 4]}`;

  const leader = h % 100 < 30;
  const base = leader ? 600 + (h % 5400) : 3 + (h % 180);
  const perDay = leader ? 4 + ((h >>> 7) % 16) : ((h >>> 7) % 40) / 100;
  const days = Math.max(0, (at - SANDBOX_EPOCH) / DAY_MS);
  const rupees = 149 + ((h >>> 13) % 2350);
  const price: Money = { amount: rupees * 100, currency: "INR" };
  return {
    id: item.id,
    ok: true,
    listing: {
      title,
      brand,
      category,
      identifier,
      price,
      mrp:
        (h >>> 3) % 3 === 0
          ? null
          : { amount: Math.round(rupees * 1.25) * 100, currency: "INR" },
      rating:
        Math.round(
          (leader
            ? 3.9 + ((h >>> 11) % 8) / 10
            : 3.2 + ((h >>> 11) % 16) / 10) * 10,
        ) / 10,
      ratingsCount: Math.floor(base + perDay * days),
      imageUrl: null,
      variants: (h >>> 17) % 5,
    },
  };
}
