/**
 * Deal-desk pricing, shared by the proposal builder (live totals) and Convex
 * (the authority for approvals and the accepted take). All amounts are integer
 * minor units of one currency; rates are basis points (1% = 100 bps).
 *
 * Per verified sale:
 *   order_fee      = order_value × order_fee_rate
 *   bonus_fee      = bonus × bonus_fee_rate
 *   fees           = order_fee + bonus_fee           (withheld from the creator)
 *   creator_payout = order_value + bonus − fees
 *   brand_charge   = the price per sale; defaults to the price that leaves the
 *                    default margin: (order_value + bonus + coupon) ÷ (1 − 30%),
 *                    rounded up to a whole unit
 *   margin         = brand_charge − order_value − bonus − coupon
 *   take           = fees + margin = brand_charge − creator_payout − coupon
 *   margin %       = margin ÷ brand_charge
 */

// Type-only imports keep this file runnable by `node --test` without a bundler.
import type { Currency, Money } from "./money";

export const BPS = 10_000;
export const MARGIN_FLOOR_BPS = 500;
export const MARGIN_DEFAULT_BPS = 3_000;
/** Blended margin under this needs a manager's approval. */
export const MARGIN_APPROVAL_BPS = 1_500;
export const MARGIN_TARGET_BPS = { min: 2_000, max: 3_000 } as const;

const DEFAULT_ORDER_FEE_BPS = 1_000;
const DEFAULT_BONUS_FEE_BPS = 3_000;
export const DEFAULT_VALIDITY_DAYS = 14;
export const MAX_LINES = 25;
export const MAX_SLOTS = 100_000;
export const MAX_PRODUCT_LENGTH = 80;
export const MAX_TERMS_LENGTH = 2_000;
export const MAX_REASON_LENGTH = 280;
/** Every supported currency has two minor digits; prices round up to a whole unit. */
const WHOLE_UNIT = 100;

export const MARKETPLACES = [
  "amazon",
  "flipkart",
  "myntra",
  "nykaa",
  "meesho",
  "ajio",
  "blinkit",
  "website",
  "other",
] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  amazon: "Amazon",
  flipkart: "Flipkart",
  myntra: "Myntra",
  nykaa: "Nykaa",
  meesho: "Meesho",
  ajio: "AJIO",
  blinkit: "Blinkit",
  website: "Brand website",
  other: "Other",
};

export const PRESENTATIONS = ["bundled", "itemised"] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

export const PRESENTATION_LABEL: Record<Presentation, string> = {
  bundled: "Bundled",
  itemised: "Itemised",
};

