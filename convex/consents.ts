import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  CONSENT_CHANNEL_LABEL,
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABEL,
  DEFAULT_RETENTION_DAYS,
  ERASE_CONFIRMATION,
  MAX_EVIDENCE,
  RETENTION_DAYS,
  basisOf,
  channelAddress,
  decideContact,
  deriveChannel,
  deriveErasure,
  eventOf,
  purposeOf,
  type ConsentPurpose,
  type ContactDecision,
} from "../lib/domain/consent";
import {
  CHANNELS,
  type Channel,
  type LifecycleStage,
} from "../lib/domain/enums";
import { cleanText } from "../lib/domain/normalize";
import {
  RETENTION_KEY,
  appendLedger,
  canContact,
  erasePerson,
  eraseLead as eraseLeadData,
  personLedger,
  storedRetentionDays,
  vConsentPurpose,
  vConsentSource,
  vLawfulBasis,
} from "./lib/consent";
import { fail, invalid, notFound } from "./lib/errors";
import {
  adminMutation,
  adminQuery,
  memberMutation,
  memberQuery,
} from "./lib/functions";
import { memberIndex, memberRef, requirePerson } from "./lib/records";
import { logSystem } from "./lib/timeline";
import { vChannel } from "./lib/validators";
import { isInteraction } from "./lib/timeline";

const DAY = 24 * 60 * 60_000;
const MAX_REVIEW = 100;
// Oldest people and leads past the cutoff that the review looks at; each costs a few reads.
const REVIEW_SCAN = 800;

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function evidence(note: string) {
  const text = cleanText(note);
  if (!text) invalid("note", "Add a note on how you know this");
  if (text.length > MAX_EVIDENCE) {
    invalid("note", `Keep the note under ${MAX_EVIDENCE} characters`);
  }
  return text;
}

async function requireLivePerson(ctx: MutationCtx, id: Id<"people">) {
  const person = await requirePerson(ctx, id);
  if (person.erasedAt) fail("conflict", "This person's data was erased");
  return person;
}

/** The person's consent matrix: per channel the derived status, the contact decision per purpose and the full history. */
export const forPerson = memberQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) return null;
    const [rows, members] = await Promise.all([
      personLedger(ctx, personId),
      memberIndex(ctx),
    ]);
    const erasure = deriveErasure(rows);
    const requested = rows
      .filter((row) => eventOf(row) === "erasure_requested")
      .sort((a, b) => b.recordedAt - a.recordedAt)[0];
    return {
      name: `${person.firstName} ${person.lastName}`.trim(),
      erasure: {
        ...erasure,
        note: erasure.status === "requested" ? (requested?.text ?? null) : null,
        by:
          erasure.status === "requested"
            ? memberRef(members, requested?.actorId)
            : null,
      },
      channels: CHANNELS.map((channel) => {
        const decisions = Object.fromEntries(
          CONSENT_PURPOSES.map((purpose) => [
            purpose,
            decideContact({
              rows,
              channel,
              purpose,
              hasAddress: Boolean(channelAddress(person, channel)),
              erasedAt: person.erasedAt,
            }),
          ]),
        ) as Record<ConsentPurpose, ContactDecision>;
        return {
          channel,
          hasAddress: Boolean(channelAddress(person, channel)),
          state: deriveChannel(rows, channel),
          decisions,
          history: rows
            .filter((row) => row.channel === channel)
            .sort(
              (a, b) =>
                b.recordedAt - a.recordedAt ||
                b._creationTime - a._creationTime,
            )
            .map((row) => ({
              _id: row._id,
              event: eventOf(row),
              basis: basisOf(row),
              purpose: purposeOf(row),
              source: row.source,
              text: row.text,
              actor: memberRef(members, row.actorId),
              recordedAt: row.recordedAt,
              redacted: Boolean(row.redactedAt),
            })),
        };
      }),
    };
  },
});

/** The `canContact` gate as a query, for UI that must explain a block before acting. */
export const check = memberQuery({
  args: {
    personId: v.id("people"),
    channel: vChannel,
    purpose: vConsentPurpose,
  },
  handler: async (ctx, { personId, channel, purpose }) =>
    await canContact(ctx, personId, channel, purpose),
});

