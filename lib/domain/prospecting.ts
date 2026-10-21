/**
 * Marketplace prospecting: reading product links, grouping listings by brand
 * and scoring the review gap between a brand's products and the leaders in
 * the same category. Pure, so forms, Convex functions and tests share it.
 */

import { UTM_KEYS, type Utm } from "./leads";
import { cleanText, normalizeEmail, normalizePhone } from "./normalize";

export const MARKETPLACES = [
  "amazon",
  "flipkart",
  "myntra",
  "nykaa",
  "ajio",
  "meesho",
  "purplle",
  "tatacliq",
  "snapdeal",
  "firstcry",
  "jiomart",
  "bigbasket",
  "blinkit",
  "zepto",
  "swiggyinstamart",
  "croma",
  "reliancedigital",
] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

type MarketplaceDef = {
  name: string;
  hosts: string[];
  /** Group 1 is the product id; mirrors the scraper's own routing. */
  id: RegExp;
  upper?: boolean;
};

export const MARKETPLACE: Record<Marketplace, MarketplaceDef> = {
  amazon: {
    name: "Amazon",
    hosts: ["amazon.in", "amazon.com"],
    id: /\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})(?:[/?]|$)/i,
    upper: true,
  },
  flipkart: {
    name: "Flipkart",
    hosts: ["flipkart.com"],
    id: /\/p\/(itm[a-z0-9]+)/i,
  },
  myntra: { name: "Myntra", hosts: ["myntra.com"], id: /\/(\d+)\/buy/i },
  nykaa: { name: "Nykaa", hosts: ["nykaa.com"], id: /\/p\/(\d+)/i },
  ajio: {
    name: "AJIO",
    hosts: ["ajio.com"],
    id: /\/p\/(\d+(?:_[a-z0-9-]+)?)/i,
  },
  meesho: { name: "Meesho", hosts: ["meesho.com"], id: /\/p\/([a-z0-9]+)/i },
  purplle: {
    name: "Purplle",
    hosts: ["purplle.com"],
    id: /\/product\/[\w-]+?-(\d+)(?:$|[/?])/i,
  },
  tatacliq: {
    name: "Tata CLiQ",
    hosts: ["tatacliq.com"],
    id: /\/p-(mp[0-9]+)/i,
    upper: true,
  },
  snapdeal: {
    name: "Snapdeal",
    hosts: ["snapdeal.com"],
    id: /\/product\/[^/]+\/(\d+)/i,
  },
  firstcry: {
    name: "FirstCry",
    hosts: ["firstcry.com"],
    id: /\/(\d+)\/product-detail/i,
  },
  jiomart: {
    name: "JioMart",
    hosts: ["jiomart.com"],
    id: /\/product\/[a-z0-9-]+-(\d+)(?:$|[/?])/i,
  },
  bigbasket: {
    name: "BigBasket",
    hosts: ["bigbasket.com"],
    id: /\/pd\/(\d+)/i,
  },
  blinkit: { name: "Blinkit", hosts: ["blinkit.com"], id: /\/prid\/(\d+)/i },
  zepto: {
    name: "Zepto",
    hosts: ["zeptonow.com", "zepto.com"],
    id: /\/pvid\/([0-9a-f-]+)/i,
  },
  swiggyinstamart: {
    name: "Instamart",
    hosts: ["swiggy.com"],
    id: /\/instamart\/item\/([\w-]+)/i,
  },
  croma: { name: "Croma", hosts: ["croma.com"], id: /\/p\/(\d+)/i },
  reliancedigital: {
    name: "Reliance Digital",
    hosts: ["reliancedigital.in"],
    id: /-(\d+)(?:\/|$|\?)/i,
  },
};

const SHORT_LINK_HOSTS = [
  "amzn.in",
  "amzn.to",
  "amzn.eu",
  "fkrt.it",
  "fkrt.co",
  "myntr.it",
  "nykaa.me",
];
const NOT_PRODUCT_HOSTS = [
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "zomato.com",
  "play.google.com",
  "apps.apple.com",
];

export const MAX_IMPORT_URLS = 200;
export const MAX_WATCHLIST_PRODUCTS = 500;

/** The source public review-gap checks land in; its listings are scored against every other source. */
export const INBOUND_SOURCE = "Inbound audits";
export const REVIEW_GAP_LEAD_SOURCE = "review_gap";
export const REVIEW_GAP_CONSENT =
  "I agree that Hypedrive may contact me about this report by email, phone or WhatsApp.";

