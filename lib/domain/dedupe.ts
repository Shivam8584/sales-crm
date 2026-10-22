import { normalizeGstin, panRoot } from "./gstin";
import { companyDomain } from "./leads";
import { normalizeEmail, normalizePhone } from "./normalize";

export type Strength = "certain" | "strong" | "medium";

export type ReasonCode =
  | "gstin"
  | "platform"
  | "domain"
  | "name"
  | "similar"
  | "pan"
  | "platformUser"
  | "email"
  | "phone"
  | "personName";

export type Reason = { code: ReasonCode; label: string; strength: Strength };

const REASONS: Record<ReasonCode, Reason> = {
  gstin: { code: "gstin", label: "Same GSTIN", strength: "certain" },
  platform: {
    code: "platform",
    label: "Same platform organisation",
    strength: "certain",
  },
  domain: { code: "domain", label: "Same website", strength: "strong" },
  name: { code: "name", label: "Same name", strength: "strong" },
  similar: { code: "similar", label: "Similar name", strength: "medium" },
  pan: { code: "pan", label: "Same PAN", strength: "medium" },
  platformUser: {
    code: "platformUser",
    label: "Same platform user",
    strength: "certain",
  },
  email: { code: "email", label: "Same email", strength: "certain" },
  phone: { code: "phone", label: "Same phone", strength: "strong" },
  personName: {
    code: "personName",
    label: "Same name at the account",
    strength: "strong",
  },
};

const STRENGTH_RANK: Record<Strength, number> = {
  certain: 3,
  strong: 2,
  medium: 1,
};

export const SIMILARITY_THRESHOLD = 0.85;
const MIN_SIMILAR_LENGTH = 5;

const LEGAL_SUFFIXES = new Set([
  "pvt",
  "private",
  "ltd",
  "limited",
  "llp",
  "inc",
  "co",
  "company",
  "india",
]);

function squash(text: string) {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Account name without case, punctuation or trailing legal words, so
 * "Acme India Pvt. Ltd." and "ACME" match. A name made only of such words keeps them.
 */
export function nameKey(name: string) {
  const words = squash(name.replace(/\(\s*p\s*\)/gi, " pvt ")).split(" ");
  let end = words.length;
  while (end > 1 && LEGAL_SUFFIXES.has(words[end - 1])) end--;
  return words.slice(0, end).join(" ");
}

export function personNameKey(person: { firstName: string; lastName: string }) {
  return squash(`${person.firstName} ${person.lastName}`);
}

export const domainKey = (domain: string | null | undefined) =>
  companyDomain(domain);

export function gstinKey(gstin: string | null | undefined) {
  const value = gstin ? normalizeGstin(gstin) : "";
  return value.length === 15 ? value : null;
}

export function panKey(gstin: string | null | undefined) {
  const value = gstinKey(gstin);
  return value ? panRoot(value) : null;
}

export const emailKey = (email: string | null | undefined) =>
  email ? normalizeEmail(email) : null;

export const phoneKey = (phone: string | null | undefined) =>
  phone ? normalizePhone(phone) : null;

/** Edit distance up to `limit`; anything further apart returns `limit + 1`. */
function boundedDistance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let least = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + cost,
      );
      row.push(value);
      if (value < least) least = value;
    }
    if (least > limit) return limit + 1;
    previous = row;
  }
  return Math.min(previous[b.length], limit + 1);
}

/** 1 minus the edit distance over the longer length, or 0 when it can't reach the threshold. */
export function similarity(a: string, b: string) {
  if (a === b) return a ? 1 : 0;
  const longest = Math.max(a.length, b.length);
  if (longest < MIN_SIMILAR_LENGTH) return 0;
  const limit = Math.floor(longest * (1 - SIMILARITY_THRESHOLD) + 1e-9);
  const distance = boundedDistance(a, b, limit);
  return distance > limit ? 0 : 1 - distance / longest;
}

export type AccountFacts = {
  name: string;
  domain?: string | null;
  gstin?: string | null;
  platformOrgId?: string | null;
};

export type PersonFacts = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  platformUserId?: string | null;
  accountId?: string | null;
};

const same = <T>(a: T | null | undefined, b: T | null | undefined) =>
  Boolean(a) && a === b;

