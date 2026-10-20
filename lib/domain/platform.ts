import type { LifecycleStage } from "./enums";

/**
 * Events the Hypedrive platform sends to `POST /webhooks/platform`, signed with
 * `X-Hypedrive-Signature: sha256=<hex HMAC of the raw body>`.
 *
 * Envelope: `{ event_id, event, occurred_at (ISO 8601), data }`. Payloads only
 * ever gain fields; a breaking change gets a `v2.` event name.
 */
export const PLATFORM_EVENTS = [
  "user.signed_up",
  "organization.created",
  "organization.gst_verified",
  "organization.gst_failed",
  "wallet.topup_succeeded",
  "campaign.submitted",
  "campaign.live",
  "enrollment.approved",
] as const;
export type PlatformEventType = (typeof PLATFORM_EVENTS)[number];

export type PlatformEventData = {
  "user.signed_up": {
    user_id: string;
    email?: string;
    phone?: string;
    name?: string;
    utm?: { source?: string; medium?: string; campaign?: string };
  };
  "organization.created": {
    org_id: string;
    created_by: string;
    name: string;
    website?: string;
  };
  "organization.gst_verified": {
    org_id: string;
    gstin: string;
    legal_name?: string;
  };
  "organization.gst_failed": { org_id: string; gstin?: string; reason: string };
  "wallet.topup_succeeded": {
    org_id: string;
    amount_paise: number;
    method?: string;
    is_first: boolean;
  };
  "campaign.submitted": { org_id: string; campaign_id: string; title?: string };
  "campaign.live": { org_id: string; campaign_id: string; title?: string };
  "enrollment.approved": {
    org_id: string;
    campaign_id: string;
    platform_fee_paise?: number;
    is_first_for_org: boolean;
  };
};

/** The activation path a brand walks after signing up, in order. */
export const ACTIVATION_STAGES = [
  "signed_up",
  "org_created",
  "gst_verified",
  "funded",
  "live",
  "activated",
] as const satisfies readonly LifecycleStage[];

/** Stage an event moves an account to. Accounts only ever move forward on this path. */
export const EVENT_STAGE: Partial<Record<PlatformEventType, LifecycleStage>> = {
  "user.signed_up": "signed_up",
  "organization.created": "org_created",
  "organization.gst_verified": "gst_verified",
  "wallet.topup_succeeded": "funded",
  "campaign.live": "live",
  "enrollment.approved": "activated",
};

export const PLATFORM_EVENT_LABEL: Record<PlatformEventType, string> = {
  "user.signed_up": "signed up on Hypedrive",
  "organization.created": "created their organisation",
  "organization.gst_verified": "verified their GST",
  "organization.gst_failed": "failed GST verification",
  "wallet.topup_succeeded": "topped up their wallet",
  "campaign.submitted": "submitted a campaign",
  "campaign.live": "went live with a campaign",
  "enrollment.approved": "approved a creator result",
};