export function marketplaceName(slug: string) {
  return MARKETPLACE[slug as Marketplace]?.name ?? slug;
}

function hostMatches(host: string, base: string) {
  return host === base || host.endsWith(`.${base}`);
}

export type ParsedUrl =
  | {
      ok: true;
      marketplace: Marketplace;
      identifier: string;
      /** The product page without tracking parameters. */
      url: string;
      /** `marketplace:identifier`, lower-cased; one listing per key per watchlist. */
      key: string;
    }
  | { ok: false; reason: string };

/** Reads a pasted product link: marketplace, product id and a clean URL. */
export function parseProductUrl(input: string): ParsedUrl {
  const raw = input.trim().replace(/^[<"'(]+|[>"'),;]+$/g, "");
  if (!raw) return { ok: false, reason: "Empty link" };
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`,
    );
  } catch {
    return { ok: false, reason: "Not a valid link" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Not a web link" };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return { ok: false, reason: "Not a valid link" };
  if (SHORT_LINK_HOSTS.some((base) => hostMatches(host, base))) {
    return {
      ok: false,
      reason:
        "Short links hide the product id. Open it and paste the full link.",
    };
  }
  const swiggyFood =
    hostMatches(host, "swiggy.com") &&
    !url.pathname.toLowerCase().startsWith("/instamart");
  if (swiggyFood || NOT_PRODUCT_HOSTS.some((base) => hostMatches(host, base))) {
    return { ok: false, reason: "Not a product marketplace" };
  }
  const marketplace = MARKETPLACES.find((slug) =>
    MARKETPLACE[slug].hosts.some((base) => hostMatches(host, base)),
  );
  if (!marketplace) return { ok: false, reason: "Marketplace not supported" };
  const def = MARKETPLACE[marketplace];
  const match = def.id.exec(`${url.pathname}${url.search}`);
  if (!match) {
    return {
      ok: false,
      reason: `No product id in this ${def.name} link. Use the product page link.`,
    };
  }
  const identifier = def.upper ? match[1].toUpperCase() : match[1];
  const baseHost = def.hosts.find((base) => hostMatches(host, base))!;
  const slug = /^\/([^/]+)\/(?:dp|gp)\//i.exec(url.pathname)?.[1];
  const clean =
    marketplace === "amazon"
      ? `https://www.${baseHost}/${slug && slug.length < 120 ? `${slug}/` : ""}dp/${identifier}`
      : `https://${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  return {
    ok: true,
    marketplace,
    identifier,
    url: clean,
    key: `${marketplace}:${identifier.toLowerCase()}`,
  };
}

export type UrlListEntry = {
  line: number;
  input: string;
} & (
  | {
      status: "ready";
      marketplace: Marketplace;
      identifier: string;
      url: string;
      key: string;
    }
  | { status: "invalid" | "duplicate"; reason: string }
);

const LINK_TOKEN =
  /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s,;"'<>]*|https?:\/\/[^\s,;"'<>]+/gi;

/**
 * Links from a textarea or a CSV file: every cell that looks like a link,
 * one result per link. Lines without a link are reported, except a header row.
 */
export function parseUrlList(text: string): UrlListEntry[] {
  const out: UrlListEntry[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  lines.forEach((content, index) => {
    const line = index + 1;
    const trimmed = content.trim();
    if (!trimmed) return;
    const tokens = trimmed.match(LINK_TOKEN) ?? [];
    if (tokens.length === 0) {
      const header = out.length === 0 && !/[./]/.test(trimmed);
      if (!header) {
        out.push({
          line,
          input: trimmed,
          status: "invalid",
          reason: "No link found",
        });
      }
      return;
    }
    for (const token of tokens) {
      const parsed = parseProductUrl(token);
      if (!parsed.ok) {
        out.push({
          line,
          input: token,
          status: "invalid",
          reason: parsed.reason,
        });
      } else if (seen.has(parsed.key)) {
        out.push({
          line,
          input: token,
          status: "duplicate",
          reason: "Listed twice",
        });
      } else {
        seen.add(parsed.key);
        out.push({
          line,
          input: token,
          status: "ready",
          marketplace: parsed.marketplace,
          identifier: parsed.identifier,
          url: parsed.url,
          key: parsed.key,
        });
      }
    }
  });
  return out;
}

const COMPANY_SUFFIX =
  /\b(private|pvt|limited|ltd|llp|inc|india|official|store|shop|co|company|the)\b/g;

/** Comparable brand name: "Mamaearth India Pvt. Ltd." → "mamaearth". */
export function brandKey(name: string | null | undefined) {
  const base = (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ");
  const stripped = base.replace(COMPANY_SUFFIX, " ").replace(/\s+/g, "");
  return stripped || base.replace(/\s+/g, "");
}

/** The registrable label of a domain: "shop.mamaearth.in" → "mamaearth". */
export function domainKey(domain: string | null | undefined) {
  if (!domain) return "";
  const labels = domain
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".");
  if (labels.length < 2) return brandKey(labels[0]);
  const secondLevel = ["co", "com", "net", "org", "gov", "ac"];
  const index =
    labels.length >= 3 && secondLevel.includes(labels[labels.length - 2])
      ? labels.length - 3
      : labels.length - 2;
  return brandKey(labels[index]);
}

export function sameBrand(
  key: string,
  account: { name: string; domain?: string | null },
) {
  return (
    key.length > 1 &&
    (brandKey(account.name) === key || domainKey(account.domain) === key)
  );
}

const DAY_MS = 24 * 60 * 60_000;
const WEEK_MS = 7 * DAY_MS;
export const VELOCITY_WINDOW_DAYS = 28;

export type CountPoint = { at: number; count: number };

/**
 * Ratings gained per week across the tracked window, from the first and last
 * readings in it. Null until readings span at least a day.
 */
export function velocity(
  points: CountPoint[],
  now: number,
  windowDays = VELOCITY_WINDOW_DAYS,
): number | null {
  const since = now - windowDays * DAY_MS;
  const inWindow = points
    .filter((point) => point.at >= since && point.at <= now)
    .sort((a, b) => a.at - b.at);
  if (inWindow.length < 2) return null;
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  if (last.at - first.at < DAY_MS) return null;
  const gained = Math.max(0, last.count - first.count);
  return Math.round((gained / (last.at - first.at)) * WEEK_MS * 10) / 10;
}

/** UTC calendar day `YYYY-MM-DD`. */
export function dayOf(at: number) {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Ratings gained on each of the last `days` days, oldest first. A day with no
 * reading gains nothing; the next reading carries the whole difference.
 */
export function dailyGains(points: CountPoint[], now: number, days = 14) {
  const lastByDay = new Map<string, number>();
  for (const point of [...points].sort((a, b) => a.at - b.at)) {
    lastByDay.set(dayOf(point.at), point.count);
  }
  const start = now - (days - 1) * DAY_MS;
  let previous: number | null = null;
  for (const point of [...points].sort((a, b) => a.at - b.at)) {
    if (dayOf(point.at) < dayOf(start)) previous = point.count;
  }
  const gains: number[] = [];
  for (let index = 0; index < days; index++) {
    const count = lastByDay.get(dayOf(start + index * DAY_MS));
    if (count === undefined) {
      gains.push(0);
      continue;
    }
    gains.push(previous === null ? 0 : Math.max(0, count - previous));
    previous = count;
  }
  return gains;
}

export const BENCHMARK_TOP = 5;
export const BENCHMARK_MIN_PEERS = 3;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** How many of a peer group count as its leaders: the top quarter, one to five. */
export function leaderCount(peers: number) {
  return Math.min(BENCHMARK_TOP, Math.max(1, Math.ceil(peers / 4)));
}

/** Median ratings count of a peer group's leaders; null with too few peers. */
export function benchmarkOf(counts: number[], minPeers = BENCHMARK_MIN_PEERS) {
  if (counts.length < minPeers) return null;
  return median(
    [...counts].sort((a, b) => b - a).slice(0, leaderCount(counts.length)),
  );
}

export type BenchmarkSource = "set" | "category" | "watchlist";

export type PeerProduct = {
  id: string;
  category: string | null;
  ratingsCount: number | null;
  velocity: number | null;
};

export type Benchmark = {
  ratings: number;
  source: BenchmarkSource;
  /** Median weekly velocity of the leaders the benchmark came from. */
  leaderVelocity: number | null;
  peers: number;
};

/**
 * The benchmark for each product of one watchlist: a set number wins, then the
 * leaders of the same category, then the leaders of the whole watchlist.
 */
export function benchmarksFor(
  products: PeerProduct[],
  setBenchmark: number | null = null,
): Map<string, Benchmark | null> {
  const rated = products.filter(
    (product): product is PeerProduct & { ratingsCount: number } =>
      product.ratingsCount !== null,
  );
  const leaderVelocity = (group: typeof rated) => {
    const leaders = [...group]
      .sort((a, b) => b.ratingsCount - a.ratingsCount)
      .slice(0, leaderCount(group.length))
      .map((item) => item.velocity)
      .filter((value): value is number => value !== null);
    return leaders.length ? median(leaders) : null;
  };
  const whole = benchmarkOf(rated.map((item) => item.ratingsCount));
  const byCategory = new Map<string, typeof rated>();
  for (const product of rated) {
    const key = product.category?.trim().toLowerCase();
    if (!key) continue;
    byCategory.set(key, [...(byCategory.get(key) ?? []), product]);
  }
  const out = new Map<string, Benchmark | null>();
  for (const product of products) {
    if (setBenchmark !== null && setBenchmark > 0) {
      out.set(product.id, {
        ratings: setBenchmark,
        source: "set",
        leaderVelocity: leaderVelocity(rated),
        peers: rated.length,
      });
      continue;
    }
    const peers = byCategory.get(product.category?.trim().toLowerCase() ?? "");
    const categoryBenchmark = peers
      ? benchmarkOf(peers.map((item) => item.ratingsCount))
      : null;
    if (peers && categoryBenchmark !== null) {
      out.set(product.id, {
        ratings: categoryBenchmark,
        source: "category",
        leaderVelocity: leaderVelocity(peers),
        peers: peers.length,
      });
    } else if (whole !== null) {
      out.set(product.id, {
        ratings: whole,
        source: "watchlist",
        leaderVelocity: leaderVelocity(rated),
        peers: rated.length,
      });
    } else out.set(product.id, null);
  }
  return out;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const SCORE_WEIGHTS = { gap: 60, pace: 25, quality: 15 } as const;

export type ScoreInput = {
  ratingsCount: number | null;
  rating: number | null;
  velocity: number | null;
  benchmark: Benchmark | null;
};

export type Score = {
  score: number;
  /** Ratings short of the benchmark, never negative. */
  gap: number;
  /** Share of the benchmark reached, 0–1. */
  share: number;
  /** Weeks to reach the benchmark at the current pace; null when unknown or never. */
  weeksToClose: number | null;
  reasons: string[];
};

const number = new Intl.NumberFormat("en-IN");
export const formatCount = (value: number) => number.format(value);

function qualityTerm(rating: number | null) {
  if (rating === null) return 0.5;
  if (rating >= 4.2) return 1;
  if (rating >= 3.8) return 0.7;
  if (rating >= 3.3) return 0.4;
  return 0.15;
}

function spokenWeeks(weeks: number) {
  if (weeks < 8) return `about ${Math.max(1, Math.round(weeks))} weeks`;
  if (weeks < 104) return `about ${Math.round(weeks / 4.345)} months`;
  if (weeks <= 260) return `about ${Math.round(weeks / 52)} years`;
  return "over 5 years";
}

const BENCHMARK_LABEL: Record<BenchmarkSource, string> = {
  set: "your benchmark",
  category: "category leaders",
  watchlist: "leaders in the source",
};

/**
 * 0–100: how much a listing needs reviews. Mostly the gap to the benchmark,
 * then how slowly it is closing, then whether the product is rated well
 * enough that reviews would convert.
 */
export function scoreProduct(input: ScoreInput): Score | null {
  const { ratingsCount, rating, velocity: pace, benchmark } = input;
  if (ratingsCount === null || benchmark === null || benchmark.ratings <= 0) {
    return null;
  }
  const gap = Math.max(0, benchmark.ratings - ratingsCount);
  const share = clamp01(ratingsCount / benchmark.ratings);
  const weeksToClose =
    gap === 0 ? 0 : pace !== null && pace > 0 ? gap / pace : null;
  const paceTerm =
    gap === 0
      ? 0
      : pace === null
        ? 0.5
        : weeksToClose === null
          ? 1
          : clamp01(weeksToClose / 52);
  const score = Math.round(
    SCORE_WEIGHTS.gap * (1 - share) +
      SCORE_WEIGHTS.pace * paceTerm +
      SCORE_WEIGHTS.quality * qualityTerm(rating),
  );
  const who = BENCHMARK_LABEL[benchmark.source];
  const reasons: string[] = [];
  reasons.push(
    gap === 0
      ? `${formatCount(ratingsCount)} ratings, level with ${who} (${formatCount(benchmark.ratings)})`
      : `${formatCount(ratingsCount)} ratings against ${formatCount(benchmark.ratings)} for ${who}: ${Math.round(share * 100)}% of the way`,
  );
  if (gap > 0) {
    if (pace === null)
      reasons.push("Pace not known yet: needs a few days of history");
    else if (pace === 0) reasons.push("No new ratings in the tracked window");
    else {
      reasons.push(
        `Gaining ${pace} ${pace === 1 ? "rating" : "ratings"} a week: ${spokenWeeks(weeksToClose!)} to catch up${
          benchmark.leaderVelocity
            ? ` (leaders gain ${benchmark.leaderVelocity} a week)`
            : ""
        }`,
      );
    }
  }
  if (rating !== null) {
    reasons.push(
      rating >= 4.2
        ? `Rated ${rating.toFixed(1)}★: a good product short on social proof`
        : rating >= 3.8
          ? `Rated ${rating.toFixed(1)}★: solid, more reviews would lift it`
          : `Rated ${rating.toFixed(1)}★: product issues may hold it back`,
    );
  }
  return { score, gap, share, weeksToClose, reasons };
}

export type ScoreBand = "hot" | "warm" | "cool";

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "hot";
  if (score >= 45) return "warm";
  return "cool";
}

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  hot: "Hot",
  warm: "Warm",
  cool: "Cool",
};

/** Rounds down to two significant figures, for "300+"-style talk. */
export function roundDown(value: number) {
  if (value < 100) return Math.floor(value);
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.floor(value / magnitude) * magnitude;
}

/** Shortens a listing title to its first few words for spoken use. */
export function shortTitle(title: string, words = 6) {
  const parts = title.replace(/\s+/g, " ").trim().split(" ");
  return parts.length > words
    ? `${parts.slice(0, words).join(" ")}…`
    : parts.join(" ");
}

/** The opening line for outreach about a listing's review gap. */
export function talkingPoint(input: {
  title: string;
  marketplace: string;
  ratingsCount: number;
  benchmark: Benchmark;
}) {
  const count = input.ratingsCount;
  return `Your ${shortTitle(input.title)} on ${marketplaceName(input.marketplace)} has ${formatCount(count)} ${count === 1 ? "rating" : "ratings"}; category leaders have ${formatCount(roundDown(input.benchmark.ratings))}+.`;
}

const PUBLIC_TEXT_LIMIT = 200;

function publicText(value: unknown) {
  return typeof value === "string"
    ? cleanText(value.slice(0, PUBLIC_TEXT_LIMIT))
    : undefined;
}

export type ReviewGapField = "url" | "email" | "phone" | "contact" | "consent";
export type ReviewGapErrors = Partial<Record<ReviewGapField, string>>;

/**
 * Validates an untrusted public review-gap submission. The page runs it for
 * instant feedback; the HTTP endpoint runs it again as the authority.
 */
export function parseReviewGap(raw: Record<string, unknown>) {
  const errors: ReviewGapErrors = {};
  const url = publicText(raw.url);
  const listing = parseProductUrl(url ?? "");
  if (!listing.ok) {
    errors.url = url ? listing.reason : "Paste the link to your product page.";
  }
  const emailRaw = publicText(raw.email);
  const phoneRaw = publicText(raw.phone);
  const email = emailRaw ? normalizeEmail(emailRaw) : undefined;
  const phone = phoneRaw ? normalizePhone(phoneRaw) : undefined;
  if (email === null) errors.email = "Enter a valid email address.";
  if (phone === null) {
    errors.phone = "Enter a valid mobile number, like 98200 12345.";
  }
  if (!emailRaw && !phoneRaw) {
    errors.contact = "Add an email or a phone number so we can follow up.";
  }
  if (raw.consent !== true) {
    errors.consent = "Tick the box so we can contact you about the report.";
  }
  if (!listing.ok || Object.keys(errors).length > 0) {
    return { ok: false as const, errors };
  }
  const utmRaw =
    raw.utm && typeof raw.utm === "object"
      ? (raw.utm as Record<string, unknown>)
      : {};
  const utm: Utm = {};
  for (const key of UTM_KEYS) {
    const value = publicText(utmRaw[key]);
    if (value) utm[key] = value;
  }
  return {
    ok: true as const,
    value: {
      listing,
      name: publicText(raw.name),
      email: email ?? undefined,
      phone: phone ?? undefined,
      utm,
      referrer: publicText(raw.referrer),
      landingPage: publicText(raw.landingPage),
    },
  };
}
