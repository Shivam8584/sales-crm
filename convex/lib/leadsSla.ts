import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { LeadStatus } from "../../lib/domain/enums";
import {
  DEFAULT_LEAD_SLA_SECONDS,
  LEAD_SOURCE_LABEL,
} from "../../lib/domain/leads";
import { leadSlaMs } from "../../lib/domain/scoring";
import { isLeadOpen } from "../../lib/domain/transitions";
import { hotSlaFactor, leadSlaSeconds } from "./settings";
import { recordKey } from "../../lib/domain/notifications";
import { resolveNotifications } from "../notifications";
import { routes } from "../../lib/routes";

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
