import type { LifecycleStage } from "./enums";

/**
 * Events the Hypedrive platform sends to `POST /webhooks/platform`, signed with
 * `X-Hypedrive-Signature: sha256=<hex HMAC of the raw body>`.
 *
 * Envelope: `{ v?, event_id, event, occurred_at (ISO 8601), data }`. `v` is the
 * envelope version and defaults to 1, the current one; an unknown version is
 * stored and parked rather than guessed at. Payloads only ever gain fields; a
 * breaking change gets a new `v`. Money is integer paise. Events for an org whose
 * `organization.created` carried `is_demo: true` (or any event with `is_demo`)
 * are stored and ignored.
 *
 * Where the Go backend emits each event (crmevents hook points):
 * - `user.signed_up`: identity signup completion.
 * - `organization.created` (with the verified `gstin`): organization/onboarding.go
 *   after POST /api/v1/orgs succeeds; GST is verified before the org exists.
 * - `organization.gst_failed` (keyed by `user_id`, no org yet): onboarding.go:88-95
 *   on an org-create GST error and gst.go:268 on POST /api/v1/me/gst/previews.
 * - `wallet.topup_succeeded` / `wallet.deposit_received` / `wallet.low_balance` /
 *   `wallet.negative` / `wallet.recovered`: wallet/webhook_worker.go
 *   dispatchWalletEventUnordered (:256), beside the Novu brand.wallet.* sends.
 * - `campaign.status_changed`: campaign.Transition (campaign/transition.go:70),
 *   emitBrandTransition (routes_brand.go:573) and AutoPauseForInsufficientFunds
 *   (autopause.go:29, `pause_reason: "insufficient_funds"`).
 * - `campaign.slots_filled`: enrollment.Service.Create after atomicCapacityGuard
 *   (enrollment/service.go:1070) when enrolled_count reaches max_enrollments.
 * - `enrollment.approved`: enrollment.Service.Approve (enrollment/service.go:1657).
 * - `enrollment.review_overdue`: sweepBrandEnrollmentReviewReminder
 *   (sweeps/worker.go:636), once per campaign per sweep while the oldest
 *   submission has waited 3+ days.
 * - `listing.created`: listing.Service.CreateListing (listing/service.go:315).
 * - `member.joined`: iam/grants.go:346 when a member is admitted to an org.
 * - `dispute.*` is read through the pull API (/admin/enrollments?triage=disputed).
 */
export const PLATFORM_EVENTS = [
  "user.signed_up",
  "organization.created",
  "organization.gst_verified",
  "organization.gst_failed",
  "wallet.topup_succeeded",
  "wallet.deposit_received",
  "wallet.low_balance",
  "wallet.negative",
  "wallet.recovered",
  "campaign.status_changed",
  "campaign.submitted",
  "campaign.live",
  "campaign.paused",
  "campaign.ended",
  "campaign.changes_requested",
  "campaign.slots_filled",
  "enrollment.approved",
  "enrollment.review_overdue",
  "listing.created",
  "member.joined",
] as const;
export type PlatformEventType = (typeof PLATFORM_EVENTS)[number];

export const ENVELOPE_VERSIONS = [1] as const;
export const CURRENT_ENVELOPE_VERSION = 1;

/** Campaign lifecycle on the platform (campaign/status.go). */
export const CAMPAIGN_STATUSES = [
  "draft",
  "pending_review",
  "scheduled",
  "live",
  "paused",
  "ended",
  "archived",
  "changes_requested",
  "rejected",
  "discarded",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  pending_review: "In review",
  scheduled: "Scheduled",
  live: "Live",
  paused: "Paused",
  ended: "Ended",
  archived: "Archived",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  discarded: "Discarded",
};

export const PAUSE_REASONS = ["brand_paused", "insufficient_funds"] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export const ORG_ROLES = [
  "owner",
  "admin",
  "campaign_manager",
  "finance_manager",
  "member",
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_TITLE: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  campaign_manager: "Campaign manager",
  finance_manager: "Finance manager",
  member: "Member",
};

/** Tags a synced platform member gets on their person, by org role. */
export const ORG_ROLE_TAG: Partial<Record<OrgRole, string>> = {
  owner: "Decision maker",
  finance_manager: "Billing contact",
};

/** The wallet floor below which the platform sends `wallet.low_balance` (₹5,000). */
export const LOW_BALANCE_FLOOR_PAISE = 500_000;

type OrgRef = { org_id: string };
type CampaignRef = OrgRef & { campaign_id: string; title?: string };
type Funding = OrgRef & {
  amount_paise: number;
  is_first: boolean;
  balance_paise?: number;
};

