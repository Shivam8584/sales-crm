import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { Channel, LeadKind, LeadStatus } from "../../lib/domain/enums";
import {
  DEFAULT_LEAD_SLA_SECONDS,
  LEAD_SOURCE_LABEL,
  type Utm,
} from "../../lib/domain/leads";
import { nextOwner } from "./assignment";
import { leadSlaSeconds } from "./settings";
import { leadershipIds, notify, notifyMany } from "../notifications";
import { emitAutomationTrigger } from "./automations/engine";

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

export function leadHref(id: Id<"leads">) {
  return `/leads/${id}`;
}

export function isOpen(lead: Doc<"leads">) {
  return !CLOSED_STATUSES.includes(lead.status);
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
  const ownerId =
    (requested === undefined ? await nextOwner(ctx) : requested) ?? undefined;
  const id = await ctx.db.insert("leads", {
    ...fields,
    status: "new",
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
    await ctx.scheduler.runAfter(
      (await leadSlaSeconds(ctx)) * 1000,
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
