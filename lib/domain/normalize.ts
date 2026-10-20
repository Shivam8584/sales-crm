/**
 * Input normalisation shared by forms (live feedback) and Convex mutations
 * (the authority). Each `normalize*` returns null for input that is not valid.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const LINKEDIN_HANDLE = /^[a-z0-9-]{3,100}$/i;
const MAX_TAG_LENGTH = 32;
const MAX_TAGS = 12;

export function cleanText(input: string | undefined | null) {
  const value = (input ?? "").trim().replace(/\s+/g, " ");
  return value || undefined;
}

export function normalizeEmail(input: string) {
  const value = input.trim().toLowerCase();
  return EMAIL_PATTERN.test(value) ? value : null;
}

/**
 * E.164 for any `+`-prefixed number and for Indian mobiles written the common
 * ways (`98200 12345`, `098200…`, `91 98200…`); other numbers are rejected
 * because their country can't be inferred.
 */
export function normalizePhone(input: string) {
  const value = input.trim();
  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (INDIAN_MOBILE.test(digits)) return `+91${digits}`;
  if (
    digits.length === 11 &&
    digits.startsWith("0") &&
    INDIAN_MOBILE.test(digits.slice(1))
  ) {
    return `+91${digits.slice(1)}`;
  }
  if (
    digits.length === 12 &&
    digits.startsWith("91") &&
    INDIAN_MOBILE.test(digits.slice(2))
  ) {
    return `+${digits}`;
  }
  return null;
}

export function formatPhone(phone: string) {
  const indian = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return indian ? `+91 ${indian[1]} ${indian[2]}` : phone;
}

/** Host of a URL or bare domain, without scheme, `www.` or path. */
export function normalizeDomain(input: string) {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
  return DOMAIN_PATTERN.test(host) ? host : null;
}

export function normalizeLinkedin(input: string) {
  const value = input.trim();
  if (LINKEDIN_HANDLE.test(value))
    return `https://www.linkedin.com/in/${value}`;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return path ? `https://www.linkedin.com${path}` : null;
}

export function cleanTags(tags: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result.slice(0, MAX_TAGS);
}

export function isValidDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
}
