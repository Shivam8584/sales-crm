import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, invalid, notFound } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import { isOpen } from "./lib/leads";
import { memberIndex, memberRef } from "./lib/records";
import type { RecordRefs } from "./lib/timeline";
import { literals, vCallOutcome } from "./lib/validators";

const MAX_BODY = 10_000;
const PAGE = 200;

const LOGGABLE = ["note", "call", "email", "meeting", "whatsapp"] as const;
const vLoggable = literals(LOGGABLE);

const vTarget = v.union(
  v.object({ accountId: v.id("accounts") }),
  v.object({ personId: v.id("people") }),
  v.object({ dealId: v.id("deals") }),
  v.object({ leadId: v.id("leads") }),
);

async function touch(ctx: MutationCtx, refs: RecordRefs, at: number) {
  for (const id of [refs.accountId, refs.personId]) {
    if (!id) continue;
    const doc = await ctx.db.get(id);
    if (doc && (doc.lastActivityAt ?? 0) < at) {
      await ctx.db.patch(id, { lastActivityAt: at });
    }
  }
}

function entriesFor(ctx: QueryCtx, target: typeof vTarget.type, since = 0) {
  const timeline = ctx.db.query("timeline");
  if ("accountId" in target) {
    return timeline.withIndex("by_account", (q) =>
      q.eq("accountId", target.accountId).gte("occurredAt", since),
    );
  }
  if ("personId" in target) {
    return timeline.withIndex("by_person", (q) =>
      q.eq("personId", target.personId).gte("occurredAt", since),
    );
  }
  if ("dealId" in target) {
    return timeline.withIndex("by_deal", (q) =>
      q.eq("dealId", target.dealId).gte("occurredAt", since),
    );
  }
  return timeline.withIndex("by_lead", (q) =>
    q.eq("leadId", target.leadId).gte("occurredAt", since),
  );
}

const DAY = 24 * 60 * 60_000;
// Days are counted in India time, where the team works.
const IST_OFFSET = 330 * 60_000;
const INTERACTIONS = new Set<string>(LOGGABLE);

export function isInteraction(kind: string) {
  return INTERACTIONS.has(kind);
}

/** Start of the window that holds `days` India-time days, today included. */
export function windowStart(days: number, now: number) {
  const today = Math.floor((now + IST_OFFSET) / DAY);
  return (today - days + 1) * DAY - IST_OFFSET;
}

/** Counts per bucket of `size` days across the window, oldest first. */
export function bucketCounts(
  times: number[],
  days: number,
  now: number,
  size = 1,
) {
  const start = windowStart(days, now);
  const buckets = Array.from({ length: Math.ceil(days / size) }, () => 0);
  for (const at of times) {
    if (at < start) continue;
    const index = Math.floor((at - start) / DAY / size);
    if (index < buckets.length) buckets[index]++;
  }
  return buckets;
}

/** The newest logged interaction on an account or person: one indexed read per kind. */
export async function latestInteraction(
  ctx: QueryCtx,
  target: { accountId: Id<"accounts"> } | { personId: Id<"people"> },
) {
  const latest = await Promise.all(
    LOGGABLE.map((kind) =>
      "accountId" in target
        ? ctx.db
            .query("timeline")
            .withIndex("by_account_kind", (q) =>
              q.eq("accountId", target.accountId).eq("kind", kind),
            )
            .order("desc")
            .first()
        : ctx.db
            .query("timeline")
            .withIndex("by_person_kind", (q) =>
              q.eq("personId", target.personId).eq("kind", kind),
            )
            .order("desc")
            .first(),
    ),
  );
  let last: Doc<"timeline"> | null = null;
  for (const entry of latest) {
    if (entry && (!last || entry.occurredAt > last.occurredAt)) last = entry;
  }
  return last
    ? { at: last.occurredAt, kind: last.kind, subject: last.subject ?? null }
    : null;
}

const WINDOW_BUCKET = { 7: 1, 30: 1, 90: 3 } as const;

/** Interactions logged on a record in the last 7, 30 or 90 days, by kind and over time. */
export const activity = memberQuery({
  args: {
    target: vTarget,
    days: v.union(v.literal(7), v.literal(30), v.literal(90)),
  },
  handler: async (ctx, { target, days }) => {
    const now = Date.now();
    const entries = (
      await entriesFor(ctx, target, windowStart(days, now)).collect()
    ).filter((entry) => isInteraction(entry.kind));
    const count = (...kinds: string[]) =>
      entries.filter((entry) => kinds.includes(entry.kind)).length;
    return {
      touches: entries.length,
      emails: count("email"),
      meetings: count("meeting"),
      calls: count("call", "whatsapp"),
      notes: count("note"),
      bucketDays: WINDOW_BUCKET[days],
      buckets: bucketCounts(
        entries.map((entry) => entry.occurredAt),
        days,
        now,
        WINDOW_BUCKET[days],
      ),
    };
  },
});

/**
 * Newest first. An account's timeline includes entries logged on its people
 * and deals.
 */
export const forRecord = memberQuery({
  args: { target: vTarget },
  handler: async (ctx, { target }) => {
    const entries = await entriesFor(ctx, target).order("desc").take(PAGE);
    const members = await memberIndex(ctx);
    const personIds = [
      ...new Set(entries.map((entry) => entry.personId).filter(Boolean)),
    ] as Id<"people">[];
    const dealIds = [
      ...new Set(entries.map((entry) => entry.dealId).filter(Boolean)),
    ] as Id<"deals">[];
    const people = new Map<Id<"people">, Doc<"people">>();
    for (const id of personIds) {
      const person = await ctx.db.get(id);
      if (person) people.set(id, person);
    }
    const deals = new Map<Id<"deals">, Doc<"deals">>();
    for (const id of dealIds) {
      const deal = await ctx.db.get(id);
      if (deal) deals.set(id, deal);
    }
    return entries.map((entry) => {
      const person = entry.personId ? people.get(entry.personId) : undefined;
      const deal = entry.dealId ? deals.get(entry.dealId) : undefined;
      return {
        ...entry,
        actor: memberRef(members, entry.actorId),
        person: person
          ? {
              _id: person._id,
              name: `${person.firstName} ${person.lastName}`.trim(),
            }
          : null,
        deal: deal ? { _id: deal._id, title: deal.title } : null,
      };
    });
  },
});

