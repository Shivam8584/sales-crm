import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { Channel } from "../../lib/domain/enums";
import {
  CONSENT_EVENTS,
  CONSENT_PURPOSES,
  CONSENT_SOURCES,
  DEFAULT_RETENTION_DAYS,
  ERASED_NAME,
  LAWFUL_BASES,
  REDACTED,
  RETENTION_DAYS,
  channelAddress,
  decideContact,
  type ConsentEvent,
  type ConsentPurpose,
  type ContactDecision,
  type LawfulBasis,
} from "../../lib/domain/consent";
import { CHANNELS } from "../../lib/domain/enums";
import { eraseSurveyData } from "../surveys";
import { deleteAttachments } from "./attachments";
import { fail } from "./errors";
import { resolveMerged } from "./merged";
import { logSystem } from "./timeline";
import { literals } from "./validators";
import { routes } from "../../lib/routes";

export const vConsentEvent = literals(CONSENT_EVENTS);
export const vLawfulBasis = literals(LAWFUL_BASES);
export const vConsentPurpose = literals(CONSENT_PURPOSES);
export const vConsentSource = literals(CONSENT_SOURCES);

export const RETENTION_KEY = "privacy.retentionDays";

export function parseRetentionDays(raw: string | null) {
  const value = Number(raw);
  return raw !== null &&
    Number.isInteger(value) &&
    value >= RETENTION_DAYS.min &&
    value <= RETENTION_DAYS.max
    ? value
    : null;
}

/** Stored retention window, or null when the 180-day default applies. */
export async function storedRetentionDays(ctx: QueryCtx) {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", RETENTION_KEY))
    .unique();
  return parseRetentionDays(row?.value ?? null);
}

export async function retentionDays(ctx: QueryCtx) {
  return (await storedRetentionDays(ctx)) ?? DEFAULT_RETENTION_DAYS;
}

export async function personLedger(ctx: QueryCtx, personId: Id<"people">) {
  return await ctx.db
    .query("consents")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .collect();
}

export async function leadLedger(ctx: QueryCtx, leadId: Id<"leads">) {
  return await ctx.db
    .query("consents")
    .withIndex("by_lead", (q) => q.eq("leadId", leadId))
    .collect();
}

/**
 * The one gate for outbound contact. Sequences, the dialer and WhatsApp sends
 * must call this right before they act and skip the person when `allowed` is
 * false; `reason` is stable for code, `message` is for people.
 *
 * DND is a ledger event on the phone channel, set by hand today. An NCPR scrub
 * plugs in as a scheduled action that appends `dnd_on`/`dnd_off` rows with
 * source "ncpr"; this gate needs no change.
 */
export async function canContact(
  ctx: QueryCtx,
  personId: Id<"people">,
  channel: Channel,
  purpose: ConsentPurpose,
): Promise<ContactDecision> {
  const person = await resolveMerged(await ctx.db.get(personId), (id) =>
    ctx.db.get(id),
  );
  if (!person) {
    return {
      allowed: false,
      reason: "not_found",
      message: "Person not found",
      basis: null,
      since: null,
    };
  }
  // Consent follows the person, not the record: a merge that hasn't moved every
  // row yet still counts the other record's history.
  const other = person.mergingFrom ?? person.mergingInto;
  return decideContact({
    rows: [
      ...(await personLedger(ctx, person._id)),
      ...(other ? await personLedger(ctx, other) : []),
    ],
    channel,
    purpose,
    hasAddress: Boolean(channelAddress(person, channel)),
    erasedAt: person.erasedAt,
  });
}

/** `canContact` for a lead that hasn't been converted yet. */
export async function canContactLead(
  ctx: QueryCtx,
  leadId: Id<"leads">,
  channel: Channel,
  purpose: ConsentPurpose,
): Promise<ContactDecision> {
  const lead = await ctx.db.get(leadId);
  if (!lead) {
    return {
      allowed: false,
      reason: "not_found",
      message: "Lead not found",
      basis: null,
      since: null,
    };
  }
  if (lead.personId) {
    return await canContact(ctx, lead.personId, channel, purpose);
  }
  return decideContact({
    rows: await leadLedger(ctx, leadId),
    channel,
    purpose,
    hasAddress: Boolean(channelAddress(lead, channel)),
    erasedAt: lead.erasedAt,
  });
}

export type LedgerEntry = {
  personId?: Id<"people">;
  leadId?: Id<"leads">;
  channels: readonly Channel[];
  event: ConsentEvent;
  basis?: LawfulBasis;
  purpose?: ConsentPurpose;
  source: string;
  text: string;
  actorId?: Id<"members">;
};

