import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { Channel, LeadKind, LeadStatus } from "../../lib/domain/enums";
import {
  DEFAULT_LEAD_SLA_SECONDS,
  LEAD_SOURCE_LABEL,
  type Utm,
} from "../../lib/domain/leads";
import { slaDueAt } from "../../lib/domain/day";
import { routeLead } from "../../lib/domain/routing";
import { emailType, leadSlaMs, scoreLead } from "../../lib/domain/scoring";
import { isLeadOpen } from "../../lib/domain/transitions";
import { nextOwner } from "./assignment";
import { sourceFamily } from "./enrichment/kyc";
import { findPerson } from "./identity";
import { hotSlaFactor, leadSlaSeconds, routingRules } from "./settings";
import { recordKey } from "../../lib/domain/notifications";
import {
  leadershipIds,
  notify,
  notifyMany,
  resolveNotifications,
} from "../notifications";
import { emitAutomationTrigger } from "./automations/engine";
import { routes } from "../../lib/routes";

const DAY_MS = 24 * 60 * 60 * 1000;
export const CLOSED_STATUSES: LeadStatus[] = ["disqualified", "converted"];

export type AlertEvent =
  | "lead_new"
  | "lead_sla"
  | "demo_booked"
  | "demo_rescheduled"
  | "demo_cancelled";

/** The env/default SLA, ignoring the workspace setting; prefer `leadSlaSeconds`. */
export function slaSeconds() {
  const value = Number(process.env.LEAD_SLA_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LEAD_SLA_SECONDS;
}

export { leadSlaSeconds };

/** First-touch window for a lead given its score; hot leads get a shorter one. */
export async function leadSlaPolicy(ctx: QueryCtx) {
  const [seconds, factor] = await Promise.all([
    leadSlaSeconds(ctx),
    hotSlaFactor(ctx),
  ]);
  return (score: number | null | undefined) =>
    leadSlaMs(seconds * 1000, score, factor);
}

export function leadHref(id: Id<"leads">) {
  return routes.lead(id);
}

/** Clears the "no first touch" alerts once the lead is touched or closed. */
export function resolveLeadSla(ctx: MutationCtx, id: Id<"leads">) {
  return resolveNotifications(ctx, {
    record: recordKey("leads", id),
    kinds: ["lead_sla"],
  });
}

export function isOpen(lead: Pick<Doc<"leads">, "status">) {
  return isLeadOpen(lead.status);
}

/** "google / cpc", a referrer host, or how the lead entered the CRM. */
export function leadChannel(
  lead: Pick<Doc<"leads">, "utm" | "referrer" | "source">,
) {
  if (lead.utm.source) {
    return lead.utm.medium
      ? `${lead.utm.source} / ${lead.utm.medium}`
      : lead.utm.source;
  }
  if (lead.referrer) {
    try {
      return new URL(lead.referrer).hostname.replace(/^www\./, "");
    } catch {
      return lead.referrer;
    }
  }
  return LEAD_SOURCE_LABEL[lead.source] ?? lead.source;
}

export function leadSummary(
  lead: Pick<Doc<"leads">, "companyName" | "utm" | "referrer" | "source">,
) {
  return `${lead.companyName} · ${leadChannel(lead)}`;
}

const NEW_TITLE: Record<LeadKind, string> = {
  demo: "New demo request",
  contact: "New contact request",
  signup: "New platform signup",
  manual: "New lead",
};

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
async function ruleOwner(ctx: QueryCtx, lead: Scorable, score: number) {
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

/**
 * Inserts a lead, assigns an owner, tells them (or leadership when nobody owns
 * it), alerts the team channel and starts the speed-to-lead clock.
 */
export async function createLead(
  ctx: MutationCtx,
  lead: NewLead,
  options: { announce?: "lead_new" | "demo_booked" | false } = {},
) {
  const now = Date.now();
  const { ownerId: requested, ...fields } = lead;
  const { score, reasons } = await scoreFor(ctx, lead);
  const ownerId =
    (requested === undefined
      ? ((await ruleOwner(ctx, lead, score)) ?? (await nextOwner(ctx)))
      : requested) ?? undefined;
  const id = await ctx.db.insert("leads", {
    ...fields,
    status: "new",
    score,
    scoreReasons: reasons,
    ownerId,
    assignedAt: ownerId ? now : undefined,
  });

  const announce = options.announce ?? "lead_new";
  if (announce) {
    const input = {
      kind: announce,
      title: `${announce === "demo_booked" ? "Demo booked" : NEW_TITLE[lead.kind]}: ${lead.name}`,
      body: leadSummary(lead),
      href: leadHref(id),
    };
    if (ownerId) await notify(ctx, ownerId, input);
    else await notifyMany(ctx, await leadershipIds(ctx), input);
    await ctx.scheduler.runAfter(0, internal.alerts.send, {
      event: announce,
      leadId: id,
    });
  }
  if (!lead.firstTouchedAt) {
    await ctx.scheduler.runAt(
      slaDueAt(now, (await leadSlaPolicy(ctx))(score)),
      internal.leads.checkSla,
      { id },
    );
  }
  await emitAutomationTrigger(ctx, {
    kind: "lead_created",
    refs: { leadId: id },
    value: lead.kind,
    source: lead.source,
  });
  return { id, ownerId: ownerId ?? null };
}

/** The most recent open lead with this email or phone from the last 24 hours. */
export async function findRecentOpenLead(
  ctx: QueryCtx,
  email: string | undefined,
  phone: string | undefined,
) {
  const since = Date.now() - DAY_MS;
  const candidates: Doc<"leads">[] = [];
  if (email) {
    candidates.push(
      ...(await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", email))
        .order("desc")
        .take(20)),
    );
  }
  if (phone) {
    candidates.push(
      ...(await ctx.db
        .query("leads")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .order("desc")
        .take(20)),
    );
  }
  return (
    candidates
      .filter((lead) => lead._creationTime >= since && isOpen(lead))
      .sort((a, b) => b._creationTime - a._creationTime)[0] ?? null
  );
}

/** One consent row per channel the person can be reached on. */
export async function recordConsents(
  ctx: MutationCtx,
  leadId: Id<"leads">,
  contact: { email?: string; phone?: string },
  consent: { text: string; source: string; ip?: string },
) {
  const channels: Channel[] = [];
  if (contact.email) channels.push("email");
  if (contact.phone) channels.push("phone", "whatsapp");
  const recordedAt = Date.now();
  for (const channel of channels) {
    await ctx.db.insert("consents", {
      leadId,
      channel,
      granted: true,
      recordedAt,
      ...consent,
    });
  }
}
