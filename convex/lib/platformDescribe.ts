import { formatMoney, type Money } from "../../lib/domain/money";
import {
  CAMPAIGN_STATUS_LABEL,
  type CampaignStatus,
  campaignTransition,
  marketplaceLabel,
  ORG_ROLE_TITLE,
  type PauseReason,
  PLATFORM_EVENT_LABEL,
  type PlatformEventData,
  type PlatformEventType,
} from "../../lib/domain/platform";

export function inr(amount: number): Money {
  return { amount, currency: "INR" };
}

const rupees = (amount: number) =>
  formatMoney(inr(amount), { fractions: amount % 100 !== 0 });

const TOPUP_METHOD: Record<string, string> = {
  upi: "UPI",
  va: "bank transfer",
  card: "card",
  netbanking: "netbanking",
};

const PAUSE_REASON_LABEL: Record<PauseReason, string> = {
  brand_paused: "paused by the brand",
  insufficient_funds: "paused automatically for insufficient funds",
};

const quoted = (title: string | undefined) => (title ? ` “${title}”` : "");

/** Timeline subject and body for an event about `who`. */
export function describeEvent<T extends PlatformEventType>(
  type: T,
  data: PlatformEventData[T],
  who: string,
): { subject: string; body?: string } {
  const subject = `reported that ${who} ${PLATFORM_EVENT_LABEL[type]}`;
  const lines = (...parts: (string | false | undefined)[]) =>
    parts.filter(Boolean).join("\n") || undefined;
  const move = campaignTransition(type, data as Record<string, unknown>);
  if (move) {
    const event = data as PlatformEventData["campaign.status_changed"];
    const from = event.from ? `${CAMPAIGN_STATUS_LABEL[event.from]} → ` : "";
    const verb: Partial<Record<CampaignStatus, string>> = {
      pending_review: "submitted a campaign",
      live: "went live with a campaign",
      paused: "paused a campaign",
      ended: "ended a campaign",
      changes_requested: "was asked to change a campaign",
      rejected: "had a campaign rejected",
      scheduled: "had a campaign approved",
    };
    const reason =
      move.pauseReason === "insufficient_funds"
        ? "had a campaign paused for insufficient funds"
        : undefined;
    return {
      subject: `reported that ${who} ${reason ?? verb[move.to] ?? `moved a campaign to ${CAMPAIGN_STATUS_LABEL[move.to]}`}${quoted(move.title)}`,
      body: lines(
        `${from}${CAMPAIGN_STATUS_LABEL[move.to]}`,
        move.pauseReason && `Campaign ${PAUSE_REASON_LABEL[move.pauseReason]}`,
        move.pauseReason === "insufficient_funds" &&
          "It won't resume on its own after a top-up.",
        type === "campaign.changes_requested" &&
          (data as PlatformEventData["campaign.changes_requested"]).reason,
      ),
    };
  }
  switch (type) {
    case "organization.created": {
      const event = data as PlatformEventData["organization.created"];
      return {
        subject,
        body: lines(
          `Organisation: ${event.name}`,
          event.gstin && `GSTIN ${event.gstin} (verified)`,
          event.legal_name,
          event.website,
        ),
      };
    }
    case "organization.gst_verified": {
      const event = data as PlatformEventData["organization.gst_verified"];
      return {
        subject,
        body: lines(`GSTIN ${event.gstin}`, event.legal_name),
      };
    }
    case "organization.gst_failed": {
      const event = data as PlatformEventData["organization.gst_failed"];
      return {
        subject: `${subject}: ${event.reason}`,
        body: event.gstin && `GSTIN ${event.gstin}`,
      };
    }
    case "wallet.topup_succeeded": {
      const event = data as PlatformEventData["wallet.topup_succeeded"];
      const method = event.method
        ? (TOPUP_METHOD[event.method.toLowerCase()] ?? event.method)
        : undefined;
      return {
        subject: `${subject} with ${rupees(event.amount_paise)}`,
        body: lines(
          event.is_first && "First top-up",
          method && `Paid by ${method}`,
        ),
      };
    }
    case "wallet.deposit_received": {
      const event = data as PlatformEventData["wallet.deposit_received"];
      return {
        subject: `${subject}: ${rupees(event.amount_paise)}`,
        body: lines(
          event.is_first && "First deposit",
          event.utr && `UTR ${event.utr}`,
        ),
      };
    }
    case "wallet.low_balance":
    case "wallet.negative":
    case "wallet.recovered": {
      const event = data as PlatformEventData["wallet.low_balance"];
      return { subject, body: `Balance ${rupees(event.balance_paise)}` };
    }
    case "campaign.slots_filled": {
      const event = data as PlatformEventData["campaign.slots_filled"];
      return {
        subject: `${subject}${quoted(event.title)}`,
        body: lines(
          event.max_enrollments !== undefined &&
            `${event.max_enrollments} slots`,
          event.waiting
            ? `${event.waiting} creators waiting for a place`
            : undefined,
        ),
      };
    }
    case "enrollment.approved": {
      const event = data as PlatformEventData["enrollment.approved"];
      return {
        subject,
        body: lines(
          event.is_first_for_org && "First approved result",
          event.platform_fee_paise !== undefined &&
            `Platform fee ${formatMoney(inr(event.platform_fee_paise), { fractions: true })}`,
        ),
      };
    }
    case "enrollment.review_overdue": {
      const event = data as PlatformEventData["enrollment.review_overdue"];
      return {
        subject: `${subject}${quoted(event.title)}`,
        body: `${event.count} waiting, the oldest for ${event.oldest_days} days`,
      };
    }
    case "listing.created": {
      const event = data as PlatformEventData["listing.created"];
      return {
        subject: `${subject} on ${marketplaceLabel(event.platform_slug)}`,
        body: event.name,
      };
    }
    case "member.joined": {
      const event = data as PlatformEventData["member.joined"];
      return {
        subject: `${subject}: ${event.name ?? event.email ?? event.user_id}`,
        body: ORG_ROLE_TITLE[event.role],
      };
    }
    default:
      return { subject };
  }
}