export type PlatformEventData = {
  "user.signed_up": {
    user_id: string;
    email?: string;
    phone?: string;
    name?: string;
    utm?: { source?: string; medium?: string; campaign?: string };
  };
  "organization.created": OrgRef & {
    created_by: string;
    name: string;
    website?: string;
    gstin?: string;
    legal_name?: string;
    support_phone?: string;
    is_demo: boolean;
  };
  /** v1 only: GST is now verified before the org exists and arrives on `organization.created`. */
  "organization.gst_verified": OrgRef & { gstin: string; legal_name?: string };
  "organization.gst_failed": {
    user_id?: string;
    org_id?: string;
    email?: string;
    gstin?: string;
    reason: string;
  };
  "wallet.topup_succeeded": Funding & { method?: string };
  "wallet.deposit_received": Funding & { utr?: string };
  "wallet.low_balance": OrgRef & {
    balance_paise: number;
    threshold_paise?: number;
  };
  "wallet.negative": OrgRef & { balance_paise: number };
  "wallet.recovered": OrgRef & { balance_paise: number };
  "campaign.status_changed": CampaignRef & {
    from?: CampaignStatus;
    to: CampaignStatus;
    pause_reason?: PauseReason;
  };
  "campaign.submitted": CampaignRef;
  "campaign.live": CampaignRef;
  "campaign.paused": CampaignRef & { pause_reason?: PauseReason };
  "campaign.ended": CampaignRef;
  "campaign.changes_requested": CampaignRef & { reason?: string };
  "campaign.slots_filled": CampaignRef & {
    max_enrollments?: number;
    waiting?: number;
  };
  "enrollment.approved": CampaignRef & {
    platform_fee_paise?: number;
    is_first_for_org: boolean;
  };
  "enrollment.review_overdue": CampaignRef & {
    count: number;
    oldest_days: number;
  };
  "listing.created": OrgRef & {
    listing_id: string;
    platform_slug: string;
    name?: string;
  };
  "member.joined": OrgRef & {
    user_id: string;
    role: OrgRole;
    name?: string;
    email?: string;
    phone?: string;
  };
};

/** Shorthand campaign events, each the same as a `campaign.status_changed` to this status. */
export const CAMPAIGN_ALIASES = {
  "campaign.submitted": "pending_review",
  "campaign.live": "live",
  "campaign.paused": "paused",
  "campaign.ended": "ended",
  "campaign.changes_requested": "changes_requested",
} as const satisfies Partial<Record<PlatformEventType, CampaignStatus>>;
type CampaignAlias = keyof typeof CAMPAIGN_ALIASES;

/** Events after normalising: no campaign aliases and no v1-only GST event. */
export const PLATFORM_TRIGGERS = [
  "user.signed_up",
  "organization.created",
  "organization.gst_failed",
  "wallet.topup_succeeded",
  "wallet.deposit_received",
  "wallet.low_balance",
  "wallet.negative",
  "wallet.recovered",
  "campaign.status_changed",
  "campaign.slots_filled",
  "enrollment.approved",
  "enrollment.review_overdue",
  "listing.created",
  "member.joined",
] as const satisfies readonly PlatformEventType[];
/** What automations can trigger on; pair with `canonicalEvent` to read any stored event. */
export type PlatformTrigger = (typeof PLATFORM_TRIGGERS)[number];
export type PlatformTriggerEvent = {
  [T in PlatformTrigger]: { type: T; data: PlatformEventData[T] };
}[PlatformTrigger];

export const PLATFORM_TRIGGER_LABEL: Record<PlatformTrigger, string> = {
  "user.signed_up": "Signed up on Hypedrive",
  "organization.created": "Organisation created (GST verified)",
  "organization.gst_failed": "GST verification failed",
  "wallet.topup_succeeded": "Wallet topped up",
  "wallet.deposit_received": "Bank deposit received",
  "wallet.low_balance": "Wallet balance low",
  "wallet.negative": "Wallet balance negative",
  "wallet.recovered": "Wallet balance recovered",
  "campaign.status_changed": "Campaign status changed",
  "campaign.slots_filled": "Campaign slots filled",
  "enrollment.approved": "Creator result approved",
  "enrollment.review_overdue": "Creator reviews overdue",
  "listing.created": "Listing added",
  "member.joined": "Team member joined",
};

/**
 * Folds campaign aliases into `campaign.status_changed`. Null for the v1-only
 * `organization.gst_verified`, which follows its `organization.created`.
 */
export function canonicalEvent<T extends PlatformEventType>(
  type: T,
  data: PlatformEventData[T],
): PlatformTriggerEvent | null {
  if (type in CAMPAIGN_ALIASES) {
    const event = data as PlatformEventData["campaign.paused"];
    return {
      type: "campaign.status_changed",
      data: {
        org_id: event.org_id,
        campaign_id: event.campaign_id,
        title: event.title,
        to: CAMPAIGN_ALIASES[type as CampaignAlias],
        pause_reason: event.pause_reason,
      },
    };
  }
  if (type === "organization.gst_verified") return null;
  return { type, data } as PlatformTriggerEvent;
}

