import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { notify } from "../notifications";
import { bodyText, mentionIds } from "../../lib/domain/mentions";
import {
  entryHref,
  recordKey,
  type RecordType,
} from "../../lib/domain/notifications";
import type { RecordRefs } from "./timeline";

const SNIPPET = 140;

/** Active members mentioned in a body; tokens for anyone else stay as text. */
export async function resolveMentions(ctx: QueryCtx, body: string | undefined) {
  const ids: Id<"members">[] = [];
  for (const raw of mentionIds(body)) {
    const id = ctx.db.normalizeId("members", raw);
    const member = id ? await ctx.db.get(id) : null;
    if (member && member.status === "active") ids.push(member._id);
  }
  return ids;
}

/** The record an entry is filed on, most specific first: lead, deal, person, account. */
export function primaryRecord(
  refs: RecordRefs,
): { type: RecordType; id: string } | null {
  if (refs.leadId) return { type: "leads", id: refs.leadId };
  if (refs.dealId) return { type: "deals", id: refs.dealId };
  if (refs.personId) return { type: "people", id: refs.personId };
  if (refs.accountId) return { type: "accounts", id: refs.accountId };
  return null;
}

export async function recordName(
  ctx: QueryCtx,
  record: { type: RecordType; id: string },
) {
  if (record.type === "leads") {
    const id = ctx.db.normalizeId("leads", record.id);
    const lead = id ? await ctx.db.get(id) : null;
    return lead ? lead.companyName || lead.name : null;
  }
  if (record.type === "deals") {
    const id = ctx.db.normalizeId("deals", record.id);
    return (id ? await ctx.db.get(id) : null)?.title ?? null;
  }
  if (record.type === "people") {
    const id = ctx.db.normalizeId("people", record.id);
    const person = id ? await ctx.db.get(id) : null;
    return person ? `${person.firstName} ${person.lastName}`.trim() : null;
  }
  const id = ctx.db.normalizeId("accounts", record.id);
  return (id ? await ctx.db.get(id) : null)?.name ?? null;
}

/** A one-line preview of a body with mentions written out as names. */
export async function snippet(ctx: QueryCtx, body: string | undefined) {
  if (!body) return undefined;
  const names = new Map<string, string>();
  for (const raw of mentionIds(body)) {
    const id = ctx.db.normalizeId("members", raw);
    const member = id ? await ctx.db.get(id) : null;
    if (member) names.set(raw, member.name);
  }
  const text = bodyText(body, (id) => names.get(id))
    .replace(/\s+/g, " ")
    .trim();
  return text.length > SNIPPET ? `${text.slice(0, SNIPPET - 1)}…` : text;
}

const VERB: Record<string, string> = {
  note: "in a note",
  call: "on a call log",
  meeting: "in meeting notes",
  email: "in an email log",
  whatsapp: "in a WhatsApp log",
};

/** Tells each mentioned member, except the author, where they were mentioned. */
export async function notifyMentions(
  ctx: MutationCtx,
  entry: Pick<Doc<"timeline">, "_id" | "kind" | "body"> & RecordRefs,
  actor: Doc<"members">,
  recipients: Id<"members">[],
) {
  const targets = recipients.filter((id) => id !== actor._id);
  if (targets.length === 0) return;
  const record = primaryRecord(entry);
  if (!record) return;
  const name = (await recordName(ctx, record)) ?? "a record";
  const preview = await snippet(ctx, entry.body);
  for (const recipientId of new Set(targets)) {
    await notify(ctx, recipientId, {
      kind: "mention",
      title:
        `${actor.name} mentioned you ${VERB[entry.kind] ?? ""} on ${name}`.replace(
          /\s+/g,
          " ",
        ),
      body: preview,
      href: entryHref(record.type, record.id, entry._id),
      record: recordKey(record.type, record.id),
      actorId: actor._id,
      entryId: entry._id,
    });
  }
}