/** Appends a grant or withdrawal for one or more channels, with the rep's evidence. */
export const record = memberMutation({
  args: {
    personId: v.id("people"),
    channels: v.array(vChannel),
    event: v.union(v.literal("grant"), v.literal("withdraw")),
    purpose: v.optional(vConsentPurpose),
    basis: v.optional(vLawfulBasis),
    source: vConsentSource,
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const person = await requireLivePerson(ctx, args.personId);
    const channels = CHANNELS.filter((channel) =>
      args.channels.includes(channel),
    );
    if (channels.length === 0) invalid("channels", "Pick at least one channel");
    const text = evidence(args.note);
    const grant = args.event === "grant";
    if (grant && !args.purpose) invalid("purpose", "Pick what it's for");
    if (grant && !args.basis) invalid("basis", "Pick the lawful basis");
    if (grant && channels.includes("whatsapp") && args.basis !== "consent") {
      invalid(
        "basis",
        "WhatsApp needs their opt-in, so the basis must be consent",
      );
    }
    if (
      grant &&
      deriveErasure(await personLedger(ctx, person._id)).status !== "none"
    ) {
      fail("conflict", "They asked for erasure; dismiss the request first");
    }
    await appendLedger(ctx, {
      personId: person._id,
      channels,
      event: args.event,
      purpose: args.purpose,
      basis: grant ? args.basis : undefined,
      source: args.source,
      text,
      actorId: ctx.viewer._id,
    });
    const what = args.purpose
      ? CONSENT_PURPOSE_LABEL[args.purpose].toLowerCase()
      : "everything";
    const on = list(channels.map((channel) => CONSENT_CHANNEL_LABEL[channel]));
    await logSystem(
      ctx,
      { personId: person._id, accountId: person.accountId },
      grant
        ? `recorded consent to ${what} by ${on}`
        : `recorded a withdrawal of consent to ${what} by ${on}`,
      text,
      ctx.viewer._id,
    );
  },
});

/** Flags or clears DND on the person's number; blocks promotional calls and SMS while on. */
export const setDnd = memberMutation({
  args: {
    personId: v.id("people"),
    on: v.boolean(),
    source: vConsentSource,
    note: v.string(),
  },
  handler: async (ctx, { personId, on, source, note }) => {
    const person = await requireLivePerson(ctx, personId);
    const text = evidence(note);
    const current = deriveChannel(await personLedger(ctx, personId), "phone");
    if (current.dnd.on === on) {
      fail("conflict", on ? "The number is already on DND" : "DND isn't set");
    }
    await appendLedger(ctx, {
      personId,
      channels: ["phone"],
      event: on ? "dnd_on" : "dnd_off",
      source,
      text,
      actorId: ctx.viewer._id,
    });
    await logSystem(
      ctx,
      { personId, accountId: person.accountId },
      on ? "marked the number as DND" : "cleared DND on the number",
      text,
      ctx.viewer._id,
    );
  },
});

/** Records that the person asked to be erased. Contact stops at once; an admin carries it out. */
export const requestErasure = memberMutation({
  args: { personId: v.id("people"), source: vConsentSource, note: v.string() },
  handler: async (ctx, { personId, source, note }) => {
    const person = await requireLivePerson(ctx, personId);
    const text = evidence(note);
    if (deriveErasure(await personLedger(ctx, personId)).status !== "none") {
      fail("conflict", "Erasure was already requested");
    }
    await appendLedger(ctx, {
      personId,
      channels: CHANNELS,
      event: "erasure_requested",
      source,
      text,
      actorId: ctx.viewer._id,
    });
    await logSystem(
      ctx,
      { personId, accountId: person.accountId },
      "recorded a request to erase their personal data",
      text,
      ctx.viewer._id,
    );
  },
});

export const dismissErasure = adminMutation({
  args: { personId: v.id("people"), note: v.string() },
  handler: async (ctx, { personId, note }) => {
    const person = await requireLivePerson(ctx, personId);
    const text = evidence(note);
    if (
      deriveErasure(await personLedger(ctx, personId)).status !== "requested"
    ) {
      fail("conflict", "There's no open erasure request");
    }
    await appendLedger(ctx, {
      personId,
      channels: CHANNELS,
      event: "erasure_cancelled",
      source: "other",
      text,
      actorId: ctx.viewer._id,
    });
    await logSystem(
      ctx,
      { personId, accountId: person.accountId },
      "dismissed the erasure request",
      text,
      ctx.viewer._id,
    );
  },
});

