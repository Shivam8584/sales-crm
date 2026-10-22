import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { LifecycleStage } from "../../lib/domain/enums";
import {
  ACTIVATION_STAGES,
  type ActivationStage,
  eventStage,
  isFundingEvent,
  LOW_BALANCE_FLOOR_PAISE,
  pathIndex,
} from "../../lib/domain/platform";
import {
  liveCampaigns,
  platformState,
  type StateEvent,
} from "../../lib/domain/platform-state";
import type { HealthCampaign, HealthInput } from "../../lib/domain/health";
import { stateEvents } from "./platformParse";
import { inr } from "./platformDescribe";

export type PlatformStep = {
  stage: ActivationStage;
  at: number | null;
  done: boolean;
};

/** Activation milestones and usage totals derived from an org's processed events. */
export function platformMetrics(
  events: Doc<"platformEvents">[],
  stage: LifecycleStage,
  signedUpAt: number | null,
  now: number,
) {
  const list = stateEvents(events);
  const first = new Map<ActivationStage, number>();
  if (signedUpAt !== null) first.set("signed_up", signedUpAt);
  for (const event of list) {
    const target = eventStage(event.type, event.data);
    if (target && (first.get(target) ?? Infinity) > event.occurredAt) {
      first.set(target, event.occurredAt);
    }
  }
  const state = platformState(list, now);
  const current = pathIndex(stage);
  const beyond = stage === "expanding";
  const steps: PlatformStep[] = ACTIVATION_STAGES.map((step, index) => {
    const at = first.get(step) ?? null;
    return {
      stage: step,
      at,
      done: at !== null || beyond || (current >= 0 && index <= current),
    };
  });
  return {
    steps,
    deposits: inr(state.funding.totalPaise),
    topups: state.funding.count,
    campaignsLive: liveCampaigns(state).length,
    lastEventAt: state.lastEventAt ?? signedUpAt,
    state,
  };
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * Health from the latest platform snapshot, with webhook events filling in
 * whatever happened since (or everything, before the first sync).
 */
export function healthInput(
  account: Pick<Doc<"accounts">, "lastActivityAt">,
  events: StateEvent[],
  snapshot: Doc<"platformSnapshots"> | null,
  now: number,
): HealthInput {
  const state = platformState(events, now);
  const fetchedAt = snapshot?.fetchedAt ?? 0;

  const campaigns = new Map<string, HealthCampaign>();
  for (const item of snapshot?.campaigns ?? []) {
    campaigns.set(item.id, {
      id: item.id,
      title: item.title,
      status: item.status,
      pauseReason: item.pauseReason,
      fillPct: item.max ? (item.enrolled / item.max) * 100 : null,
    });
  }
  for (const item of state.campaigns) {
    const known = campaigns.get(item.id);
    const fresher = !known || item.since > fetchedAt;
    campaigns.set(item.id, {
      id: item.id,
      title: known?.title ?? item.title,
      status: fresher ? item.status : known.status,
      pauseReason: fresher ? item.pauseReason : known.pauseReason,
      fillPct:
        item.slotsFilledAt !== undefined && item.slotsFilledAt > fetchedAt
          ? 100
          : (known?.fillPct ?? null),
      endedAt: item.endedAt,
    });
  }

  const funding = events.filter((event) => isFundingEvent(event.type));
  const depositsSince = (days: number) =>
    funding
      .filter((event) => now - event.occurredAt <= days * DAY_MS)
      .reduce((sum, event) => sum + Number(event.data?.amount_paise ?? 0), 0);

  const balancePaise = snapshot?.balancePaise ?? null;
  const walletFresh =
    state.wallet.since !== null && state.wallet.since > fetchedAt;
  const wallet =
    balancePaise !== null && !walletFresh
      ? balancePaise < 0
        ? "negative"
        : balancePaise < LOW_BALANCE_FLOOR_PAISE
          ? "low"
          : "ok"
      : state.wallet.status;

  const reviewCount = state.reviews.reduce((sum, item) => sum + item.count, 0);
  const reviewDays = state.reviews.length
    ? Math.max(
        ...state.reviews.map((item) =>
          Math.floor((now - item.oldestAt) / DAY_MS),
        ),
      )
    : null;
  const latestReview = Math.max(0, ...state.reviews.map((r) => r.reportedAt));
  const reviewsFromEvents = !snapshot || latestReview > fetchedAt;

  const markets = new Map<string, number>();
  for (const item of snapshot?.listings ?? []) {
    markets.set(item.marketplace, item.firstAt);
  }
  for (const item of state.listings) {
    markets.set(
      item.slug,
      Math.min(markets.get(item.slug) ?? item.at, item.at),
    );
  }

  return {
    now,
    balancePaise: walletFresh
      ? (state.wallet.balancePaise ?? null)
      : balancePaise,
    wallet,
    campaigns: [...campaigns.values()],
    deposits30dPaise: snapshot ? snapshot.deposits30d : depositsSince(30),
    deposits90dPaise: snapshot ? snapshot.deposits90d : depositsSince(90),
    fundingCount: Math.max(state.funding.count, snapshot?.depositCount90d ?? 0),
    staleReviews: reviewsFromEvents ? reviewCount : snapshot.staleReviews,
    oldestReviewDays: reviewsFromEvents
      ? reviewDays
      : (snapshot.oldestReviewDays ?? null),
    disputes: snapshot?.disputes ?? 0,
    lastActivityAt:
      Math.max(account.lastActivityAt ?? 0, state.lastEventAt ?? 0) || null,
    marketplaces: [...markets].map(([slug, firstAt]) => ({ slug, firstAt })),
    membersJoined30d: state.members.filter(
      (item) => now - item.at <= 30 * DAY_MS,
    ).length,
  };
}

export async function latestSnapshot(ctx: QueryCtx, accountId: Id<"accounts">) {
  return await ctx.db
    .query("platformSnapshots")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();
}
