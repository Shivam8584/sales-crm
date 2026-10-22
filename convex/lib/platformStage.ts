import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { LifecycleStage } from "../../lib/domain/enums";
import {
  ACTIVATION_STAGES,
  type ActivationStage,
  campaignTransition,
  eventStage,
  isFundingEvent,
  pathIndex,
} from "../../lib/domain/platform";
import { emitAutomationTrigger } from "./automations/engine";
import { stateEvents } from "./platformParse";
import { type StageChange } from "./platformLinks";

const PRE_PATH: LifecycleStage[] = ["prospect", "lead", "qualified", "demo"];
const REVIVABLE: LifecycleStage[] = ["at_risk", "dormant", "disqualified"];

/** Shows a brand is actually using the platform, as opposed to setting up. */
function isActivity(type: string, data: Record<string, unknown>) {
  if (isFundingEvent(type)) return true;
  if (type === "enrollment.approved" || type === "campaign.slots_filled")
    return true;
  return campaignTransition(type, data)?.to === "live";
}

/**
 * The stage an event moves an account to, or null to leave it. Accounts only
 * move forward along the activation path; an at-risk, dormant or disqualified
 * account is revived by real usage, to the furthest stage it has reached.
 */
export function nextStage(
  current: LifecycleStage,
  target: ActivationStage,
  options: { activity: boolean; reached?: ActivationStage | null },
): ActivationStage | null {
  const index = pathIndex(target);
  if (index < 0) return null;
  if (PRE_PATH.includes(current)) return target;
  const at = pathIndex(current);
  if (at >= 0) {
    return index > at ? target : null;
  }
  if (!REVIVABLE.includes(current) || !options.activity) return null;
  const reached = options.reached ? pathIndex(options.reached) : -1;
  return reached > index ? options.reached! : target;
}

export function furthestStage(stages: (ActivationStage | null | undefined)[]) {
  let best = -1;
  for (const stage of stages) best = Math.max(best, pathIndex(stage));
  return best < 0 ? null : ACTIVATION_STAGES[best];
}

export async function orgEvents(ctx: QueryCtx, orgId: string) {
  return await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
}

async function reachedStage(ctx: QueryCtx, orgId: string) {
  return furthestStage(
    stateEvents(await orgEvents(ctx, orgId)).map((event) =>
      eventStage(event.type, event.data),
    ),
  );
}

/** Moves the account along the path for this event and records the activity. */
export async function touchAccount(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  event: Doc<"platformEvents">,
  data: Record<string, unknown>,
  patch: Partial<Doc<"accounts">> = {},
): Promise<StageChange> {
  const target = eventStage(event.type, data);
  const activity = isActivity(event.type, data);
  const reached =
    target &&
    activity &&
    REVIVABLE.includes(account.stage) &&
    account.platformOrgId
      ? await reachedStage(ctx, account.platformOrgId)
      : null;
  const stage = target
    ? nextStage(account.stage, target, { activity, reached })
    : null;
  await ctx.db.patch(account._id, {
    ...patch,
    ...(stage ? { stage } : {}),
    lastActivityAt: Math.max(account.lastActivityAt ?? 0, event.occurredAt),
    updatedAt: Date.now(),
  });
  if (!stage || stage === account.stage) return null;
  await emitAutomationTrigger(ctx, {
    kind: "account_stage_changed",
    refs: { accountId: account._id },
    value: stage,
  });
  return { from: account.stage, to: stage };
}
