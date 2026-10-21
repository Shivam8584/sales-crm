import {
  LOW_BALANCE_FLOOR_PAISE,
  campaignTransition,
  isFundingEvent,
  type CampaignStatus,
  type PauseReason,
} from "./platform";

/** A processed platform event with its payload, oldest first. */
export type StateEvent = {
  type: string;
  occurredAt: number;
  data?: Record<string, unknown>;
};

export type CampaignState = {
  id: string;
  title?: string;
  status: CampaignStatus;
  pauseReason?: PauseReason;
  /** When it entered its current status. */
  since: number;
  submittedAt?: number;
  liveAt?: number;
  endedAt?: number;
  slotsFilledAt?: number;
};

export type ReviewBacklog = {
  campaignId: string;
  count: number;
  oldestDays: number;
  /** When the oldest waiting submission came in. */
  oldestAt: number;
  reportedAt: number;
};

export type WalletState = {
  status: "ok" | "low" | "negative";
  since: number | null;
  balancePaise?: number;
};

export type PlatformState = {
  campaigns: CampaignState[];
  funding: { count: number; totalPaise: number; at: number[] };
  wallet: WalletState;
  reviews: ReviewBacklog[];
  orgCreatedAt: number | null;
  /** The latest GST failure, unless an organisation was created after it. */
  gstFailedAt: number | null;
  listings: { slug: string; at: number }[];
  members: { userId: string; role: string; at: number }[];
  approvals: number;
  lastEventAt: number | null;
};

const DAY = 24 * 60 * 60_000;
/** The platform repeats the overdue nudge daily, so an older one no longer describes the queue. */
const REVIEW_REPORT_TTL = 2 * DAY;
const CLOSED: CampaignStatus[] = ["ended", "archived", "rejected", "discarded"];

const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const str = (value: unknown) => (typeof value === "string" ? value : undefined);

export const isOpenCampaign = (campaign: CampaignState) =>
  !CLOSED.includes(campaign.status);

/** Folds an org's events into what is true about it now. */
export function platformState(
  events: StateEvent[],
  now: number,
): PlatformState {
  const sorted = [...events].sort((a, b) => a.occurredAt - b.occurredAt);
  const campaigns = new Map<string, CampaignState>();
  const reviews = new Map<string, ReviewBacklog>();
  const state: PlatformState = {
    campaigns: [],
    funding: { count: 0, totalPaise: 0, at: [] },
    wallet: { status: "ok", since: null },
    reviews: [],
    orgCreatedAt: null,
    gstFailedAt: null,
    listings: [],
    members: [],
    approvals: 0,
    lastEventAt: null,
  };

  for (const event of sorted) {
    const data = event.data ?? {};
    const at = event.occurredAt;
    state.lastEventAt = at;
    const move = campaignTransition(event.type, data);
    if (move) {
      const current = campaigns.get(move.campaignId);
      const next: CampaignState = {
        ...(current ?? { id: move.campaignId }),
        title: move.title ?? current?.title,
        status: move.to,
        pauseReason: move.pauseReason,
        since: current?.status === move.to ? current.since : at,
      };
      if (move.to === "pending_review") next.submittedAt = at;
      if (move.to === "live") next.liveAt ??= at;
      if (move.to === "ended") next.endedAt = at;
      campaigns.set(move.campaignId, next);
      continue;
    }
    switch (event.type) {
      case "organization.created":
      case "organization.gst_verified":
        state.orgCreatedAt ??= at;
        state.gstFailedAt = null;
        break;
      case "organization.gst_failed":
        state.gstFailedAt = at;
        break;
      case "wallet.low_balance":
        if (state.wallet.status !== "negative") {
          state.wallet = {
            status: "low",
            since: state.wallet.status === "low" ? state.wallet.since : at,
            balancePaise: num(data.balance_paise),
          };
        }
        break;
      case "wallet.negative":
        state.wallet = {
          status: "negative",
          since: state.wallet.status === "negative" ? state.wallet.since : at,
          balancePaise: num(data.balance_paise),
        };
        break;
      case "wallet.recovered":
        state.wallet = {
          status: "ok",
          since: at,
          balancePaise: num(data.balance_paise),
        };
        break;
      case "campaign.slots_filled": {
        const id = str(data.campaign_id);
        const campaign = id ? campaigns.get(id) : undefined;
        if (campaign) campaign.slotsFilledAt = at;
        break;
      }
      case "enrollment.approved":
        state.approvals += 1;
        break;
      case "enrollment.review_overdue": {
        const id = str(data.campaign_id);
        const count = num(data.count) ?? 0;
        const days = num(data.oldest_days) ?? 0;
        if (!id) break;
        if (count <= 0) reviews.delete(id);
        else {
          reviews.set(id, {
            campaignId: id,
            count,
            oldestDays: days,
            oldestAt: at - days * DAY,
            reportedAt: at,
          });
        }
        break;
      }
      case "listing.created": {
        const slug = str(data.platform_slug);
        if (slug) state.listings.push({ slug, at });
        break;
      }
      case "member.joined": {
        const userId = str(data.user_id);
        if (userId)
          state.members.push({ userId, role: str(data.role) ?? "member", at });
        break;
      }
      default:
        if (isFundingEvent(event.type)) {
          state.funding.count += 1;
          state.funding.totalPaise += num(data.amount_paise) ?? 0;
          state.funding.at.push(at);
          const balance = num(data.balance_paise);
          if (balance === undefined || balance >= LOW_BALANCE_FLOOR_PAISE) {
            state.wallet = { status: "ok", since: at, balancePaise: balance };
          }
        }
    }
  }

  state.campaigns = [...campaigns.values()];
  state.reviews = [...reviews.values()].filter((review) => {
    const campaign = campaigns.get(review.campaignId);
    return (
      now - review.reportedAt < REVIEW_REPORT_TTL &&
      (!campaign || isOpenCampaign(campaign))
    );
  });
  return state;
}

export const liveCampaigns = (state: PlatformState) =>
  state.campaigns.filter((campaign) => campaign.status === "live");

export const fundsPaused = (state: PlatformState) =>
  state.campaigns.filter(
    (campaign) =>
      campaign.status === "paused" &&
      campaign.pauseReason === "insufficient_funds",
  );
