import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { panRoot } from "../../lib/domain/gstin";
import { companyDomain } from "../../lib/domain/leads";
import { normalizeEmail, normalizePhone } from "../../lib/domain/normalize";

/**
 * The one way records are matched to existing ones, shared by lead
 * conversion, the platform webhook, the team sync and CSV imports. Call it in
 * the same mutation that inserts on a miss: Convex reruns the mutation if a
 * concurrent one wrote into the ranges read here, so a race can't duplicate.
 */

export type AccountKeys = {
  platformOrgId?: string | null;
  gstin?: string | null;
  /** A website or email domain; shared hosts such as gmail.com never match. */
  domain?: string | null;
};

type AccountOptions = {
  exclude?: Id<"accounts">;
  /** Skip accounts already linked to another platform organisation. */
  unlinkedOnly?: boolean;
};

const live = <T extends { archivedAt?: number }>(rows: T[]) =>
  rows.filter((row) => !row.archivedAt);

/** Platform org, then the GSTIN's PAN (one legal entity), then the company domain. */
export async function findAccount(
  ctx: QueryCtx,
  keys: AccountKeys,
  options: AccountOptions = {},
): Promise<Doc<"accounts"> | null> {
  const usable = (rows: Doc<"accounts">[]) =>
    live(rows).find(
      (account) =>
        account._id !== options.exclude &&
        (!options.unlinkedOnly ||
          !account.platformOrgId ||
          account.platformOrgId === keys.platformOrgId),
    ) ?? null;

  const orgId = keys.platformOrgId;
  if (orgId) {
    const byOrg = await ctx.db
      .query("accounts")
      .withIndex("by_platform_org", (q) => q.eq("platformOrgId", orgId))
      .collect();
    const match = live(byOrg).find((row) => row._id !== options.exclude);
    if (match) return match;
  }
  const pan = keys.gstin ? panRoot(keys.gstin) : null;
  if (pan) {
    const match = usable(
      await ctx.db
        .query("accounts")
        .withIndex("by_pan_root", (q) => q.eq("panRoot", pan))
        .collect(),
    );
    if (match) return match;
  }
  const domain = companyDomain(keys.domain);
  if (domain) {
    const match = usable(
      await ctx.db
        .query("accounts")
        .withIndex("by_domain", (q) => q.eq("domain", domain))
        .collect(),
    );
    if (match) return match;
  }
  return null;
}

export type PersonKeys = {
  platformUserId?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** Platform user, then email, then E.164 phone; archived and erased people never match. */
export async function findPerson(
  ctx: QueryCtx,
  keys: PersonKeys,
  exclude?: Id<"people">,
): Promise<Doc<"people"> | null> {
  const usable = (rows: Doc<"people">[]) =>
    rows.find(
      (person) =>
        person._id !== exclude && !person.archivedAt && !person.erasedAt,
    ) ?? null;

  const userId = keys.platformUserId;
  if (userId) {
    const match = usable(
      await ctx.db
        .query("people")
        .withIndex("by_platform_user", (q) => q.eq("platformUserId", userId))
        .collect(),
    );
    if (match) return match;
  }
  const email = keys.email ? normalizeEmail(keys.email) : null;
  if (email) {
    const match = usable(
      await ctx.db
        .query("people")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect(),
    );
    if (match) return match;
  }
  const phone = keys.phone ? normalizePhone(keys.phone) : null;
  if (phone) {
    const match = usable(
      await ctx.db
        .query("people")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .collect(),
    );
    if (match) return match;
  }
  return null;
}
