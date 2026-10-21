import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { notify, prefsFor } from "../notifications";
import {
  deliversInApp,
  entryHref,
  followEvent,
  followTitle,
  joinsBatch,
  recordKey,
  type RecordType,
} from "../../lib/domain/notifications";
import { recordName, snippet } from "./mentions";
import type { RecordRefs } from "./timeline";

type Entry = Pick<
  Doc<"timeline">,
  "_id" | "kind" | "subject" | "body" | "changes" | "actorId"
> &
  RecordRefs;

/** Followable records an entry touches, most specific first. */
function followable(refs: RecordRefs) {
  const records: { type: RecordType; id: string }[] = [];
  if (refs.dealId) records.push({ type: "deals", id: refs.dealId });
  if (refs.leadId) records.push({ type: "leads", id: refs.leadId });
  if (refs.accountId) records.push({ type: "accounts", id: refs.accountId });
  return records;
}

/**
 * Tells followers of the entry's records about it, at most one notification
 * per follower and record every ten minutes: later events join that one.
 * Someone following both a deal and its account hears once, about the deal.
 */
export async function notifyFollowers(
  ctx: MutationCtx,
  entry: Entry,
  skip: Iterable<Id<"members">> = [],
) {
  const event = followEvent(entry);
  if (!event) return;
  const skipped = new Set<Id<"members">>(skip);
  if (entry.actorId) skipped.add(entry.actorId);

  const assigned = new Map<Id<"members">, { type: RecordType; id: string }>();
  for (const record of followable(entry)) {
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_record", (q) =>
        q.eq("record", recordKey(record.type, record.id)),
      )
      .collect();
    for (const follow of follows) {
      if (skipped.has(follow.memberId) || assigned.has(follow.memberId)) {
        continue;
      }
      assigned.set(follow.memberId, record);
    }
  }
  if (assigned.size === 0) return;

  const actor = entry.actorId ? await ctx.db.get(entry.actorId) : null;
  const preview = entry.kind === "note" ? await snippet(ctx, entry.body) : null;
  const body = `${actor?.name ?? "Hypedrive"} ${event}${preview ? `: “${preview}”` : ""}`;
  const names = new Map<string, string>();
  const now = Date.now();

  for (const [memberId, record] of assigned) {
    const member = await ctx.db.get(memberId);
    if (!member || member.status !== "active") continue;
    const key = recordKey(record.type, record.id);
    if (!names.has(key)) {
      names.set(key, (await recordName(ctx, record)) ?? "A record you follow");
    }
    const name = names.get(key)!;
    const href = entryHref(record.type, record.id, entry._id);
    const latest = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_record", (q) =>
        q.eq("recipientId", memberId).eq("record", key),
      )
      .order("desc")
      .filter((q) => q.eq(q.field("kind"), "follow"))
      .first();
    if (
      latest &&
      joinsBatch(
        {
          createdAt: latest._creationTime,
          count: latest.count ?? 1,
          doneAt: latest.doneAt,
          snoozedUntil: latest.snoozedUntil,
        },
        now,
      )
    ) {
      const prefs = await prefsFor(ctx, memberId);
      if (!deliversInApp("follow", prefs?.muted ?? [])) continue;
      const count = (latest.count ?? 1) + 1;
      await ctx.db.patch(latest._id, {
        title: followTitle(name, count),
        body,
        href,
        count,
        actorId: entry.actorId,
        entryId: entry._id,
        readAt: undefined,
      });
      continue;
    }
    await notify(ctx, memberId, {
      kind: "follow",
      title: followTitle(name, 1),
      body,
      href,
      record: key,
      actorId: entry.actorId,
      entryId: entry._id,
      count: 1,
    });
  }
}
