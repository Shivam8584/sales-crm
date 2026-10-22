import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  CONSENT_PURPOSES,
  type ConsentPurpose,
  type ContactReason,
} from "../../../lib/domain/consent";
import type { Channel } from "../../../lib/domain/enums";
import {
  DEAL_STAGE_LABEL,
  LEAD_KIND_LABEL,
  STAGE_LABEL,
  personName,
} from "../../../lib/domain/labels";
import { LEAD_SOURCE_LABEL } from "../../../lib/domain/leads";
import { formatMoney } from "../../../lib/domain/money";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STEP_LABEL,
  CAMPAIGN_ALIASES,
  eventStage,
  pathIndex,
} from "../../../lib/domain/platform";
import {
  consentKey,
  subjectKey,
  type ConsentFacts,
  type Facts,
  type SubjectKind,
} from "../../../lib/domain/automations";
import { canContact, canContactLead } from "../consent";
import { resolveMerged } from "../merged";
import { siteUrl } from "../http";
import type { RecordRefs } from "../timeline";

export type SubjectRef = { kind: SubjectKind; id: string };

export type Subject = {
  kind: SubjectKind;
  id: string;
  key: string;
  name: string;
  href: string;
  ownerId: Id<"members"> | null;
  lead: Doc<"leads"> | null;
  person: Doc<"people"> | null;
  account: Doc<"accounts"> | null;
  deal: Doc<"deals"> | null;
  /** Ids stored on the enrollment and used to file timeline entries and tasks. */
  refs: RecordRefs;
  /** Why the record can no longer run, e.g. it was erased. */
  gone: string | null;
};

const HREF: Record<SubjectKind, string> = {
  lead: "/leads/",
  person: "/people/",
  account: "/accounts/",
  deal: "/deals/",
};

async function get<T extends "leads" | "people" | "accounts" | "deals">(
  ctx: QueryCtx,
  table: T,
  id: string | undefined,
): Promise<Doc<T> | null> {
  if (!id) return null;
  const normalized = ctx.db.normalizeId(table, id);
  return normalized ? await ctx.db.get(normalized) : null;
}

/** A merged-away person or account reads as the record it was merged into. */
const currentPerson = async (ctx: QueryCtx, id: string | undefined) =>
  await resolveMerged(await get(ctx, "people", id), (to) => ctx.db.get(to));

const currentAccount = async (ctx: QueryCtx, id: string | undefined) =>
  await resolveMerged(await get(ctx, "accounts", id), (to) => ctx.db.get(to));

/** The record an enrollment runs on, with the records around it. */
export async function loadSubject(
  ctx: QueryCtx,
  { kind, id }: SubjectRef,
): Promise<Subject | null> {
  const base = {
    kind,
    id,
    key: subjectKey(kind, id),
    href: `${HREF[kind]}${id}`,
    lead: null,
    person: null,
    account: null,
    deal: null,
    gone: null,
  };
  switch (kind) {
    case "lead": {
      const lead = await get(ctx, "leads", id);
      if (!lead) return null;
      const person = await currentPerson(ctx, lead.personId);
      const account = await currentAccount(ctx, lead.accountId);
      return {
        ...base,
        lead,
        person,
        account,
        name: lead.name,
        ownerId: lead.ownerId ?? null,
        refs: { leadId: lead._id },
        gone: lead.erasedAt ? "The lead's data was erased" : null,
      };
    }
    case "person": {
      const person = await get(ctx, "people", id);
      if (!person) return null;
      const account = await currentAccount(ctx, person.accountId);
      return {
        ...base,
        person,
        account,
        name: personName(person),
        ownerId: person.ownerId,
        refs: { personId: person._id },
        gone: person.erasedAt
          ? "The person's data was erased"
          : person.archivedAt
            ? "The person was archived"
            : null,
      };
    }
    case "account": {
      const account = await get(ctx, "accounts", id);
      if (!account) return null;
      return {
        ...base,
        account,
        name: account.name,
        ownerId: account.ownerId,
        refs: { accountId: account._id },
        gone: account.archivedAt ? "The account was archived" : null,
      };
    }
    case "deal": {
      const deal = await get(ctx, "deals", id);
      if (!deal) return null;
      const account = await currentAccount(ctx, deal.accountId);
      return {
        ...base,
        deal,
        account,
        name: deal.title,
        ownerId: deal.ownerId,
        refs: { dealId: deal._id, accountId: account?._id ?? deal.accountId },
        gone: null,
      };
    }
  }
}

export type Recipient = {
  personId?: Id<"people">;
  leadId?: Id<"leads">;
  name: string;
  firstName: string;
  email?: string;
  phone?: string;
};

const fromPerson = (person: Doc<"people">): Recipient => ({
  personId: person._id,
  name: personName(person),
  firstName: person.firstName,
  email: person.email,
  phone: person.phone,
});