export function strongest(reasons: readonly Reason[]): Strength | null {
  let best: Strength | null = null;
  for (const reason of reasons) {
    if (!best || STRENGTH_RANK[reason.strength] > STRENGTH_RANK[best]) {
      best = reason.strength;
    }
  }
  return best;
}

/** Higher means more certain; for ordering pairs. */
export function score(reasons: readonly Reason[]) {
  const best = strongest(reasons);
  return best ? STRENGTH_RANK[best] * 10 + reasons.length : 0;
}

function ranked(reasons: Reason[]) {
  return reasons.sort(
    (a, b) => STRENGTH_RANK[b.strength] - STRENGTH_RANK[a.strength],
  );
}

/** Why two accounts look like one, strongest first; empty when they don't. */
export function accountReasons(a: AccountFacts, b: AccountFacts): Reason[] {
  const reasons: Reason[] = [];
  if (same(gstinKey(a.gstin), gstinKey(b.gstin))) reasons.push(REASONS.gstin);
  else if (same(panKey(a.gstin), panKey(b.gstin))) reasons.push(REASONS.pan);
  if (same(a.platformOrgId, b.platformOrgId)) reasons.push(REASONS.platform);
  if (same(domainKey(a.domain), domainKey(b.domain))) {
    reasons.push(REASONS.domain);
  }
  const nameA = nameKey(a.name);
  const nameB = nameKey(b.name);
  if (nameA && nameA === nameB) reasons.push(REASONS.name);
  else if (similarity(nameA, nameB) >= SIMILARITY_THRESHOLD) {
    reasons.push(REASONS.similar);
  }
  return ranked(reasons);
}

/** Why two people look like one, strongest first; empty when they don't. */
export function personReasons(a: PersonFacts, b: PersonFacts): Reason[] {
  const reasons: Reason[] = [];
  if (same(a.platformUserId, b.platformUserId)) {
    reasons.push(REASONS.platformUser);
  }
  if (same(emailKey(a.email), emailKey(b.email))) reasons.push(REASONS.email);
  if (same(phoneKey(a.phone), phoneKey(b.phone))) reasons.push(REASONS.phone);
  const name = personNameKey(a);
  if (name && same(a.accountId, b.accountId) && name === personNameKey(b)) {
    reasons.push(REASONS.personName);
  }
  return ranked(reasons);
}

/** The same pair always gives the same two keys, whichever record is first. */
export function pairKeys(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export type Pair = { a: string; b: string; reasons: Reason[] };

export type Group = { ids: string[]; pairs: Pair[] };

/** Joins pairs that share a record into groups, best pairs first. */
export function groupPairs(pairs: readonly Pair[]): Group[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id) ?? id;
    if (up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  for (const pair of pairs) {
    parent.set(find(pair.a), find(pair.b));
  }
  const groups = new Map<string, Group>();
  for (const pair of pairs) {
    const root = find(pair.a);
    const group = groups.get(root) ?? { ids: [], pairs: [] };
    for (const id of [pair.a, pair.b]) {
      if (!group.ids.includes(id)) group.ids.push(id);
    }
    group.pairs.push(pair);
    groups.set(root, group);
  }
  const best = (group: Group) =>
    Math.max(...group.pairs.map((pair) => score(pair.reasons)));
  return [...groups.values()]
    .map((group) => ({
      ...group,
      pairs: [...group.pairs].sort(
        (x, y) => score(y.reasons) - score(x.reasons),
      ),
    }))
    .sort((x, y) => best(y) - best(x));
}

/** Most rows the review counts before showing "500+". */
export const COUNT_CAP = 500;

const MOVED_LABELS: Record<string, [string, string]> = {
  people: ["person", "people"],
  deals: ["deal", "deals"],
  tasks: ["task", "tasks"],
  leads: ["lead", "leads"],
  files: ["file", "files"],
};

/** "3 people, 2 deals and 11 tasks", skipping what is zero. */
export function movedPhrase(
  counts: Readonly<Record<string, number | undefined>>,
  capAt = Infinity,
) {
  const parts = Object.entries(MOVED_LABELS)
    .filter(([key]) => (counts[key] ?? 0) > 0)
    .map(([key, [one, many]]) => {
      const n = counts[key]!;
      return n >= capAt ? `${capAt}+ ${many}` : `${n} ${n === 1 ? one : many}`;
    });
  if ((counts.timeline ?? 0) > 0) parts.push("the timeline");
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
