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

const vLoggable = literals(["note", "call", "email", "meeting", "whatsapp"]);

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

function entriesFor(ctx: QueryCtx, target: typeof vTarget.type) {
  const timeline = ctx.db.query("timeline");
  if ("accountId" in target) {
    return timeline.withIndex("by_account", (q) =>
      q.eq("accountId", target.accountId),
    );
  }
  if ("personId" in target) {
    return timeline.withIndex("by_person", (q) =>
      q.eq("personId", target.personId),
    );
  }
  if ("dealId" in target) {
    return timeline.withIndex("by_deal", (q) => q.eq("dealId", target.dealId));
  }
  return timeline.withIndex("by_lead", (q) => q.eq("leadId", target.leadId));
}

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