function confirmErasure(confirmation: string) {
  if (confirmation.trim().toLowerCase() !== ERASE_CONFIRMATION) {
    invalid("confirmation", `Type “${ERASE_CONFIRMATION}” to confirm`);
  }
}

/** Irreversible: anonymises the person and linked leads, keeps PII-free consent proof. */
export const erase = adminMutation({
  args: { personId: v.id("people"), confirmation: v.string() },
  handler: async (ctx, { personId, confirmation }) => {
    confirmErasure(confirmation);
    const person = await requirePerson(ctx, personId);
    return await erasePerson(ctx, person, ctx.viewer._id);
  },
});

export const eraseLead = adminMutation({
  args: { leadId: v.id("leads"), confirmation: v.string() },
  handler: async (ctx, { leadId, confirmation }) => {
    confirmErasure(confirmation);
    const lead = await ctx.db.get(leadId);
    if (!lead) notFound("Lead");
    return await eraseLeadData(ctx, lead, ctx.viewer._id);
  },
});

/** Logs on the timeline that a rep contacted someone the gate blocked. */
export const logOverride = memberMutation({
  args: { personId: v.id("people"), channel: vChannel },
  handler: async (ctx, { personId, channel }) => {
    const person = await requirePerson(ctx, personId);
    const decision = await canContact(ctx, personId, channel, "sales_outreach");
    if (decision.allowed) return;
    const verb: Record<Channel, string> = {
      email: "emailed them",
      phone: "called them",
      whatsapp: "messaged them on WhatsApp",
    };
    await logSystem(
      ctx,
      { personId, accountId: person.accountId },
      `${verb[channel]} despite a consent block`,
      decision.message,
      ctx.viewer._id,
    );
  },
});

const PROSPECT_STAGES = new Set<LifecycleStage>([
  "prospect",
  "lead",
  "qualified",
  "demo",
  "disqualified",
  "dormant",
]);

async function lastInteraction(
  ctx: Parameters<typeof personLedger>[0],
  target: { personId: Id<"people"> } | { leadId: Id<"leads"> },
) {
  const query =
    "personId" in target
      ? ctx.db
          .query("timeline")
          .withIndex("by_person", (q) => q.eq("personId", target.personId))
      : ctx.db
          .query("timeline")
          .withIndex("by_lead", (q) => q.eq("leadId", target.leadId));
  for await (const entry of query.order("desc")) {
    if (isInteraction(entry)) return entry.occurredAt;
  }
  return null;
}

