import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  accountReasons,
  domainKey,
  gstinKey,
  nameKey,
  pairKeys,
  panKey,
  personReasons,
  type Reason,
} from "../../lib/domain/dedupe";
import { personName } from "../../lib/domain/labels";

/** Rows read per lookup, so a common name or shared key can't make a scan unbounded. */
const NEIGHBOURS = 10;
const SAME_ACCOUNT = 100;

export type DedupeType = "accounts" | "people";

type Mergeable = {
  archivedAt?: number;
  erasedAt?: number;
  mergingInto?: unknown;
  mergedIntoId?: unknown;
};

export const isMergeable = (row: Mergeable) =>
  !row.archivedAt && !row.erasedAt && !row.mergingInto && !row.mergedIntoId;

export type Match<T> = { other: T; reasons: Reason[] };

/** Live accounts that look like `account`, found through indexes rather than a scan. */
export async function accountMatches(
  ctx: QueryCtx,
  account: Doc<"accounts">,
): Promise<Match<Doc<"accounts">>[]> {
  const orgId = account.platformOrgId;
  const pan = panKey(account.gstin);
  const domain = domainKey(account.domain);
  const name = nameKey(account.name);
  const pools = await Promise.all([
    orgId
      ? ctx.db
          .query("accounts")
          .withIndex("by_platform_org", (q) => q.eq("platformOrgId", orgId))
          .take(NEIGHBOURS)
      : [],
    pan
      ? ctx.db
          .query("accounts")
          .withIndex("by_pan_root", (q) => q.eq("panRoot", pan))
          .take(NEIGHBOURS)
      : [],
    domain
      ? ctx.db
          .query("accounts")
          .withIndex("by_domain", (q) => q.eq("domain", domain))
          .take(NEIGHBOURS)
      : [],
    name
      ? ctx.db
          .query("accounts")
          .withSearchIndex("search_name", (q) =>
            q.search("name", name).eq("archivedAt", undefined),
          )
          .take(NEIGHBOURS)
      : [],
  ]);
  const found = new Map<Id<"accounts">, Doc<"accounts">>();
  for (const row of pools.flat()) {
    if (row._id !== account._id && isMergeable(row)) found.set(row._id, row);
  }
  const matches: Match<Doc<"accounts">>[] = [];
  for (const other of found.values()) {
    const reasons = accountReasons(account, other);
    if (reasons.length > 0) matches.push({ other, reasons });
  }
  return matches;
}

/** Live people who look like `person`: same platform user, email, phone, or name at one account. */
export async function personMatches(
  ctx: QueryCtx,
  person: Doc<"people">,
): Promise<Match<Doc<"people">>[]> {
  const userId = person.platformUserId;
  const email = person.email;
  const phone = person.phone;
  const accountId = person.accountId;
  const pools = await Promise.all([
    userId
      ? ctx.db
          .query("people")
          .withIndex("by_platform_user", (q) => q.eq("platformUserId", userId))
          .take(NEIGHBOURS)
      : [],
    email
      ? ctx.db
          .query("people")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(NEIGHBOURS)
      : [],
    phone
      ? ctx.db
          .query("people")
          .withIndex("by_phone", (q) => q.eq("phone", phone))
          .take(NEIGHBOURS)
      : [],
    accountId
      ? ctx.db
          .query("people")
          .withIndex("by_account", (q) => q.eq("accountId", accountId))
          .take(SAME_ACCOUNT)
      : [],
  ]);
  const found = new Map<Id<"people">, Doc<"people">>();
  for (const row of pools.flat()) {
    if (row._id !== person._id && isMergeable(row)) found.set(row._id, row);
  }
  const matches: Match<Doc<"people">>[] = [];
  for (const other of found.values()) {
    const reasons = personReasons(person, other);
    if (reasons.length > 0) matches.push({ other, reasons });
  }
  return matches;
}

export async function isDismissed(
  ctx: QueryCtx,
  type: DedupeType,
  a: string,
  b: string,
) {
  const [aKey, bKey] = pairKeys(a, b);
  const row = await ctx.db
    .query("dedupeDismissals")
    .withIndex("by_pair", (q) =>
      q.eq("type", type).eq("aKey", aKey).eq("bKey", bKey),
    )
    .first();
  return Boolean(row);
}

export const accountSummary = (account: Doc<"accounts">) => ({
  _id: account._id,
  name: account.name,
  domain: account.domain ?? null,
  gstin: gstinKey(account.gstin),
});

export async function personSummary(ctx: QueryCtx, person: Doc<"people">) {
  const account = person.accountId ? await ctx.db.get(person.accountId) : null;
  return {
    _id: person._id,
    name: personName(person),
    email: person.email ?? null,
    phone: person.phone ?? null,
    accountName: account?.name ?? null,
  };
}
