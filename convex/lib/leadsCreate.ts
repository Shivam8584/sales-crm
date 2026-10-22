import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { Channel, LeadKind } from "../../lib/domain/enums";
import { slaDueAt } from "../../lib/domain/day";
import { HOT_MIN } from "../../lib/domain/scoring";
import { nextOwner } from "./assignment";
import { leadershipIds, notify, notifyMany } from "../notifications";
import { emitAutomationTrigger } from "./automations/engine";
import { slackEvent } from "./slack";
import { isOpen, leadHref, leadSlaPolicy, leadSummary } from "./leadsSla";
import { type NewLead, scoreFor } from "./leadsScoring";
import { ruleOwner } from "./leadsScoring";

const DAY_MS = 24 * 60 * 60 * 1000;

const NEW_TITLE: Record<LeadKind, string> = {
  demo: "New demo request",
  contact: "New contact request",
  signup: "New platform signup",
  manual: "New lead",
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
    if (score >= HOT_MIN) {
      await slackEvent(ctx, "lead_hot", {
        name: lead.name,
        detail: `${lead.companyName} · score ${score}`,
        path: leadHref(id),
      });
    }
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
