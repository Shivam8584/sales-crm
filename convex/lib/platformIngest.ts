import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  canonicalEvent,
  ENVELOPE_VERSIONS,
  type PlatformEventData,
  type PlatformEventType,
} from "../../lib/domain/platform";
import { emitAutomationTrigger } from "./automations/engine";
import type { RecordRefs } from "./timeline";
import {
  DEMO_ORG,
  type Envelope,
  isPlatformEvent,
  parseEventData,
  payloadOf,
  type ReceiveResult,
  UNKNOWN_TYPE,
} from "./platformParse";
import { gstFailures } from "./platformLinks";
import {
  onOrgCreated,
  onOrgEvent,
  onSignedUp,
  onUserGstFailed,
  type Outcome,
} from "./platformHandlers";
import { orgEvents } from "./platformStage";
import { MAX_PAYLOAD, id } from "./platformParse";

async function dispatch(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  type: PlatformEventType,
  data: PlatformEventData[PlatformEventType],
): Promise<Outcome> {
  switch (type) {
    case "user.signed_up": {
      const input = data as PlatformEventData["user.signed_up"];
      const outcome = await onSignedUp(ctx, event, input);
      if ("status" in outcome && outcome.status === "processed") {
        await replayUser(ctx, input.user_id, event._id);
      }
      return outcome;
    }
    case "organization.created": {
      const outcome = await onOrgCreated(
        ctx,
        event,
        data as PlatformEventData[typeof type],
      );
      if (
        "status" in outcome &&
        outcome.status === "processed" &&
        event.orgId
      ) {
        await replayOrg(ctx, event.orgId, event._id);
      }
      return outcome;
    }
    case "organization.gst_failed": {
      const input = data as PlatformEventData[typeof type];
      if (input.user_id && !input.org_id) {
        return onUserGstFailed(ctx, event, {
          ...input,
          user_id: input.user_id,
        });
      }
      return onOrgEvent(ctx, event, type, input as never);
    }
    default:
      return onOrgEvent(ctx, event, type, data as never);
  }
}

/** True when the org was created as a demo/test organisation on the platform. */
async function isDemoOrg(ctx: QueryCtx, orgId: string | undefined) {
  if (!orgId) return false;
  const created = await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .filter((q) => q.eq(q.field("type"), "organization.created"))
    .first();
  return created ? payloadOf(created).is_demo === true : false;
}

async function settle(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
): Promise<ReceiveResult> {
  const version = event.v ?? 1;
  if (!(ENVELOPE_VERSIONS as readonly number[]).includes(version)) {
    const error = `unsupported envelope version ${version}`;
    await ctx.db.patch(event._id, { error });
    return { status: "parked", error };
  }
  if (!isPlatformEvent(event.type)) {
    await ctx.db.patch(event._id, { error: UNKNOWN_TYPE });
    return { status: "parked", error: UNKNOWN_TYPE };
  }
  const raw = payloadOf(event);
  if (raw.is_demo === true || (await isDemoOrg(ctx, event.orgId))) {
    await ctx.db.patch(event._id, {
      ignored: DEMO_ORG,
      processedAt: Date.now(),
      error: undefined,
    });
    return { status: "ignored" };
  }
  const parsed = parseEventData(event.type, raw);
  const outcome = parsed.ok
    ? await dispatch(ctx, event, event.type, parsed.value)
    : { error: parsed.error };
  if ("error" in outcome) {
    await ctx.db.patch(event._id, { error: outcome.error });
    return { status: "parked", error: outcome.error };
  }
  if (outcome.status === "processed") {
    await ctx.db.patch(event._id, {
      processedAt: Date.now(),
      error: undefined,
    });
    if (parsed.ok)
      await emitPlatformTrigger(ctx, event, parsed.value, outcome.refs);
  }
  return { status: outcome.status };
}

/** Lets automations start or resume runs on the normalised event. */
async function emitPlatformTrigger(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData[PlatformEventType],
  refs: RecordRefs,
) {
  const trigger = canonicalEvent(event.type as PlatformEventType, data);
  if (!trigger) return;
  const move =
    trigger.type === "campaign.status_changed" ? trigger.data : undefined;
  await emitAutomationTrigger(ctx, {
    kind: "platform_event",
    refs,
    value: trigger.type,
    campaignStatus: move?.to,
    pauseReason: move?.pause_reason,
  });
}

const waiting = (event: Doc<"platformEvents">) =>
  !event.processedAt && !event.error && !event.ignored;

/** Events that arrived before their org was known, processed in the order they happened. */
async function replayOrg(
  ctx: MutationCtx,
  orgId: string,
  skip: Id<"platformEvents">,
) {
  const events = await orgEvents(ctx, orgId);
  for (const event of events) {
    if (event._id !== skip && waiting(event)) await settle(ctx, event);
  }
}

/** User-keyed events (a GST failure) that arrived before the signup. */
async function replayUser(
  ctx: MutationCtx,
  userId: string,
  skip: Id<"platformEvents">,
) {
  for (const event of await gstFailures(ctx, userId)) {
    if (event._id !== skip && waiting(event) && !event.orgId) {
      await settle(ctx, event);
    }
  }
}

function eventRefs(data: Record<string, unknown>) {
  return {
    orgId: id(data.org_id),
    userId: id(data.user_id) ?? id(data.created_by),
  };
}

/** Stores an event once (by event id) and processes it in the same transaction. */
export async function receive(
  ctx: MutationCtx,
  envelope: Envelope,
): Promise<ReceiveResult> {
  const existing = await ctx.db
    .query("platformEvents")
    .withIndex("by_event_id", (q) => q.eq("eventId", envelope.eventId))
    .first();
  if (existing) return { status: "duplicate" };

  const payload = JSON.stringify(envelope.data);
  const tooLarge = payload.length > MAX_PAYLOAD;
  const eventDoc = await ctx.db.insert("platformEvents", {
    eventId: envelope.eventId,
    type: envelope.type,
    ...eventRefs(envelope.data),
    occurredAt: envelope.occurredAt,
    payload: tooLarge ? "{}" : payload,
    ...(envelope.version === undefined ? {} : { v: envelope.version }),
    error: tooLarge ? "payload too large" : undefined,
  });
  if (tooLarge) return { status: "parked", error: "payload too large" };
  return await settle(ctx, (await ctx.db.get(eventDoc))!);
}

type RetryResult = Exclude<ReceiveResult, { status: "ignored" }>;

/** Re-runs parked and waiting events, e.g. after support for a new event type ships. An ignored event counts as handled. */
export async function retry(ctx: MutationCtx, events: Doc<"platformEvents">[]) {
  const results: RetryResult[] = [];
  for (const event of events) {
    if (event.processedAt || event.ignored) continue;
    const fresh = (await ctx.db.get(event._id))!;
    if (fresh.processedAt || fresh.ignored) continue;
    await ctx.db.patch(event._id, { error: undefined });
    const result = await settle(ctx, { ...fresh, error: undefined });
    results.push(
      result.status === "ignored" ? { status: "processed" } : result,
    );
  }
  return results;
}
