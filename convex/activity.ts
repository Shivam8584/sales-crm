import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { bodyText } from "../lib/domain/mentions";
import { memberQuery } from "./lib/functions";
import { memberIndex, memberRef } from "./lib/records";
import { literals } from "./lib/validators";

export const FEED_KINDS = [
  "all",
  "changes",
  "calls",
  "notes",
  "system",
] as const;
export const FEED_RECORDS = ["accounts", "people", "leads", "deals"] as const;

// One paginated read can follow one index range, so "calls" leaves out meetings.
const KIND = {
  changes: "change",
  calls: "call",
  notes: "note",
  system: "system",
} as const;

/** Most specific first: a lead's own entries also carry its account and person. */
const REF = {
  deals: "dealId",
  leads: "leadId",
  people: "personId",
  accounts: "accountId",
} as const;
const PRECEDENCE = ["deals", "leads", "people", "accounts"] as const;

const MAX_SUBJECT = 200;
// A rare actor or record type can mean scanning far past a page of matches.
const MAX_SCAN = 600;

type RecordType = (typeof FEED_RECORDS)[number];

const clip = (text: string | undefined) =>
  text && text.length > MAX_SUBJECT ? `${text.slice(0, MAX_SUBJECT)}…` : text;

const primaryType = (entry: Doc<"timeline">): RecordType | null =>
  PRECEDENCE.find((type) => entry[REF[type]] !== undefined) ?? null;

/** Everyone's changes, calls and notes, newest first, a page at a time. */
export const feed = memberQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    kind: literals(FEED_KINDS),
    actorId: v.optional(v.id("members")),
    recordType: v.optional(literals(FEED_RECORDS)),
    since: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { paginationOpts, kind, actorId, recordType, since },
  ) => {
    const timeline = ctx.db.query("timeline");
    const source =
      kind === "all"
        ? timeline.withIndex("by_creation_time", (q) =>
            since === undefined ? q : q.gte("_creationTime", since),
          )
        : timeline.withIndex("by_kind", (q) =>
            since === undefined
              ? q.eq("kind", KIND[kind])
              : q.eq("kind", KIND[kind]).gte("occurredAt", since),
          );

    const result = await source
      .order("desc")
      .filter((q) => {
        const conditions = [];
        if (actorId) conditions.push(q.eq(q.field("actorId"), actorId));
        if (recordType) {
          for (const type of PRECEDENCE) {
            const field = q.field(REF[type]);
            if (type === recordType) {
              conditions.push(q.neq(field, undefined));
              break;
            }
            conditions.push(q.eq(field, undefined));
          }
        }
        return conditions.length ? q.and(...conditions) : true;
      })
      .paginate({ ...paginationOpts, maximumRowsRead: MAX_SCAN });

    const members = await memberIndex(ctx);
    const ids = <T extends string>(
      pick: (entry: Doc<"timeline">) => T | undefined,
    ) => [...new Set(result.page.flatMap((entry) => pick(entry) ?? []))];
    const accountIds = ids((entry) =>
      primaryType(entry) === "accounts" ? entry.accountId : undefined,
    );
    const [accounts, people, leads, deals] = await Promise.all([
      Promise.all(accountIds.map((id) => ctx.db.get(id))),
      Promise.all(ids((entry) => entry.personId).map((id) => ctx.db.get(id))),
      Promise.all(ids((entry) => entry.leadId).map((id) => ctx.db.get(id))),
      Promise.all(ids((entry) => entry.dealId).map((id) => ctx.db.get(id))),
    ]);
    const byId = new Map<
      string,
      Doc<"accounts"> | Doc<"people"> | Doc<"leads"> | Doc<"deals">
    >(
      [...accounts, ...people, ...leads, ...deals].flatMap((doc) =>
        doc ? [[doc._id, doc]] : [],
      ),
    );
    const erased = (id: Id<"people"> | Id<"leads"> | undefined) => {
      const doc = id ? byId.get(id) : undefined;
      return (
        doc !== undefined && "erasedAt" in doc && doc.erasedAt !== undefined
      );
    };

    const nameOf = (
      type: RecordType,
      doc: NonNullable<ReturnType<typeof byId.get>>,
    ) =>
      type === "deals"
        ? (doc as Doc<"deals">).title
        : type === "people"
          ? `${(doc as Doc<"people">).firstName} ${(doc as Doc<"people">).lastName}`.trim()
          : (doc as Doc<"accounts"> | Doc<"leads">).name;

    const page = result.page
      .filter((entry) => !erased(entry.personId) && !erased(entry.leadId))
      .map((entry) => {
        const type = primaryType(entry);
        const id = type ? entry[REF[type]] : undefined;
        const doc = id ? byId.get(id) : undefined;
        const body =
          entry.body &&
          bodyText(entry.body, (id) => members.get(id as Id<"members">)?.name);
        return {
          _id: entry._id,
          kind: entry.kind,
          at: entry.occurredAt,
          actor: memberRef(members, entry.actorId),
          automated: entry.automated === true,
          subject: clip(entry.subject ?? body ?? undefined),
          record:
            type && id && doc
              ? {
                  type,
                  id,
                  name: nameOf(type, doc) || "Unnamed",
                  href: `/${type}/${id}`,
                  archived: "archivedAt" in doc && doc.archivedAt !== undefined,
                }
              : null,
          changes: entry.changes,
        };
      });
    return { ...result, page };
  },
});