const address = (recipient: Recipient, channel: Channel) =>
  channel === "email" ? recipient.email : recipient.phone;

async function accountContacts(ctx: QueryCtx, accountId: Id<"accounts">) {
  const people = await ctx.db
    .query("people")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  return people
    .filter((person) => !person.archivedAt && !person.erasedAt)
    .sort(
      (a, b) =>
        Number(b.tags.includes("Decision maker")) -
          Number(a.tags.includes("Decision maker")) ||
        a._creationTime - b._creationTime,
    );
}

/** Who a message to this record goes to: the person, the lead, or the main contact with an address. */
export async function recipientFor(
  ctx: QueryCtx,
  subject: Subject,
  channel: Channel,
): Promise<Recipient | null> {
  if (subject.lead) {
    if (subject.person) return fromPerson(subject.person);
    const lead = subject.lead;
    return {
      leadId: lead._id,
      name: lead.name,
      firstName: lead.name.split(/\s+/)[0] ?? lead.name,
      email: lead.email,
      phone: lead.phone,
    };
  }
  if (subject.person) return fromPerson(subject.person);
  const candidates: Doc<"people">[] = [];
  if (subject.deal) {
    for (const id of subject.deal.personIds) {
      const person = await ctx.db.get(id);
      if (person && !person.archivedAt && !person.erasedAt) {
        candidates.push(person);
      }
    }
  }
  if (subject.account) {
    candidates.push(...(await accountContacts(ctx, subject.account._id)));
  }
  const reachable = candidates.find((person) =>
    Boolean(address(fromPerson(person), channel)),
  );
  const chosen = reachable ?? candidates[0];
  return chosen ? fromPerson(chosen) : null;
}

export type Decision = {
  allowed: boolean;
  message: string;
  reason?: ContactReason;
};

/** The consent gate for one outbound message, through `canContact`. */
export async function contactDecision(
  ctx: QueryCtx,
  recipient: Recipient | null,
  channel: Channel,
  purpose: ConsentPurpose,
): Promise<Decision> {
  if (!recipient) {
    return {
      allowed: false,
      message: "There's nobody on the record to contact",
    };
  }
  const decision = recipient.personId
    ? await canContact(ctx, recipient.personId, channel, purpose)
    : await canContactLead(ctx, recipient.leadId!, channel, purpose);
  return {
    allowed: decision.allowed,
    message: decision.message,
    reason: decision.reason,
  };
}

export function recipientAddress(recipient: Recipient, channel: Channel) {
  return address(recipient, channel);
}

/** Platform events seen for the subject's org (or its people's signups), oldest first. */
async function platformEvents(ctx: QueryCtx, subject: Subject) {
  const rows: Doc<"platformEvents">[] = [];
  const orgId = subject.account?.platformOrgId;
  if (orgId) {
    rows.push(
      ...(await ctx.db
        .query("platformEvents")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()),
    );
  }
  const userIds = new Set<string>();
  if (subject.person?.platformUserId)
    userIds.add(subject.person.platformUserId);
  if (subject.account && !orgId) {
    for (const person of await accountContacts(ctx, subject.account._id)) {
      if (person.platformUserId) userIds.add(person.platformUserId);
    }
  }
  for (const userId of userIds) {
    rows.push(
      ...(await ctx.db
        .query("platformEvents")
        .withIndex("by_user_type", (q) => q.eq("userId", userId))
        .collect()),
    );
  }
  const unique = new Map(rows.map((row) => [row._id, row]));
  return [...unique.values()]
    .filter((row) => row.processedAt)
    .sort((a, b) => a.occurredAt - b.occurredAt);
}

const canonicalType = (type: string) =>
  type in CAMPAIGN_ALIASES ? "campaign.status_changed" : type;

