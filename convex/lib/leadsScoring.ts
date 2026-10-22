import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { LeadKind } from "../../lib/domain/enums";
import type { Utm } from "../../lib/domain/leads";
import { routeLead } from "../../lib/domain/routing";
import { emailType, scoreLead } from "../../lib/domain/scoring";
import { sourceFamily } from "./enrichment/kyc";
import { findPerson } from "./identity";
import { routingRules } from "./settings";

export type NewLead = {
  kind: LeadKind;
  name: string;
  email?: string;
  phone?: string;
  companyName: string;
  website?: string;
  gstin?: string;
  message?: string;
  source: string;
  utm: Utm;
  referrer?: string;
  landingPage?: string;
  /** Omit to assign round-robin; `null` leaves the lead unassigned. */
  ownerId?: Id<"members"> | null;
  firstTouchedAt?: number;
  demoAt?: number;
};

type Scorable = Pick<
  NewLead,
  | "kind"
  | "name"
  | "email"
  | "phone"
  | "companyName"
  | "website"
  | "gstin"
  | "message"
  | "source"
  | "utm"
  | "referrer"
  | "landingPage"
> & { _id?: Id<"leads">; accountId?: Id<"accounts">; repeats?: number };

async function gstVerified(ctx: QueryCtx, lead: Scorable) {
  if (!lead.gstin) return false;
  const { _id, accountId } = lead;
  const rows = [
    ...(_id
      ? await ctx.db
          .query("facts")
          .withIndex("by_lead", (q) => q.eq("leadId", _id))
          .take(50)
      : []),
    ...(accountId
      ? await ctx.db
          .query("facts")
          .withIndex("by_account", (q) => q.eq("accountId", accountId))
          .take(50)
      : []),
  ];
  return rows.some(
    (fact) =>
      fact.field === "gstin" &&
      fact.value === lead.gstin &&
      (fact.status === "applied" || fact.status === "accepted") &&
      sourceFamily(fact.source) === "gst",
  );
}

async function platformLink(ctx: QueryCtx, lead: Scorable) {
  const person = await findPerson(ctx, {
    email: lead.email,
    phone: lead.phone,
  });
  const accountId = lead.accountId ?? person?.accountId;
  const account = accountId ? await ctx.db.get(accountId) : null;
  if (account?.platformOrgId) return "org" as const;
  return person?.platformUserId ? ("user" as const) : null;
}

/** Scores a lead from what the CRM knows about it right now. */
export async function scoreFor(ctx: QueryCtx, lead: Scorable) {
  return scoreLead({
    ...lead,
    gstVerified: await gstVerified(ctx, lead),
    platform: await platformLink(ctx, lead),
  });
}

/** Recomputes a stored lead's score after any fact it depends on changed. */
export async function rescoreLead(ctx: MutationCtx, id: Id<"leads">) {
  const lead = await ctx.db.get(id);
  if (!lead) return;
  const { score, reasons } = await scoreFor(ctx, lead);
  if (
    score !== lead.score ||
    reasons.join("|") !== lead.scoreReasons?.join("|")
  ) {
    await ctx.db.patch(id, { score, scoreReasons: reasons });
  }
}

export async function rescoreAccountLeads(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
) {
  const leads = await ctx.db
    .query("leads")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .take(20);
  for (const lead of leads) await rescoreLead(ctx, lead._id);
}

/** The member a routing rule picks, or null when none applies and round-robin should. */
export async function ruleOwner(ctx: QueryCtx, lead: Scorable, score: number) {
  const rules = await routingRules(ctx);
  if (rules.length === 0) return null;
  const active = new Set<Id<"members">>(
    (
      await ctx.db
        .query("members")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect()
    ).map((member) => member._id),
  );
  const hit = routeLead(
    rules,
    {
      kind: lead.kind,
      source: lead.source,
      score,
      hasGst: Boolean(lead.gstin),
      emailType: emailType(lead.email),
    },
    (id) => active.has(id),
  );
  return hit?.memberId ?? null;
}
