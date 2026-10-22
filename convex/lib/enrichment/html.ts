import { checkGstin } from "../../../lib/domain/gstin";
import type { PageMeta } from "./waterfall";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1].toLowerCase() === "x"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function tidy(text: string | undefined, max: number) {
  const value = decode(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return value ? value.slice(0, max) : undefined;
}

function attributes(tag: string) {
  const found: Record<string, string> = {};
  for (const match of tag.matchAll(
    /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
  )) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return found;
}

function httpsUrl(href: string | undefined, base: string) {
  if (!href) return undefined;
  try {
    const url = new URL(decode(href).trim(), base);
    if (url.protocol !== "https:" || url.username || url.password) {
      return undefined;
    }
    return url.href.slice(0, 300);
  } catch {
    return undefined;
  }
}

/** Reads the head of a page: title, description, site name and canonical URL. */
export function extractMeta(html: string, baseUrl: string) {
  const end = html.search(/<\/head\s*>/i);
  const head = end > 0 ? html.slice(0, end) : html.slice(0, 100_000);
  const meta: Record<string, string> = {};
  for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) {
      meta[key] = attrs.content;
    }
  }
  let canonical: string | undefined;
  for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (/(^|\s)canonical(\s|$)/i.test(attrs.rel ?? "")) {
      canonical = httpsUrl(attrs.href, baseUrl);
      break;
    }
  }
  return {
    title: tidy(/<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)?.[1], 200),
    description: tidy(meta.description ?? meta["og:description"], 500),
    siteName: tidy(meta["og:site_name"], 120),
    ogTitle: tidy(meta["og:title"], 200),
    canonical,
  };
}

const GSTIN_IN_TEXT =
  /(?<![0-9A-Z])\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z](?![0-9A-Z])/g;

function visibleText(html: string) {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  );
}

/** GSTINs printed on the page whose check character is right, in order of appearance. */
export function findGstins(html: string, max = 5) {
  const found: string[] = [];
  for (const match of visibleText(html).toUpperCase().matchAll(GSTIN_IN_TEXT)) {
    const check = checkGstin(match[0]);
    if (check.ok && !found.includes(check.gstin)) found.push(check.gstin);
    if (found.length >= max) break;
  }
  return found;
}

const SEPARATORS = /\s+[|\-–—·•:]\s+/;

function squash(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The brand as the site writes it: `og:site_name`, else the title segment
 * that matches the domain ("Shop | Baybee" on baybee.co.in).
 */
export function brandName(
  meta: Pick<PageMeta, "siteName" | "title">,
  domain: string,
) {
  if (meta.siteName) return { name: meta.siteName, confidence: 0.7 };
  const label = squash(domain.replace(/^www\./, "").split(".")[0] ?? "");
  if (label.length < 3 || !meta.title) return null;
  for (const segment of meta.title.split(SEPARATORS)) {
    const key = squash(segment);
    if (key.length >= 3 && (key.includes(label) || label.includes(key))) {
      return { name: segment.trim().slice(0, 120), confidence: 0.6 };
    }
  }
  return null;
}

export function pageMeta(html: string, url: string): PageMeta {
  const meta = extractMeta(html, url);
  return {
    url,
    title: meta.title ?? meta.ogTitle,
    siteName: meta.siteName,
    description: meta.description,
    canonical: meta.canonical,
    gstins: findGstins(html),
  };
}