/** The campaign status an event moves a campaign to, if it is a campaign status event. */
export function campaignTransition(
  type: string,
  data: Record<string, unknown> | undefined,
): {
  campaignId: string;
  to: CampaignStatus;
  pauseReason?: PauseReason;
  title?: string;
} | null {
  if (!data || typeof data.campaign_id !== "string") return null;
  const to =
    type === "campaign.status_changed"
      ? data.to
      : CAMPAIGN_ALIASES[type as CampaignAlias];
  if (!(CAMPAIGN_STATUSES as readonly unknown[]).includes(to)) return null;
  const reason = (PAUSE_REASONS as readonly unknown[]).includes(
    data.pause_reason,
  )
    ? (data.pause_reason as PauseReason)
    : undefined;
  return {
    campaignId: data.campaign_id,
    to: to as CampaignStatus,
    pauseReason: to === "paused" ? reason : undefined,
    title: typeof data.title === "string" ? data.title : undefined,
  };
}

export const FUNDING_EVENTS = [
  "wallet.topup_succeeded",
  "wallet.deposit_received",
] as const satisfies readonly PlatformEventType[];

export function isFundingEvent(type: string) {
  return (FUNDING_EVENTS as readonly string[]).includes(type);
}

/** The activation path a brand walks after signing up, in order. GST is verified as the org is created. */
export const ACTIVATION_STAGES = [
  "signed_up",
  "org_created",
  "funded",
  "live",
  "activated",
] as const satisfies readonly LifecycleStage[];
export type ActivationStage = (typeof ACTIVATION_STAGES)[number];

export const ACTIVATION_STEP_LABEL: Record<ActivationStage, string> = {
  signed_up: "Signed up",
  org_created: "Org created (GST verified)",
  funded: "Funded",
  live: "Live",
  activated: "Activated",
};

/** Position on the path, or -1. The v1 `gst_verified` stage counts as `org_created`. */
export function pathIndex(stage: LifecycleStage | undefined | null) {
  if (!stage) return -1;
  if (stage === "gst_verified") return 1;
  return (ACTIVATION_STAGES as readonly string[]).indexOf(stage);
}

/** Stage an event moves an account to; accounts only ever move forward on this path. */
export function eventStage(
  type: string,
  data?: Record<string, unknown>,
): ActivationStage | null {
  switch (type) {
    case "user.signed_up":
      return "signed_up";
    case "organization.created":
    case "organization.gst_verified":
      return "org_created";
    case "wallet.topup_succeeded":
    case "wallet.deposit_received":
      return "funded";
    case "enrollment.approved":
      return "activated";
    default:
      return campaignTransition(type, data)?.to === "live" ? "live" : null;
  }
}

/** Timeline phrase after "reported that <brand>". */
export const PLATFORM_EVENT_LABEL: Record<PlatformEventType, string> = {
  "user.signed_up": "signed up on Hypedrive",
  "organization.created": "created their organisation",
  "organization.gst_verified": "verified their GST",
  "organization.gst_failed": "failed GST verification",
  "wallet.topup_succeeded": "topped up their wallet",
  "wallet.deposit_received": "funded their wallet by bank transfer",
  "wallet.low_balance": "is running low on wallet balance",
  "wallet.negative": "has a negative wallet balance",
  "wallet.recovered": "brought their wallet balance back up",
  "campaign.status_changed": "changed a campaign's status",
  "campaign.submitted": "submitted a campaign",
  "campaign.live": "went live with a campaign",
  "campaign.paused": "paused a campaign",
  "campaign.ended": "ended a campaign",
  "campaign.changes_requested": "was asked to change a campaign",
  "campaign.slots_filled": "filled every slot on a campaign",
  "enrollment.approved": "approved a creator result",
  "enrollment.review_overdue": "has creator results waiting for review",
  "listing.created": "added a listing",
  "member.joined": "added a team member",
};

/** Marketplace names for `platform_slug`. */
export const MARKETPLACE_LABEL: Record<string, string> = {
  amazon: "Amazon",
  flipkart: "Flipkart",
  myntra: "Myntra",
  nykaa: "Nykaa",
  ajio: "Ajio",
  meesho: "Meesho",
  blinkit: "Blinkit",
  zepto: "Zepto",
  swiggy_instamart: "Instamart",
  bigbasket: "BigBasket",
  jiomart: "JioMart",
  tatacliq: "Tata CLiQ",
  firstcry: "FirstCry",
  purplle: "Purplle",
  shopify: "Shopify",
  google_maps: "Google Maps",
};

export function marketplaceLabel(slug: string) {
  return (
    MARKETPLACE_LABEL[slug] ??
    slug.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}