function parse(payload: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const NUMBER_FIELDS = 100;

/** Everything conditions and goals can test, plus the consent answers for every channel and purpose. */
export async function subjectFacts(
  ctx: QueryCtx,
  subject: Subject,
): Promise<{ facts: Facts; consent: ConsentFacts }> {
  const { lead, deal, account } = subject;
  const facts: Facts = {
    owner: subject.ownerId,
    "lead.status": lead?.status ?? null,
    "lead.kind": lead?.kind ?? null,
    "lead.source": lead?.source ?? null,
    "deal.stage": deal?.stage ?? null,
    "deal.amount": deal ? deal.amount.amount / NUMBER_FIELDS : null,
    "account.stage": account?.stage ?? null,
    "account.tags": account?.tags ?? subject.person?.tags ?? [],
  };

  const events = await platformEvents(ctx, subject);
  facts["platform.event"] = [
    ...new Set(events.map((event) => canonicalType(event.type))),
  ];
  let reached = pathIndex(account?.stage);
  for (const event of events) {
    reached = Math.max(
      reached,
      pathIndex(eventStage(event.type, parse(event.payload))),
    );
  }
  facts["platform.stage"] = reached >= 0 ? ACTIVATION_STAGES[reached] : null;

  const consent: ConsentFacts = {};
  for (const channel of ["email", "whatsapp"] as const) {
    const recipient = await recipientFor(ctx, subject, channel);
    if (channel === "email") facts.has_email = Boolean(recipient?.email);
    else facts.has_phone = Boolean(recipient?.phone);
    for (const purpose of CONSENT_PURPOSES) {
      consent[consentKey(channel, purpose)] = await contactDecision(
        ctx,
        recipient,
        channel,
        purpose,
      );
    }
    facts[`consent.${channel}`] =
      consent[consentKey(channel, "sales_outreach")].allowed;
  }
  return { facts, consent };
}

/** Values for `{{variables}}` in messages and task titles, keyed by the library's names. */
export async function subjectVars(
  ctx: QueryCtx,
  subject: Subject,
  recipient?: Recipient | null,
  context?: Record<string, string>,
): Promise<Record<string, string>> {
  const owner = subject.ownerId ? await ctx.db.get(subject.ownerId) : null;
  const to = recipient ?? (await recipientFor(ctx, subject, "email"));
  const person = to?.personId ? await ctx.db.get(to.personId) : null;
  const { account, lead, deal } = subject;
  const snapshot = account
    ? await ctx.db
        .query("platformSnapshots")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .order("desc")
        .first()
    : null;
  const live = snapshot?.campaigns.filter(
    (campaign) => campaign.status === "live",
  ).length;
  const lastName =
    person?.lastName ?? to?.name.split(/\s+/).slice(1).join(" ") ?? "";
  const vars: Record<string, string> = {
    "person.firstName": to?.firstName ?? "",
    "person.lastName": lastName,
    "person.fullName": to?.name ?? "",
    "person.title": person?.title ?? "",
    "person.email": to?.email ?? "",
    "account.name": account?.name ?? lead?.companyName ?? "",
    "account.domain": account?.domain ?? "",
    "account.stage": account ? STAGE_LABEL[account.stage] : "",
    "lead.source": lead ? (LEAD_SOURCE_LABEL[lead.source] ?? lead.source) : "",
    "lead.kind": lead ? LEAD_KIND_LABEL[lead.kind] : "",
    "lead.company": lead?.companyName ?? "",
    "deal.title": deal?.title ?? "",
    "deal.amount": deal ? formatMoney(deal.amount) : "",
    "deal.stage": deal ? DEAL_STAGE_LABEL[deal.stage] : "",
    "owner.name": owner?.name ?? "",
    "owner.firstName": owner?.name.split(/\s+/)[0] ?? "",
    "owner.email": owner?.email ?? "",
    "platform.balance":
      snapshot?.balancePaise !== undefined
        ? formatMoney({ amount: snapshot.balancePaise, currency: "INR" })
        : "",
    "platform.liveCampaigns":
      snapshot && live !== undefined ? String(live) : "",
    "platform.stage": "",
    "record.name": subject.name,
    "survey.link": account ? siteUrl("/survey/preview") : "",
  };
  if (account) {
    const reached = pathIndex(account.stage);
    if (reached >= 0) {
      vars["platform.stage"] =
        ACTIVATION_STEP_LABEL[ACTIVATION_STAGES[reached]];
    }
  }
  for (const [key, value] of Object.entries(context ?? {})) {
    if (key.startsWith("prospect.") && value.trim()) vars[key] = value.trim();
  }
  return vars;
}

/**
 * Since `since`: a reply received from the contact, or an interaction a
 * teammate logged; either means the conversation moved off the automation.
 */
export async function repliedSince(
  ctx: QueryCtx,
  subject: Subject,
  since: number,
): Promise<"inbound" | "logged" | null> {
  const timeline = ctx.db.query("timeline");
  const queries = [
    subject.lead &&
      timeline.withIndex("by_lead", (q) =>
        q.eq("leadId", subject.lead!._id).gt("occurredAt", since),
      ),
    subject.person &&
      timeline.withIndex("by_person", (q) =>
        q.eq("personId", subject.person!._id).gt("occurredAt", since),
      ),
    subject.kind === "account" &&
      subject.account &&
      timeline.withIndex("by_account", (q) =>
        q.eq("accountId", subject.account!._id).gt("occurredAt", since),
      ),
    subject.deal &&
      timeline.withIndex("by_deal", (q) =>
        q.eq("dealId", subject.deal!._id).gt("occurredAt", since),
      ),
  ];
  let found: "inbound" | "logged" | null = null;
  for (const query of queries) {
    if (!query) continue;
    for (const entry of await query.collect()) {
      if (!REPLY_KINDS.has(entry.kind) || entry.automated) continue;
      if (entry.direction === "inbound") return "inbound";
      if (entry.actorId) found = "logged";
    }
  }
  return found;
}

const REPLY_KINDS = new Set(["email", "whatsapp", "call", "meeting"]);