export const PROPOSAL_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const APPROVAL_STATES = ["requested", "approved", "declined"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const DEFAULT_TERMS = [
  "Prices are per verified sale and exclude GST, which is charged at the applicable rate.",
  "A sale counts as verified once the order is delivered and past the marketplace return window.",
  "Slots are reserved for one calendar month from campaign launch; unused slots are not billed.",
  "Campaign funds are deposited in the Hypedrive wallet before launch.",
].join("\n");

export type ProposalLine = {
  key: string;
  product: string;
  marketplace: Marketplace;
  orderValue: Money;
  slots: number;
  bonus: Money;
  orderFeeBps: number;
  bonusFeeBps: number;
  coupon: Money;
  /** Brand price per verified sale; absent means the default-margin price. */
  price?: Money;
  presentation: Presentation;
};

export type PricingInput = {
  orderValue: number;
  bonus: number;
  coupon: number;
  slots: number;
  orderFeeBps: number;
  bonusFeeBps: number;
  price?: number | null;
};

export type Breakdown = {
  brandCharge: number;
  orderValue: number;
  bonus: number;
  orderFee: number;
  bonusFee: number;
  fees: number;
  creatorPayout: number;
  coupon: number;
  margin: number;
  take: number;
};

export type LinePricing = {
  perSale: Breakdown;
  total: Breakdown;
  defaultPrice: number;
  priceSet: boolean;
  /** margin ÷ brand charge, for display; decisions use `belowFloor`. */
  marginRate: number;
  belowFloor: boolean;
};

export type ProposalPricing = {
  lines: LinePricing[];
  total: Breakdown;
  marginRate: number;
  takeRate: number;
  belowFloorCount: number;
  blendedBelowApproval: boolean;
  needsApproval: boolean;
};

const ZERO: Breakdown = {
  brandCharge: 0,
  orderValue: 0,
  bonus: 0,
  orderFee: 0,
  bonusFee: 0,
  fees: 0,
  creatorPayout: 0,
  coupon: 0,
  margin: 0,
  take: 0,
};

/** `amount × bps`, rounded half up to a minor unit. */
export function applyRate(amount: number, bps: number) {
  return Math.floor((amount * bps + BPS / 2) / BPS);
}

/** The smallest whole-unit price that leaves at least `marginBps` over `cost`. */
export function priceForMargin(cost: number, marginBps: number) {
  if (cost <= 0) return 0;
  const exact = Math.ceil((cost * BPS) / (BPS - marginBps));
  return Math.ceil(exact / WHOLE_UNIT) * WHOLE_UNIT;
}

/** What has to be covered per sale before any margin: the order, bonus and coupon. */
function costPerSale(input: PricingInput) {
  return input.orderValue + input.bonus + input.coupon;
}

export function defaultPrice(input: PricingInput) {
  return priceForMargin(costPerSale(input), MARGIN_DEFAULT_BPS);
}

/** True when `margin / charge` is under `bps`, compared without floats. */
function isBelow(margin: number, charge: number, bps: number) {
  return margin * BPS < bps * charge;
}

export function rate(part: number, whole: number) {
  return whole > 0 ? part / whole : 0;
}

function scale(breakdown: Breakdown, factor: number): Breakdown {
  return Object.fromEntries(
    Object.entries(breakdown).map(([key, value]) => [key, value * factor]),
  ) as Breakdown;
}

function add(a: Breakdown, b: Breakdown): Breakdown {
  return Object.fromEntries(
    Object.entries(a).map(([key, value]) => [
      key,
      value + b[key as keyof Breakdown],
    ]),
  ) as Breakdown;
}

export function priceLine(input: PricingInput): LinePricing {
  const fallback = defaultPrice(input);
  const priceSet = input.price !== undefined && input.price !== null;
  const brandCharge = priceSet ? input.price! : fallback;
  const orderFee = applyRate(input.orderValue, input.orderFeeBps);
  const bonusFee = applyRate(input.bonus, input.bonusFeeBps);
  const fees = orderFee + bonusFee;
  const margin = brandCharge - costPerSale(input);
  const perSale: Breakdown = {
    brandCharge,
    orderValue: input.orderValue,
    bonus: input.bonus,
    orderFee,
    bonusFee,
    fees,
    creatorPayout: input.orderValue + input.bonus - fees,
    coupon: input.coupon,
    margin,
    take: fees + margin,
  };
  return {
    perSale,
    total: scale(perSale, input.slots),
    defaultPrice: fallback,
    priceSet,
    marginRate: rate(margin, brandCharge),
    belowFloor: isBelow(margin, brandCharge, MARGIN_FLOOR_BPS),
  };
}

export function priceProposal(inputs: PricingInput[]): ProposalPricing {
  const lines = inputs.map(priceLine);
  const total = lines.reduce((sum, line) => add(sum, line.total), ZERO);
  const belowFloorCount = lines.filter((line) => line.belowFloor).length;
  const blendedBelowApproval =
    lines.length > 0 &&
    isBelow(total.margin, total.brandCharge, MARGIN_APPROVAL_BPS);
  return {
    lines,
    total,
    marginRate: rate(total.margin, total.brandCharge),
    takeRate: rate(total.take, total.brandCharge),
    belowFloorCount,
    blendedBelowApproval,
    needsApproval: belowFloorCount > 0 || blendedBelowApproval,
  };
}

export function lineInput(line: ProposalLine): PricingInput {
  return {
    orderValue: line.orderValue.amount,
    bonus: line.bonus.amount,
    coupon: line.coupon.amount,
    slots: line.slots,
    orderFeeBps: line.orderFeeBps,
    bonusFeeBps: line.bonusFeeBps,
    price: line.price?.amount ?? null,
  };
}

export function priceLines(lines: ProposalLine[]) {
  return priceProposal(lines.map(lineInput));
}

/** Why a proposal needs approval, in the words shown to the rep and the approver. */
export function approvalReasons(pricing: ProposalPricing) {
  const reasons: string[] = [];
  if (pricing.belowFloorCount > 0) {
    reasons.push(
      pricing.belowFloorCount === 1
        ? `1 line is below the ${bpsLabel(MARGIN_FLOOR_BPS)} margin floor`
        : `${pricing.belowFloorCount} lines are below the ${bpsLabel(MARGIN_FLOOR_BPS)} margin floor`,
    );
  }
  if (pricing.blendedBelowApproval) {
    reasons.push(`Blended margin is under ${bpsLabel(MARGIN_APPROVAL_BPS)}`);
  }
  return reasons;
}

export type MarginBand = "below_floor" | "low" | "target" | "default";

export function marginBand(margin: number, charge: number): MarginBand {
  if (isBelow(margin, charge, MARGIN_FLOOR_BPS)) return "below_floor";
  if (isBelow(margin, charge, MARGIN_TARGET_BPS.min)) return "low";
  if (isBelow(margin, charge, MARGIN_DEFAULT_BPS)) return "target";
  return "default";
}

/** `12.5` → 1250 bps; null when it isn't a percentage between 0 and 100 with ≤2 decimals. */
export function parsePercent(text: string) {
  const value = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(value)) return null;
  const bps = Math.round(Number(value) * 100);
  return bps <= BPS ? bps : null;
}

export function bpsLabel(bps: number) {
  return `${Number((bps / 100).toFixed(2))}%`;
}

export function rateLabel(value: number) {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

/** A new line's defaults; copies the marketplace, rates and presentation of `previous`. */
export function blankLine(
  key: string,
  currency: Currency,
  previous?: ProposalLine,
): ProposalLine {
  return {
    key,
    product: "",
    marketplace: previous?.marketplace ?? "amazon",
    orderValue: { amount: 0, currency },
    slots: 100,
    bonus: { amount: 0, currency },
    orderFeeBps: previous?.orderFeeBps ?? DEFAULT_ORDER_FEE_BPS,
    bonusFeeBps: previous?.bonusFeeBps ?? DEFAULT_BONUS_FEE_BPS,
    coupon: { amount: 0, currency },
    presentation: previous?.presentation ?? "bundled",
  };
}