/**
 * Returns whether this entry was the lead's first touch. Only the owner's own
 * activity stops the SLA clock, so a manager's note doesn't hide a slow reply.
 */
export const log = memberMutation({
  args: {
    target: vTarget,
    kind: vLoggable,
    body: v.optional(v.string()),
    subject: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
    durationMin: v.optional(v.number()),
    outcome: v.optional(vCallOutcome),
  },
  handler: async (ctx, args) => {
    const body = args.body?.trim() || undefined;
    if (args.kind === "note" && !body) invalid("body", "Write something first");
    if (body && body.length > MAX_BODY) invalid("body", "That is too long");
    const occurredAt = args.occurredAt ?? Date.now();
    if (occurredAt > Date.now() + 60_000) {
      invalid("occurredAt", "That time is in the future");
    }
    if (
      args.durationMin !== undefined &&
      (args.durationMin < 0 || args.durationMin > 600)
    ) {
      invalid("durationMin", "Enter minutes between 0 and 600");
    }

    let refs: RecordRefs;
    let lead: Doc<"leads"> | null = null;
    if ("leadId" in args.target) {
      lead = await ctx.db.get(args.target.leadId);
      if (!lead) notFound("Lead");
      refs = {
        leadId: lead._id,
        accountId: lead.accountId,
        personId: lead.personId,
      };
    } else if ("dealId" in args.target) {
      const deal = await ctx.db.get(args.target.dealId);
      if (!deal) notFound("Deal");
      refs = { dealId: deal._id, accountId: deal.accountId };
    } else if ("personId" in args.target) {
      const person = await ctx.db.get(args.target.personId);
      if (!person) notFound("Person");
      if (person.erasedAt) {
        fail(
          "forbidden",
          "This person's data was erased, so nothing new can be logged",
        );
      }
      refs = { personId: person._id, accountId: person.accountId };
    } else {
      if (!(await ctx.db.get(args.target.accountId))) notFound("Account");
      refs = { accountId: args.target.accountId };
    }

    const id = await ctx.db.insert("timeline", {
      ...refs,
      kind: args.kind,
      actorId: ctx.viewer._id,
      occurredAt,
      subject: args.subject?.trim() || undefined,
      body,
      durationMin: args.durationMin,
      outcome: args.kind === "call" ? args.outcome : undefined,
    });
    await touch(ctx, refs, occurredAt);

    const firstTouch =
      lead !== null &&
      !lead.firstTouchedAt &&
      lead.ownerId === ctx.viewer._id &&
      isOpen(lead);
    if (lead && firstTouch) {
      await ctx.db.patch(lead._id, {
        firstTouchedAt: Math.max(lead._creationTime, occurredAt),
        ...(args.kind !== "note" && lead.status === "new"
          ? { status: "contacted" as const }
          : {}),
      });
    }
    return { id, firstTouch };
  },
});

async function editableEntry(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  id: Id<"timeline">,
) {
  const entry = await ctx.db.get(id);
  if (!entry) notFound("Entry");
  if (entry.kind === "change" || entry.kind === "system") {
    fail("forbidden", "Automatic entries can't be changed");
  }
  if (entry.actorId !== ctx.viewer._id && ctx.viewer.role !== "admin") {
    fail("forbidden", "Only the author or an admin can change this");
  }
  const person = entry.personId ? await ctx.db.get(entry.personId) : null;
  if (person?.erasedAt) {
    fail("forbidden", "This person's data was erased and can't be changed");
  }
  return entry;
}

export const edit = memberMutation({
  args: { id: v.id("timeline"), body: v.string() },
  handler: async (ctx, { id, body }) => {
    const entry = await editableEntry(ctx, id);
    const text = body.trim();
    if (!text && entry.kind === "note")
      invalid("body", "Write something first");
    if (text.length > MAX_BODY) invalid("body", "That is too long");
    await ctx.db.patch(id, { body: text || undefined, editedAt: Date.now() });
  },
});

/** Returns the removed entry so the client can restore it. */
export const remove = memberMutation({
  args: { id: v.id("timeline") },
  handler: async (ctx, { id }) => {
    const entry = await editableEntry(ctx, id);
    await ctx.db.delete(id);
    const { _id, _creationTime, ...fields } = entry;
    void _id;
    void _creationTime;
    return fields;
  },
});

export const restore = memberMutation({
  args: {
    entry: v.object({
      kind: vLoggable,
      accountId: v.optional(v.id("accounts")),
      personId: v.optional(v.id("people")),
      dealId: v.optional(v.id("deals")),
      leadId: v.optional(v.id("leads")),
      actorId: v.optional(v.id("members")),
      occurredAt: v.number(),
      subject: v.optional(v.string()),
      body: v.optional(v.string()),
      durationMin: v.optional(v.number()),
      outcome: v.optional(vCallOutcome),
      editedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { entry }) => {
    if (entry.actorId !== ctx.viewer._id && ctx.viewer.role !== "admin") {
      fail("forbidden", "Only the author or an admin can restore this");
    }
    return await ctx.db.insert("timeline", entry);
  },
});