/** Appends one row per channel. The ledger is never edited, only redacted on erasure. */
export async function appendLedger(ctx: MutationCtx, entry: LedgerEntry) {
  const recordedAt = Date.now();
  const { channels, ...rest } = entry;
  const owner = entry.personId
    ? await resolveMerged(await ctx.db.get(entry.personId), (id) =>
        ctx.db.get(id),
      )
    : null;
  for (const channel of channels) {
    await ctx.db.insert("consents", {
      ...rest,
      personId: owner?._id ?? entry.personId,
      channel,
      granted: entry.event === "grant",
      recordedAt,
    });
  }
  return recordedAt;
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE_PATTERN = /\+?\d[\d\s-]{7,}\d/g;

/**
 * Replaces the subject's names with "Erased person" and any email or phone
 * number with a marker. Over-redacting free text is the safe failure here.
 */
export function makeScrubber(
  names: string[],
  identifiers: string[],
  generic = true,
) {
  const patterns = [
    ...identifiers
      .filter((value) => value.length >= 3)
      .sort((a, b) => b.length - a.length)
      .map((value) => ({ re: new RegExp(escape(value), "gi"), to: REDACTED })),
    ...names
      .filter((value) => value.length >= 2)
      .sort((a, b) => b.length - a.length)
      .map((value) => ({
        re: new RegExp(
          `(?<![\\p{L}\\p{N}])${escape(value)}(?![\\p{L}\\p{N}])`,
          "giu",
        ),
        to: ERASED_NAME,
      })),
    ...(generic
      ? [
          { re: EMAIL_PATTERN, to: REDACTED },
          { re: PHONE_PATTERN, to: REDACTED },
        ]
      : []),
  ];
  return (text: string | undefined) => {
    if (!text) return text;
    let out = text;
    for (const { re, to } of patterns) out = out.replace(re, to);
    return out.replace(/(Erased person)(\s+Erased person)+/g, "$1");
  };
}

const PII_FIELDS = new Set([
  "First name",
  "Last name",
  "Name",
  "Email",
  "Phone",
  "LinkedIn",
  "Title",
]);

type Scrub = ReturnType<typeof makeScrubber>;

async function redactTimeline(
  ctx: MutationCtx,
  entries: Doc<"timeline">[],
  scrub: Scrub,
) {
  for (const entry of entries) {
    await ctx.db.patch(entry._id, {
      subject: scrub(entry.subject),
      body: entry.body ? REDACTED : undefined,
      changes: entry.changes?.map((change) =>
        PII_FIELDS.has(change.field)
          ? {
              field: change.field,
              from: change.from && REDACTED,
              to: change.to && REDACTED,
            }
          : {
              field: change.field,
              from: scrub(change.from),
              to: scrub(change.to),
            },
      ),
    });
  }
}

async function linkedLeads(ctx: MutationCtx, person: Doc<"people">) {
  const ids = new Set<Id<"leads">>();
  const found: Doc<"leads">[] = [];
  const add = (lead: Doc<"leads"> | null) => {
    if (lead && !ids.has(lead._id)) {
      ids.add(lead._id);
      found.push(lead);
    }
  };
  for (const lead of await ctx.db
    .query("leads")
    .withIndex("by_person", (q) => q.eq("personId", person._id))
    .collect()) {
    add(lead);
  }
  if (person.email) {
    const email = person.email;
    for (const lead of await ctx.db
      .query("leads")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect()) {
      add(lead);
    }
  }
  if (person.phone) {
    const phone = person.phone;
    for (const lead of await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .collect()) {
      add(lead);
    }
  }
  for (const row of await personLedger(ctx, person._id)) {
    if (row.leadId) add(await ctx.db.get(row.leadId));
  }
  return found;
}

type Subject = { person?: Doc<"people">; leads: Doc<"leads">[] };

/** `generic` also redacts any email or phone; off for rows that aren't only about the subject. */
function scrubberFor({ person, leads }: Subject, generic = true) {
  const names: string[] = [];
  const identifiers: string[] = [];
  if (person) {
    names.push(
      `${person.firstName} ${person.lastName}`.trim(),
      person.firstName,
      person.lastName,
    );
    identifiers.push(
      ...[person.email, person.phone, person.linkedinUrl].filter(
        (value): value is string => Boolean(value),
      ),
    );
    if (person.phone) identifiers.push(person.phone.replace(/^\+91/, ""));
  }
  for (const lead of leads) {
    names.push(lead.name, ...lead.name.split(/\s+/));
    identifiers.push(
      ...[lead.email, lead.phone].filter((value): value is string =>
        Boolean(value),
      ),
    );
    if (lead.phone) identifiers.push(lead.phone.replace(/^\+91/, ""));
  }
  return makeScrubber(
    [...new Set(names.filter(Boolean))],
    [...new Set(identifiers)],
    generic,
  );
}

async function redactAround(
  ctx: MutationCtx,
  subject: Subject,
  scrub: Scrub,
  now: number,
) {
  const { person, leads } = subject;
  const consents: Doc<"consents">[] = [];
  const timeline: Doc<"timeline">[] = [];
  const tasks: Doc<"tasks">[] = [];
  const facts: Doc<"facts">[] = [];
  if (person) {
    const personId = person._id;
    consents.push(...(await personLedger(ctx, personId)));
    timeline.push(
      ...(await ctx.db
        .query("timeline")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect()),
    );
    tasks.push(
      ...(await ctx.db
        .query("tasks")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect()),
    );
    facts.push(
      ...(await ctx.db
        .query("facts")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect()),
    );
  }
  for (const lead of leads) {
    consents.push(...(await leadLedger(ctx, lead._id)));
    timeline.push(
      ...(await ctx.db
        .query("timeline")
        .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
        .collect()),
    );
    tasks.push(
      ...(await ctx.db
        .query("tasks")
        .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
        .collect()),
    );
    facts.push(
      ...(await ctx.db
        .query("facts")
        .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
        .collect()),
    );
  }
  const unique = <T extends { _id: string }>(docs: T[]) => [
    ...new Map(docs.map((doc) => [doc._id, doc])).values(),
  ];

  for (const row of unique(consents)) {
    await ctx.db.patch(row._id, {
      ip: undefined,
      text: row.actorId ? (scrub(row.text) ?? row.text) : row.text,
      redactedAt: now,
    });
  }
  await redactTimeline(ctx, unique(timeline), scrub);
  for (const task of unique(tasks)) {
    await ctx.db.patch(task._id, {
      title: scrub(task.title) ?? task.title,
      notes: scrub(task.notes),
    });
  }
  for (const fact of unique(facts)) await ctx.db.delete(fact._id);
  if (person) {
    const personId = person._id;
    const tasks = await ctx.db
      .query("researchTasks")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect();
    for (const task of tasks) await ctx.db.delete(task._id);
    const accountId = person.accountId;
    const accountTask = accountId
      ? await ctx.db
          .query("researchTasks")
          .withIndex("by_account", (q) => q.eq("accountId", accountId))
          .first()
      : null;
    if (accountTask) {
      await ctx.db.patch(accountTask._id, {
        summary: undefined,
        summaryHash: undefined,
      });
    }
  }

  const hrefs = [
    ...(person ? [routes.person(person._id)] : []),
    ...leads.map((lead) => lead._id as string),
  ];
  for (const notification of await ctx.db.query("notifications").collect()) {
    const href = notification.href ?? "";
    if (!hrefs.some((needle) => href.includes(needle))) continue;
    await ctx.db.patch(notification._id, {
      title: scrub(notification.title) ?? notification.title,
      body: undefined,
    });
  }
}

function scrubJson(raw: string, scrub: Scrub) {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return scrub(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, walk(item)]),
      );
    }
    return value;
  };
  try {
    return JSON.stringify(walk(JSON.parse(raw)));
  } catch {
    return REDACTED;
  }
}

