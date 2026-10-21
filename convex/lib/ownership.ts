import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertCan, can, type Action, type Actor } from "./permissions";
import { fail } from "./errors";

const UNDO_WINDOW_MS = 10 * 60_000;

type Target =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> }
  | { dealId: Id<"deals"> }
  | { leadId: Id<"leads"> };

/**
 * Whether the record's latest owner change was the viewer's, minutes ago. A
 * rep who hands their record on can then still undo it, though they no longer
 * own it.
 */
export async function reassignedBy(
  ctx: QueryCtx,
  target: Target,
  actorId: Id<"members">,
  now = Date.now(),
) {
  const timeline = ctx.db.query("timeline");
  const since = now - UNDO_WINDOW_MS;
  const query =
    "accountId" in target
      ? timeline.withIndex("by_account", (q) =>
          q.eq("accountId", target.accountId).gte("occurredAt", since),
        )
      : "personId" in target
        ? timeline.withIndex("by_person", (q) =>
            q.eq("personId", target.personId).gte("occurredAt", since),
          )
        : "dealId" in target
          ? timeline.withIndex("by_deal", (q) =>
              q.eq("dealId", target.dealId).gte("occurredAt", since),
            )
          : timeline.withIndex("by_lead", (q) =>
              q.eq("leadId", target.leadId).gte("occurredAt", since),
            );
  for await (const entry of query.order("desc")) {
    if (entry.kind !== "change") continue;
    if ("accountId" in target && (entry.personId || entry.dealId)) continue;
    if (!entry.changes?.some((change) => change.field === "Owner")) continue;
    return entry.actorId === actorId;
  }
  return false;
}

/** `assertCan` for a reassignment, letting the member who just reassigned the record undo it. */
export async function assertCanReassign(
  ctx: QueryCtx,
  actor: Actor & { _id: Id<"members"> },
  action: Action,
  owners: (string | null | undefined)[],
  target: Target,
) {
  if (can(actor, action, owners)) return;
  if (await reassignedBy(ctx, target, actor._id)) return;
  assertCan(actor, action, owners);
  fail("forbidden", "You don't have permission to do that");
}
