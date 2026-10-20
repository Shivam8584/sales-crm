import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type RecordRefs = {
  accountId?: Id<"accounts">;
  personId?: Id<"people">;
  dealId?: Id<"deals">;
  leadId?: Id<"leads">;
};

type Change = { field: string; from?: string; to?: string };

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
  actorId: Id<"members">,
  changes: Change[],
) {
  if (changes.length === 0) return null;
  return await ctx.db.insert("timeline", {
    ...refs,
    kind: "change",
    actorId,
    occurredAt: Date.now(),
    changes,
  });
}

/** `subject` reads after the actor's name, e.g. "created the account". */
export async function logSystem(
  ctx: MutationCtx,
  refs: RecordRefs,
  subject: string,
  body?: string,
  actorId?: Id<"members">,
) {
  return await ctx.db.insert("timeline", {
    ...refs,
    kind: "system",
    actorId,
    occurredAt: Date.now(),
    subject,
    body,
  });
}