/**
 * PII that lives outside the person's own rows: deal titles and contact
 * changes at their account, raw platform events and enrichment errors.
 */
async function redactBeyond(ctx: MutationCtx, subject: Subject) {
  const { person, leads } = subject;
  const scrub = scrubberFor(subject);
  const narrow = scrubberFor(subject, false);
  const runs: Doc<"enrichmentRuns">[] = [];
  if (person) {
    const personId = person._id;
    runs.push(
      ...(await ctx.db
        .query("enrichmentRuns")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect()),
    );
  }
  for (const lead of leads) {
    runs.push(
      ...(await ctx.db
        .query("enrichmentRuns")
        .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
        .collect()),
    );
  }
  for (const run of runs) {
    if (run.error) await ctx.db.patch(run._id, { error: scrub(run.error) });
  }

  const events: Doc<"platformEvents">[] = [];
  if (person?.platformUserId) {
    const userId = person.platformUserId;
    events.push(
      ...(await ctx.db
        .query("platformEvents")
        .withIndex("by_user_type", (q) => q.eq("userId", userId))
        .collect()),
    );
  }
  const account = person?.accountId ? await ctx.db.get(person.accountId) : null;
  if (account?.platformOrgId) {
    const orgId = account.platformOrgId;
    events.push(
      ...(await ctx.db
        .query("platformEvents")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()),
    );
  }
  for (const event of new Map(
    events.map((item) => [item._id, item]),
  ).values()) {
    const payload = scrubJson(event.payload, narrow);
    const error = narrow(event.error);
    if (payload !== event.payload || error !== event.error) {
      await ctx.db.patch(event._id, { payload, error });
    }
  }

  if (!person?.accountId) return;
  const accountId = person.accountId;
  const deals = await ctx.db
    .query("deals")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  for (const deal of deals) {
    const onDeal = deal.personIds.includes(person._id);
    const title = narrow(deal.title) ?? deal.title;
    if (!onDeal && title === deal.title) continue;
    await ctx.db.patch(deal._id, {
      title,
      personIds: deal.personIds.filter((id) => id !== person._id),
    });
    for (const entry of await ctx.db
      .query("timeline")
      .withIndex("by_deal", (q) => q.eq("dealId", deal._id))
      .collect()) {
      await ctx.db.patch(entry._id, {
        subject: narrow(entry.subject),
        body: narrow(entry.body),
        changes: entry.changes?.map((change) => ({
          field: change.field,
          from: narrow(change.from),
          to: narrow(change.to),
        })),
      });
    }
  }
}