/** Settings → Privacy: retention window, open erasure requests and stale prospects to review. */
export const privacy = adminQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stored = await storedRetentionDays(ctx);
    const days = stored ?? DEFAULT_RETENTION_DAYS;
    const cutoff = now - days * DAY;
    const members = await memberIndex(ctx);

    const requestRows = await ctx.db
      .query("consents")
      .withIndex("by_event", (q) => q.eq("event", "erasure_requested"))
      .collect();
    const requestedIds = [
      ...new Set(
        requestRows
          .map((row) => row.personId)
          .filter((id): id is Id<"people"> => Boolean(id)),
      ),
    ];
    const requests = [];
    for (const personId of requestedIds) {
      const person = await ctx.db.get(personId);
      if (!person || person.erasedAt) continue;
      const rows = await personLedger(ctx, personId);
      const erasure = deriveErasure(rows);
      if (erasure.status !== "requested") continue;
      const latest = rows
        .filter((row) => eventOf(row) === "erasure_requested")
        .sort((a, b) => b.recordedAt - a.recordedAt)[0];
      requests.push({
        personId,
        name: `${person.firstName} ${person.lastName}`.trim(),
        requestedAt: erasure.at ?? latest.recordedAt,
        by: memberRef(members, latest.actorId),
        note: latest.text,
      });
    }
    requests.sort((a, b) => a.requestedAt - b.requestedAt);

    const [people, leads, deals, reviews] = await Promise.all([
      ctx.db
        .query("people")
        .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
        .take(REVIEW_SCAN),
      ctx.db
        .query("leads")
        .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
        .take(REVIEW_SCAN),
      ctx.db.query("deals").collect(),
      ctx.db.query("retentionReviews").collect(),
    ]);
    const engaged = new Set(
      deals
        .filter((deal) => deal.stage !== "lost")
        .flatMap((deal) => deal.personIds),
    );
    const kept = new Set(
      reviews
        .filter((review) => review.keptAt >= cutoff)
        .map((review) => review.personId ?? review.leadId),
    );

    type Stale = {
      kind: "person" | "lead";
      id: Id<"people"> | Id<"leads">;
      name: string;
      company: string | null;
      lastTouchAt: number;
      createdAt: number;
    };
    const stale: Stale[] = [];
    for (const person of people) {
      if (person.archivedAt || person.erasedAt) continue;
      if (person._creationTime >= cutoff || engaged.has(person._id)) continue;
      if (kept.has(person._id)) continue;
      const account = person.accountId
        ? await ctx.db.get(person.accountId)
        : null;
      if (account && !PROSPECT_STAGES.has(account.stage)) continue;
      const touched = await lastInteraction(ctx, { personId: person._id });
      if (touched !== null && touched >= cutoff) continue;
      stale.push({
        kind: "person",
        id: person._id,
        name: `${person.firstName} ${person.lastName}`.trim(),
        company: account?.name ?? null,
        lastTouchAt: touched ?? person._creationTime,
        createdAt: person._creationTime,
      });
    }
    for (const lead of leads) {
      if (lead.status === "converted" || lead.erasedAt) continue;
      if (lead._creationTime >= cutoff || kept.has(lead._id)) continue;
      const touched = await lastInteraction(ctx, { leadId: lead._id });
      if (touched !== null && touched >= cutoff) continue;
      stale.push({
        kind: "lead",
        id: lead._id,
        name: lead.name,
        company: lead.companyName || null,
        lastTouchAt: touched ?? lead._creationTime,
        createdAt: lead._creationTime,
      });
    }
    stale.sort((a, b) => a.lastTouchAt - b.lastTouchAt);

    return {
      retentionDays: days,
      isDefault: stored === null,
      defaultDays: DEFAULT_RETENTION_DAYS,
      requests,
      stale: stale.slice(0, MAX_REVIEW),
      staleTotal: stale.length,
    };
  },
});

/** `null` resets to the default. Returns the previous stored value for undo. */
export const setRetentionDays = adminMutation({
  args: { days: v.union(v.number(), v.null()) },
  handler: async (ctx, { days }) => {
    if (
      days !== null &&
      (!Number.isInteger(days) ||
        days < RETENTION_DAYS.min ||
        days > RETENTION_DAYS.max)
    ) {
      invalid(
        "days",
        `Enter whole days between ${RETENTION_DAYS.min} and ${RETENTION_DAYS.max}`,
      );
    }
    const previous = await storedRetentionDays(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", RETENTION_KEY))
      .unique();
    if (days === null) {
      if (row) await ctx.db.delete(row._id);
    } else if (row) {
      await ctx.db.patch(row._id, { value: String(days) });
    } else {
      await ctx.db.insert("settings", {
        key: RETENTION_KEY,
        value: String(days),
      });
    }
    return { previous };
  },
});

/** Keeps a stale prospect out of the review list for one retention window. */
export const keep = adminMutation({
  args: {
    personId: v.optional(v.id("people")),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, { personId, leadId }) => {
    if (Boolean(personId) === Boolean(leadId)) {
      invalid("target", "Pick a person or a lead");
    }
    const doc: Doc<"people"> | Doc<"leads"> | null = personId
      ? await ctx.db.get(personId)
      : await ctx.db.get(leadId!);
    if (!doc) notFound(personId ? "Person" : "Lead");
    return await ctx.db.insert("retentionReviews", {
      personId,
      leadId,
      keptById: ctx.viewer._id,
      keptAt: Date.now(),
    });
  },
});

export const unkeep = adminMutation({
  args: { id: v.id("retentionReviews") },
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
