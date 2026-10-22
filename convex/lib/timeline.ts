import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { notifyFollowers } from "./follows";

export type RecordRefs = {
  accountId?: Id<"accounts">;
  personId?: Id<"people">;
  dealId?: Id<"deals">;
  leadId?: Id<"leads">;
};

type Change = { field: string; from?: string; to?: string };

export const INTERACTION_KINDS = [
  "note",
  "call",
  "email",
  "meeting",
  "whatsapp",
] as const;

/**
 * Something a teammate did with the customer. Automation sends (queued in the
 * outbox or not) have no actor, so they never move last activity, the last
 * interaction or a lead's first touch.
 */
export function isInteraction(entry: {
  kind: string;
  actorId?: unknown;
  automated?: boolean;
  direction?: "inbound" | "outbound";
}) {
  return (
    (INTERACTION_KINDS as readonly string[]).includes(entry.kind) &&
    (entry.actorId !== undefined || entry.direction === "inbound") &&
    !entry.automated
  );
}

/**
 * The newest teammate interaction among entries sorted newest first. A hit in
 * the list beats anything older that isn't in it, so a miss is only
 * conclusive when the list held every entry.
 */
export function newestInteraction<
  T extends {
    kind: string;
    occurredAt: number;
    actorId?: unknown;
    automated?: boolean;
  },
>(rows: (T | null)[]): T | null {
  const byKind = new Map<string, T>();
  for (const row of rows) {
    if (
      row &&
      row.actorId !== undefined &&
      !row.automated &&
      !byKind.has(row.kind)
    ) {
      byKind.set(row.kind, row);
    }
  }
  let last: T | null = null;
  for (const kind of INTERACTION_KINDS) {
    const entry = byKind.get(kind);
    if (entry && (!last || entry.occurredAt > last.occurredAt)) last = entry;
  }
  return last;
}

function display(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.join(", ") || undefined;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Field-level differences between two versions of a record, by label. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  labels: Partial<Record<keyof T & string, string>>,
): Change[] {
  const changes: Change[] = [];
  for (const [key, label] of Object.entries(labels) as [string, string][]) {
    if (!(key in after)) continue;
    const from = display(before[key]);
    const to = display(after[key]);
    if (from !== to) changes.push({ field: label, from, to });
  }
  return changes;
}

export async function logChanges(
  ctx: MutationCtx,
  refs: RecordRefs,
  actorId: Id<"members"> | undefined,
  changes: Change[],
) {
  if (changes.length === 0) return null;
  const entry = { ...refs, kind: "change" as const, actorId, changes };
  const id = await ctx.db.insert("timeline", {
    ...entry,
    occurredAt: Date.now(),
  });
  await notifyFollowers(ctx, { _id: id, ...entry });
  return id;
}

/** `subject` reads after the actor's name, e.g. "created the account". */
export async function logSystem(
  ctx: MutationCtx,
  refs: RecordRefs,
  subject: string,
  body?: string,
  actorId?: Id<"members">,
) {
  const entry = { ...refs, kind: "system" as const, actorId, subject, body };
  const id = await ctx.db.insert("timeline", {
    ...entry,
    occurredAt: Date.now(),
  });
  await notifyFollowers(ctx, { _id: id, ...entry });
  return id;
}