async function anonymiseLeads(
  ctx: MutationCtx,
  leads: Doc<"leads">[],
  now: number,
) {
  for (const lead of leads) {
    await deleteAttachments(ctx, { leadId: lead._id });
    await ctx.db.patch(lead._id, {
      name: ERASED_NAME,
      email: undefined,
      phone: undefined,
      message: undefined,
      referrer: undefined,
      landingPage: undefined,
      erasedAt: now,
    });
  }
}

/**
 * Irreversibly anonymises a person and every lead tied to them. Consent rows
 * stay as proof that consent existed and that erasure happened, minus the PII.
 */
export async function erasePerson(
  ctx: MutationCtx,
  person: Doc<"people">,
  actorId: Id<"members">,
) {
  if (person.erasedAt) fail("conflict", "This person was already erased");
  const now = Date.now();
  const leads = (await linkedLeads(ctx, person)).filter(
    (lead) => !lead.erasedAt,
  );
  const scrub = scrubberFor({ person, leads });
  await redactAround(ctx, { person, leads }, scrub, now);
  await redactBeyond(ctx, { person, leads });
  await anonymiseLeads(ctx, leads, now);
  await deleteAttachments(ctx, { personId: person._id });
  await eraseSurveyData(ctx, person._id);
  await ctx.db.patch(person._id, {
    firstName: ERASED_NAME,
    lastName: "",
    email: undefined,
    phone: undefined,
    title: undefined,
    linkedinUrl: undefined,
    platformUserId: undefined,
    accountId: undefined,
    tags: [],
    custom: undefined,
    searchText: "",
    archivedAt: person.archivedAt ?? now,
    erasedAt: now,
    updatedAt: now,
  });
  await appendLedger(ctx, {
    personId: person._id,
    channels: CHANNELS,
    event: "erased",
    source: "erasure",
    text: "Personal data erased on request",
    actorId,
  });
  await logSystem(
    ctx,
    { personId: person._id },
    "erased this person's personal data",
    undefined,
    actorId,
  );
  return { leads: leads.length };
}

/** Erases a lead that never became a person. */
export async function eraseLead(
  ctx: MutationCtx,
  lead: Doc<"leads">,
  actorId: Id<"members">,
) {
  if (lead.erasedAt) fail("conflict", "This lead was already erased");
  if (lead.personId) {
    const person = await ctx.db.get(lead.personId);
    if (person && !person.erasedAt)
      return await erasePerson(ctx, person, actorId);
  }
  const now = Date.now();
  const scrub = scrubberFor({ leads: [lead] });
  await redactAround(ctx, { leads: [lead] }, scrub, now);
  await redactBeyond(ctx, { leads: [lead] });
  await anonymiseLeads(ctx, [lead], now);
  await appendLedger(ctx, {
    leadId: lead._id,
    channels: CHANNELS,
    event: "erased",
    source: "erasure",
    text: "Personal data erased on request",
    actorId,
  });
  await logSystem(
    ctx,
    { leadId: lead._id },
    "erased this lead's personal data",
    undefined,
    actorId,
  );
  return { leads: 1 };
}
