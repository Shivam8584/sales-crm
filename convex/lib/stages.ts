import type { Trigger } from "convex-helpers/server/triggers";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ACTIVATION_STAGES, eventStage } from "../../lib/domain/platform";
import { readPayload, stageFacts, stageRows, type StageRow } from "./reports";

const ORG_EVENT_LIMIT = 5000;

type Event = Doc<"platformEvents">;

function subject(event: Event) {
  const stage = eventStage(event.type, readPayload(event.payload));
  if (!stage) return null;
  if (stage === "signed_up") {
    return event.userId ? { userId: event.userId } : null;
  }
  return event.orgId ? { orgId: event.orgId } : null;
}

async function store(
  ctx: MutationCtx,
  existing: Doc<"activationStages"> | null,
  wanted: StageRow | undefined,
) {
  if (!wanted) {
    if (existing) await ctx.db.delete(existing._id);
  } else if (!existing) {
    await ctx.db.insert("activationStages", wanted);
  } else if (
    existing.creator !== wanted.creator ||
    ACTIVATION_STAGES.some(
      (stage) => existing.stages[stage] !== wanted.stages[stage],
    )
  ) {
    await ctx.db.replace(existing._id, wanted);
  }
}

async function refreshOrg(ctx: MutationCtx, orgId: string) {
  const [events, existing] = await Promise.all([
    ctx.db
      .query("platformEvents")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(ORG_EVENT_LIMIT),
    ctx.db
      .query("activationStages")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first(),
  ]);
  await store(
    ctx,
    existing,
    stageRows(stageFacts(events)).find((row) => row.orgId === orgId),
  );
}

async function refreshUser(ctx: MutationCtx, userId: string) {
  const [events, existing] = await Promise.all([
    ctx.db
      .query("platformEvents")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", userId).eq("type", "user.signed_up"),
      )
      .collect(),
    ctx.db
      .query("activationStages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
  ]);
  await store(
    ctx,
    existing,
    stageRows(stageFacts(events)).find((row) => row.userId === userId),
  );
}

/** Rebuilds the stage rows of the org or user a changed event belongs to. */
export async function refreshStages(ctx: MutationCtx, events: Event[]) {
  const orgs = new Set<string>();
  const users = new Set<string>();
  for (const event of events) {
    const target = subject(event);
    if (target?.orgId) orgs.add(target.orgId);
    if (target?.userId) users.add(target.userId);
  }
  for (const orgId of orgs) await refreshOrg(ctx, orgId);
  for (const userId of users) await refreshUser(ctx, userId);
}

const WATCHED = [
  "type",
  "orgId",
  "userId",
  "occurredAt",
  "payload",
  "processedAt",
  "ignored",
] as const;

export const syncStages: Trigger<
  MutationCtx,
  DataModel,
  "platformEvents"
> = async (ctx, change) => {
  if (change.operation === "insert") {
    await refreshStages(ctx, [change.newDoc]);
  } else if (change.operation === "delete") {
    await refreshStages(ctx, [change.oldDoc]);
  } else if (WATCHED.some((key) => change.oldDoc[key] !== change.newDoc[key])) {
    await refreshStages(ctx, [change.oldDoc, change.newDoc]);
  }
};
