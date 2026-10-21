/**
 * Deal-desk pricing. It mirrors the platform's campaign_pricing so an accepted
 * quote can be approved on the platform as-is, and adds the company's bundled
 * price and margin on top. Shared by the proposal builder (live totals) and
 * Convex (the authority for approvals and the accepted take).
 *
 * Amounts are integer paise; rates are basis points (1% = 100 bps), the
 * platform's numeric(6,4) precision. Rates apply by truncation, like the
 * platform's Rate.Apply.
 *
 * Per enrollment:
 *   order_gross  = V × fund                  online purchases; V = expected order value
 *   order_fee    = V × platform_cut
 *   order_net    = order_gross − order_fee   the creator's cashback
 *   bonus_fee    = B × bonus_cut;  bonus_net = B − bonus_fee
 *   coupon_net   = C, the promo or share redeemer bonus (platform-funded)
 *   commission   = K, the share coupon's referral commission (platform revenue)
 *   platform_fee = order_fee + bonus_fee − C
 *   cost         = order_gross + B + P + C + K    P = barter product cost, shipped by the brand
 *   brand_charge = the all-in price; defaults to cost ÷ (1 − default margin), rounded up to a rupee
 *   billed       = brand_charge − P          the wallet charge before GST; tax = billed × 18%
 *   markup       = billed − (order_gross + B)
 *   margin       = brand_charge − cost = markup − C − K
 *   take         = platform_fee + markup − K = order_fee + bonus_fee + margin
 *
 * The platform has no markup line, so the approval payload carries it in the
 * bonus pool: amount B + markup, cut raised so the creator's bonus_net holds.
 */

import { formatMoney, type Currency, type Money } from "./money";

export const BPS = 10_000;
/** The platform's TAX_INVOICE_RATE. */
export const TAX_BPS = 1_800;
/** fund − platform_cut can't go below this on the platform. */
export const CASHBACK_FLOOR_BPS = 5_000;
/** ₹1,000, the platform's cap on a share coupon's referral commission. */
export const SHARE_COMMISSION_MAX = 100_000;
export const EXPIRY_DAYS = { min: 45, max: 180, default: 45 } as const;
/** Oversubscribe factor in hundredths: 1.00–3.00. */
export const OVERSUBSCRIBE = { min: 100, max: 300, default: 150 } as const;
export const MAX_MARGIN_BPS = 9_000;
/** ₹10 crore per enrollment keeps every total a safe integer. */
export const MAX_AMOUNT = 1_000_000_000;
/** The platform bills in rupees only. */
export const PROPOSAL_CURRENCY: Currency = "INR";
export const DEFAULT_VALIDITY_DAYS = 14;
export const MAX_LINES = 25;
export const MAX_SLOTS = 100_000;
export const MAX_PRODUCT_LENGTH = 80;
export const MAX_TERMS_LENGTH = 2_000;
export const MAX_REASON_LENGTH = 280;
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

export const ARCHETYPES = [
  "online_purchase",
  "barter",
  "checkin",
  "content_post",
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  online_purchase: "Online purchase",
  barter: "Barter",
  checkin: "Check-in",
  content_post: "Content post",
};

export const isOrderBased = (archetype: Archetype) =>
  archetype === "online_purchase";
export const usesProductCost = (archetype: Archetype) => archetype === "barter";

export const SLOT_MODES = ["lines", "pool"] as const;
export type SlotMode = (typeof SLOT_MODES)[number];

export const SLOT_MODE_LABEL: Record<SlotMode, string> = {
  lines: "Seats per variant",
  pool: "Shared pool",
};

export const PAYMENT_MODES = ["prepaid", "postpaid"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  prepaid: "Prepaid",
  postpaid: "Postpaid",
};

export const COUPON_KINDS = ["none", "promo", "share"] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export const COUPON_KIND_LABEL: Record<CouponKind, string> = {
  none: "None",
  promo: "Promo",
  share: "Share",
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
  "Prices are per enrollment and exclude GST at 18%, which is added on the invoice.",
  "For online purchases the price is estimated at the order value shown; each charge follows the verified order.",
  "Creators submit within the enrollment window shown; slots nobody takes are not charged.",
  "Prepaid campaigns are funded from the Hypedrive wallet before launch.",
].join("\n");

export type OrderPool = { value: Money; fundBps: number; feeBps: number };

export type Coupon =
  | { kind: "none" }
  | { kind: "promo"; bonus: Money }
  | { kind: "share"; bonus: Money; commission: Money };

/** One campaign the brand would run: a product, its archetype, pricing and settings. */
export type ProposalLine = {
  key: string;
  product: string;
  marketplace: Marketplace;
  archetype: Archetype;
  /** Online purchases only. */
  order?: OrderPool;
  bonus: Money;
  bonusFeeBps: number;
  /** Barter only. */
  productCost?: Money;
  coupon: Coupon;
  slots: number;
  slotMode: SlotMode;
  expiryDays: number;
  /** Hundredths: 150 is 1.5×. */
  oversubscribe: number;
  /** All-in brand price per enrollment; absent means the default-margin price. */
  price?: Money;
  presentation: Presentation;
};

export type Payment = { mode: PaymentMode; creditLimit?: Money };

export const DEFAULT_PAYMENT: Payment = { mode: "prepaid" };

/** The company's rules, set by an admin in Settings → Workspace. */
export type CompanyPolicy = {
  /** Pricing below this margin, on any line or blended, needs a manager's approval. */
  marginFloorBps: number;
  defaultMarginBps: number;
  defaultFundBps: number;
  defaultFeeBps: number;
  defaultBonusFeeBps: number;
};

/** PLATFORM_MIN_MARGIN_RATE and PLATFORM_MIN_MARGIN_ABS: platform_fee must reach the larger. */
export type PlatformFloor = { rateBps: number; minimum: number };

export type PricingPolicy = CompanyPolicy & { platformFloor: PlatformFloor };

export const DEFAULT_COMPANY_POLICY: CompanyPolicy = {
  marginFloorBps: 500,
  defaultMarginBps: 3_000,
  defaultFundBps: 6_000,
  defaultFeeBps: 1_000,
  defaultBonusFeeBps: 3_000,
};

export const NO_PLATFORM_FLOOR: PlatformFloor = { rateBps: 0, minimum: 0 };

export const DEFAULT_POLICY: PricingPolicy = {
  ...DEFAULT_COMPANY_POLICY,
  platformFloor: NO_PLATFORM_FLOOR,
};

export const POLICY_FIELDS = [
  "marginFloorBps",
  "defaultMarginBps",
  "defaultFundBps",
  "defaultFeeBps",
  "defaultBonusFeeBps",
] as const satisfies readonly (keyof CompanyPolicy)[];
export type PolicyField = (typeof POLICY_FIELDS)[number];

const MARGIN_FIELDS: readonly PolicyField[] = [
  "marginFloorBps",
  "defaultMarginBps",
];

export type Problem = { field: string; message: string };

export function isRate(bps: number) {
  return Number.isInteger(bps) && bps >= 0 && bps <= BPS;
}

function isAmount(amount: number) {
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT;
}

/** The platform's order-pool rules: cut ≤ fund, and the creator keeps at least half the order. */
export function orderPoolProblem(fundBps: number, feeBps: number) {
  if (feeBps > fundBps) {
    return "The platform cut can't be more than the funded share";
  }
  if (fundBps - feeBps < CASHBACK_FLOOR_BPS) {
    return `Creator cashback (fund − cut) can't be below ${bpsLabel(CASHBACK_FLOOR_BPS)} of the order`;
  }
  return null;
}

/** Why a policy can't be saved, or null. */
export function policyProblem(policy: CompanyPolicy) {
  for (const field of POLICY_FIELDS) {
    if (!isRate(policy[field])) return "Enter a rate between 0% and 100%";
    if (MARGIN_FIELDS.includes(field) && policy[field] > MAX_MARGIN_BPS) {
      return `Keep margins at ${bpsLabel(MAX_MARGIN_BPS)} or less`;
    }
  }
  if (policy.marginFloorBps > policy.defaultMarginBps) {
    return "The margin floor can't be above the default margin";
  }
  return orderPoolProblem(policy.defaultFundBps, policy.defaultFeeBps);
}

/** `amount × bps`, truncated to a paisa like the platform. */
export function applyRate(amount: number, bps: number) {
  const product = amount * bps;
  return (product - (product % BPS)) / BPS;
}

function ceilDiv(numerator: number, denominator: number) {
  const remainder = numerator % denominator;
  return (numerator - remainder) / denominator + (remainder > 0 ? 1 : 0);
}

/** The smallest whole-rupee price that leaves at least `marginBps` over `cost`. */
export function priceForMargin(cost: number, marginBps: number) {
  if (cost <= 0) return 0;
  const exact = ceilDiv(cost * BPS, BPS - marginBps);
  return ceilDiv(exact, WHOLE_UNIT) * WHOLE_UNIT;
}

/** True when `margin / charge` is under `bps`, compared without floats. */
function isBelow(margin: number, charge: number, bps: number) {
  return margin * BPS < bps * charge;
}

export function rate(part: number, whole: number) {
  return whole > 0 ? part / whole : 0;
}

export type Breakdown = {
  brandCharge: number;
  billed: number;
  tax: number;
  orderValue: number;
  orderGross: number;
  orderFee: number;
  orderNet: number;
  bonus: number;
  bonusFee: number;
  bonusNet: number;
  productCost: number;
  couponNet: number;
  commission: number;
  creatorNet: number;
  platformFee: number;
  markup: number;
  margin: number;
  take: number;
};

/** The approve body's `pricing`: the platform's flat PricingInput. Rates are decimal strings. */
export type PlatformPricingInput = {
  order?: { fund: string; platform_cut: string };
  bonus?: { amount_paise: number; platform_cut: string };
  product?: { cost_paise: number };
};

export type PlatformPricing = {
  input: PlatformPricingInput;
  bonusAmount: number;
  bonusCutBps: number;
  /** platform_fee as the platform computes it from `input`. */
  platformFee: number;
  /** The platform's minimum platform_fee for this enrollment. */
  floor: number;
};

export type LinePricing = {
  perEnrollment: Breakdown;
  total: Breakdown;
  defaultPrice: number;
  priceSet: boolean;
  /** margin ÷ brand charge, for display; decisions use `belowFloor`. */
  marginRate: number;
  belowFloor: boolean;
  /** Enrollments the platform may accept with oversubscription. */
  maxEnrollments: number;
  platform: PlatformPricing;
  /** What stops this line going to the brand. */
  issues: string[];
};

export type LineIssue = { index: number; key: string; message: string };

export type ProposalPricing = {
  lines: LinePricing[];
  total: Breakdown;
  marginRate: number;
  takeRate: number;
  belowFloorCount: number;
  blendedBelowFloor: boolean;
  needsApproval: boolean;
  /** Billed before GST if every line fills to its oversubscription limit. */
  maxBilled: number;
  issues: LineIssue[];
};

const ZERO: Breakdown = {
  brandCharge: 0,
  billed: 0,
  tax: 0,
  orderValue: 0,
  orderGross: 0,
  orderFee: 0,
  orderNet: 0,
  bonus: 0,
  bonusFee: 0,
  bonusNet: 0,
  productCost: 0,
  couponNet: 0,
  commission: 0,
  creatorNet: 0,
  platformFee: 0,
  markup: 0,
  margin: 0,
  take: 0,
};

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

/** Decimal string the platform accepts for a rate, e.g. 6000 → "0.6000". */
export function rateString(bps: number) {
  return (bps / BPS).toFixed(4);
}

function rupees(amount: number) {
  return formatMoney(
    { amount, currency: PROPOSAL_CURRENCY },
    { fractions: amount % WHOLE_UNIT !== 0 },
  );
}

function parts(line: ProposalLine) {
  const order = isOrderBased(line.archetype) ? line.order : undefined;
  const orderValue = order?.value.amount ?? 0;
  const orderGross = order ? applyRate(orderValue, order.fundBps) : 0;
  const orderFee = order ? applyRate(orderValue, order.feeBps) : 0;
  const bonus = line.bonus.amount;
  const bonusFee = applyRate(bonus, line.bonusFeeBps);
  const coupon = isOrderBased(line.archetype)
    ? line.coupon
    : { kind: "none" as const };
  return {
    order,
    orderValue,
    orderGross,
    orderFee,
    bonus,
    bonusFee,
    productCost: usesProductCost(line.archetype)
      ? (line.productCost?.amount ?? 0)
      : 0,
    couponNet: coupon.kind === "none" ? 0 : coupon.bonus.amount,
    commission: coupon.kind === "share" ? coupon.commission.amount : 0,
  };
}

type Parts = ReturnType<typeof parts>;

function platformPricing(
  line: ProposalLine,
  p: Parts,
  billed: number,
  markup: number,
  floor: PlatformFloor,
): PlatformPricing {
  const extra = Math.max(0, markup);
  const bonusAmount = p.bonus + extra;
  const bonusCutBps =
    extra > 0
      ? ceilDiv((p.bonusFee + extra) * BPS, bonusAmount)
      : line.bonusFeeBps;
  const input: PlatformPricingInput = {};
  if (p.order) {
    input.order = {
      fund: rateString(p.order.fundBps),
      platform_cut: rateString(p.order.feeBps),
    };
  }
  if (bonusAmount > 0) {
    input.bonus = {
      amount_paise: bonusAmount,
      platform_cut: rateString(bonusCutBps),
    };
  }
  if (usesProductCost(line.archetype)) {
    input.product = { cost_paise: p.productCost };
  }
  return {
    input,
    bonusAmount,
    bonusCutBps,
    platformFee: p.orderFee + applyRate(bonusAmount, bonusCutBps) - p.couponNet,
    floor: Math.max(
      applyRate(Math.max(0, billed), floor.rateBps),
      floor.minimum,
    ),
  };
}

function lineIssues(
  line: ProposalLine,
  p: Parts,
  perEnrollment: Breakdown,
  platform: PlatformPricing,
) {
  const issues: string[] = [];
  if (!line.product) issues.push("Name the product");
  if (isOrderBased(line.archetype) && p.orderValue === 0) {
    issues.push("Add the expected order value");
  }
  if (usesProductCost(line.archetype) && p.productCost === 0) {
    issues.push("Add the product cost");
  }
  if (
    !isOrderBased(line.archetype) &&
    !usesProductCost(line.archetype) &&
    p.bonus === 0
  ) {
    issues.push("Add the creator bonus");
  }
  if (perEnrollment.markup < 0) {
    const floor = p.orderGross + p.bonus + p.productCost;
    issues.push(
      `The price can't be below ${rupees(floor)}, the funded order${usesProductCost(line.archetype) ? ", product" : ""} and bonus`,
    );
  }
  if (
    line.coupon.kind === "share" &&
    p.couponNet + p.commission > platform.bonusAmount
  ) {
    issues.push(
      `The share bonus and commission can't exceed the bonus pool of ${rupees(platform.bonusAmount)}`,
    );
  }
  if (platform.platformFee < platform.floor) {
    issues.push(
      p.couponNet > 0 && platform.platformFee + p.couponNet >= platform.floor
        ? "The coupon costs more than the platform keeps on this line"
        : "The platform fee is below the platform's minimum margin",
    );
  }
  return issues;
}

export function priceLine(
  line: ProposalLine,
  policy: PricingPolicy,
): LinePricing {
  const p = parts(line);
  const cost =
    p.orderGross + p.bonus + p.productCost + p.couponNet + p.commission;
  const defaultPrice = priceForMargin(cost, policy.defaultMarginBps);
  const priceSet = line.price !== undefined;
  const brandCharge = line.price?.amount ?? defaultPrice;
  const billed = brandCharge - p.productCost;
  const markup = billed - p.orderGross - p.bonus;
  const margin = brandCharge - cost;
  const platformFee = p.orderFee + p.bonusFee - p.couponNet;
  const orderNet = p.orderGross - p.orderFee;
  const bonusNet = p.bonus - p.bonusFee;
  const perEnrollment: Breakdown = {
    brandCharge,
    billed,
    tax: applyRate(Math.max(0, billed), TAX_BPS),
    orderValue: p.orderValue,
    orderGross: p.orderGross,
    orderFee: p.orderFee,
    orderNet,
    bonus: p.bonus,
    bonusFee: p.bonusFee,
    bonusNet,
    productCost: p.productCost,
    couponNet: p.couponNet,
    commission: p.commission,
    creatorNet: orderNet + bonusNet + p.couponNet,
    platformFee,
    markup,
    margin,
    take: platformFee + markup - p.commission,
  };
  const platform = platformPricing(
    line,
    p,
    billed,
    markup,
    policy.platformFloor,
  );
  return {
    perEnrollment,
    total: scale(perEnrollment, line.slots),
    defaultPrice,
    priceSet,
    marginRate: rate(margin, brandCharge),
    belowFloor: isBelow(margin, brandCharge, policy.marginFloorBps),
    maxEnrollments: Math.floor((line.slots * line.oversubscribe) / 100),
    platform,
    issues: lineIssues(line, p, perEnrollment, platform),
  };
}

export function priceLines(
  lines: ProposalLine[],
  policy: PricingPolicy,
): ProposalPricing {
  const priced = lines.map((line) => priceLine(line, policy));
  const total = priced.reduce((sum, line) => add(sum, line.total), ZERO);
  const belowFloorCount = priced.filter((line) => line.belowFloor).length;
  const blendedBelowFloor =
    lines.length > 0 &&
    isBelow(total.margin, total.brandCharge, policy.marginFloorBps);
  return {
    lines: priced,
    total,
    marginRate: rate(total.margin, total.brandCharge),
    takeRate: rate(total.take, total.brandCharge),
    belowFloorCount,
    blendedBelowFloor,
    needsApproval: belowFloorCount > 0 || blendedBelowFloor,
    maxBilled: priced.reduce(
      (sum, line) => sum + line.perEnrollment.billed * line.maxEnrollments,
      0,
    ),
    issues: priced.flatMap((line, index) =>
      line.issues.map((message) => ({
        index,
        key: lines[index].key,
        message,
      })),
    ),
  };
}

/** Why a proposal needs approval, in the words shown to the rep and the approver. */
export function approvalReasons(
  pricing: ProposalPricing,
  policy: CompanyPolicy,
) {
  const reasons: string[] = [];
  const floor = bpsLabel(policy.marginFloorBps);
  if (pricing.belowFloorCount > 0) {
    reasons.push(
      pricing.belowFloorCount === 1
        ? `1 line is below the ${floor} margin floor`
        : `${pricing.belowFloorCount} lines are below the ${floor} margin floor`,
    );
  }
  if (pricing.blendedBelowFloor) {
    reasons.push(`Blended margin is below the ${floor} margin floor`);
  }
  return reasons;
}

export type MarginBand = "below_floor" | "target" | "default";

export function marginBand(
  margin: number,
  charge: number,
  policy: CompanyPolicy,
): MarginBand {
  if (isBelow(margin, charge, policy.marginFloorBps)) return "below_floor";
  if (isBelow(margin, charge, policy.defaultMarginBps)) return "target";
  return "default";
}

/** Why a line can't be stored, or null. Draft gaps (no product yet) are `issues`, not problems. */
export function lineProblem(line: ProposalLine): Problem | null {
  if (line.product.length > MAX_PRODUCT_LENGTH) {
    return { field: "product", message: "Keep the product name shorter" };
  }
  if (
    !Number.isInteger(line.slots) ||
    line.slots < 1 ||
    line.slots > MAX_SLOTS
  ) {
    return {
      field: "slots",
      message: `Enter between 1 and ${MAX_SLOTS.toLocaleString("en-IN")} slots`,
    };
  }
  if (
    !Number.isInteger(line.expiryDays) ||
    line.expiryDays < EXPIRY_DAYS.min ||
    line.expiryDays > EXPIRY_DAYS.max
  ) {
    return {
      field: "expiryDays",
      message: `Enter ${EXPIRY_DAYS.min} to ${EXPIRY_DAYS.max} days`,
    };
  }
  if (
    !Number.isInteger(line.oversubscribe) ||
    line.oversubscribe < OVERSUBSCRIBE.min ||
    line.oversubscribe > OVERSUBSCRIBE.max
  ) {
    return {
      field: "oversubscribe",
      message: "Enter a factor from 1 to 3, like 1.5",
    };
  }
  const amounts: [string, Money | undefined][] = [
    ["bonus", line.bonus],
    ["orderValue", line.order?.value],
    ["productCost", line.productCost],
    ["price", line.price],
    [
      "couponBonus",
      line.coupon.kind === "none" ? undefined : line.coupon.bonus,
    ],
    [
      "commission",
      line.coupon.kind === "share" ? line.coupon.commission : undefined,
    ],
  ];
  for (const [field, value] of amounts) {
    if (value && !isAmount(value.amount)) {
      return { field, message: "Enter an amount up to ₹10,00,00,000" };
    }
  }
  if (!isRate(line.bonusFeeBps)) {
    return {
      field: "bonusFeeBps",
      message: "Enter a rate between 0% and 100%",
    };
  }
  if (isOrderBased(line.archetype)) {
    if (!line.order) {
      return {
        field: "order",
        message: "Online purchases need a fund share and a platform cut",
      };
    }
    for (const field of ["fundBps", "feeBps"] as const) {
      if (!isRate(line.order[field])) {
        return { field, message: "Enter a rate between 0% and 100%" };
      }
    }
    const order = orderPoolProblem(line.order.fundBps, line.order.feeBps);
    if (order) return { field: "feeBps", message: order };
  } else if (line.order) {
    return {
      field: "order",
      message: "Only online purchases carry an order fund and cut",
    };
  }
  if (line.productCost && !usesProductCost(line.archetype)) {
    return {
      field: "productCost",
      message: "Product cost only applies to barter",
    };
  }
  if (line.coupon.kind !== "none") {
    if (!isOrderBased(line.archetype)) {
      return {
        field: "coupon",
        message: "Coupons only apply to online purchases",
      };
    }
    if (line.coupon.bonus.amount === 0) {
      return { field: "couponBonus", message: "Enter the coupon bonus" };
    }
    if (
      line.coupon.kind === "share" &&
      (line.coupon.commission.amount === 0 ||
        line.coupon.commission.amount > SHARE_COMMISSION_MAX)
    ) {
      return {
        field: "commission",
        message: `Enter a commission above ₹0 and up to ${rupees(SHARE_COMMISSION_MAX)}`,
      };
    }
  }
  if (line.price && line.price.amount === 0) {
    return { field: "price", message: "Enter a price above zero" };
  }
  return null;
}

export function paymentProblem(payment: Payment): Problem | null {
  if (payment.creditLimit && payment.mode !== "postpaid") {
    return {
      field: "creditLimit",
      message: "Only postpaid brands have a credit limit",
    };
  }
  if (
    payment.creditLimit &&
    !Number.isSafeInteger(payment.creditLimit.amount)
  ) {
    return { field: "creditLimit", message: "Enter a valid amount" };
  }
  if (payment.creditLimit && payment.creditLimit.amount < 0) {
    return { field: "creditLimit", message: "Enter a valid amount" };
  }
  return null;
}

const zero = (): Money => ({ amount: 0, currency: PROPOSAL_CURRENCY });

/** The line as it should be for `archetype`: pools it doesn't use are dropped, missing ones added. */
export function withArchetype(
  line: ProposalLine,
  archetype: Archetype,
  policy: CompanyPolicy,
): ProposalLine {
  const next: ProposalLine = { ...line, archetype };
  if (isOrderBased(archetype)) {
    next.order = line.order ?? {
      value: zero(),
      fundBps: policy.defaultFundBps,
      feeBps: policy.defaultFeeBps,
    };
  } else {
    delete next.order;
    next.coupon = { kind: "none" };
  }
  if (usesProductCost(archetype)) next.productCost = line.productCost ?? zero();
  else delete next.productCost;
  return next;
}

/** A new line's defaults; copies the archetype, rates and settings of `previous`. */
export function blankLine(
  key: string,
  policy: CompanyPolicy,
  previous?: ProposalLine,
): ProposalLine {
  const base: ProposalLine = {
    key,
    product: "",
    marketplace: previous?.marketplace ?? "amazon",
    archetype: "online_purchase",
    bonus: zero(),
    bonusFeeBps: previous?.bonusFeeBps ?? policy.defaultBonusFeeBps,
    coupon: { kind: "none" },
    slots: 100,
    slotMode: previous?.slotMode ?? "lines",
    expiryDays: previous?.expiryDays ?? EXPIRY_DAYS.default,
    oversubscribe: previous?.oversubscribe ?? OVERSUBSCRIBE.default,
    presentation: previous?.presentation ?? "bundled",
  };
  const line = withArchetype(
    base,
    previous?.archetype ?? "online_purchase",
    policy,
  );
  if (line.order && previous?.order) {
    line.order = {
      ...line.order,
      fundBps: previous.order.fundBps,
      feeBps: previous.order.feeBps,
    };
  }
  return line;
}

export type LinePatch = Partial<
  Omit<ProposalLine, "key" | "order" | "productCost" | "price">
> & {
  order?: OrderPool | null;
  productCost?: Money | null;
  price?: Money | null;
};

/** Applies an edit; switching archetype adds or drops the pools it implies unless the patch sets them. */
export function patchLine(
  line: ProposalLine,
  patch: LinePatch,
  policy: CompanyPolicy,
): ProposalLine {
  const { order, productCost, price, archetype, ...rest } = patch;
  let next: ProposalLine = { ...line };
  if (archetype && archetype !== line.archetype) {
    next = withArchetype(next, archetype, policy);
  }
  Object.assign(next, rest);
  if (order === null) delete next.order;
  else if (order) next.order = order;
  if (productCost === null) delete next.productCost;
  else if (productCost) next.productCost = productCost;
  if (price === null) delete next.price;
  else if (price) next.price = price;
  return next;
}

/** Everything that moves the numbers; an approval holds while this is unchanged. */
export function pricingFingerprint(line: ProposalLine) {
  return JSON.stringify([
    line.archetype,
    line.order ?? null,
    line.bonus.amount,
    line.bonusFeeBps,
    line.productCost?.amount ?? null,
    line.coupon,
    line.slots,
    line.price?.amount ?? null,
  ]);
}

/** Writes each default price onto its line, so a later policy change can't move a sent quote. */
export function freezeLines(lines: ProposalLine[], policy: PricingPolicy) {
  return lines.map((line) =>
    line.price
      ? line
      : {
          ...line,
          price: {
            amount: priceLine(line, policy).defaultPrice,
            currency: PROPOSAL_CURRENCY,
          },
        },
  );
}

/** What an admin pastes into the platform when approving each campaign of an accepted proposal. */
export function approvalPayload(
  lines: ProposalLine[],
  payment: Payment,
  policy: PricingPolicy,
) {
  const pricing = priceLines(lines, policy);
  return {
    organization: {
      payment_mode: payment.mode,
      credit_limit_paise:
        payment.mode === "postpaid"
          ? (payment.creditLimit?.amount ?? null)
          : null,
    },
    campaigns: lines.map((line, index) => {
      const { coupon } = line;
      return {
        product: line.product,
        archetype: line.archetype,
        approve: {
          pricing: pricing.lines[index].platform.input,
          share_enabled: coupon.kind === "share",
          ...(coupon.kind === "share"
            ? {
                share_bonus: coupon.bonus.amount,
                share_commission: coupon.commission.amount,
              }
            : {}),
        },
        campaign: {
          max_enrollments: line.slots,
          slot_mode: line.slotMode,
          enrollment_expiry_days: line.expiryDays,
          oversubscribe_factor: (line.oversubscribe / 100).toFixed(2),
        },
        ...(coupon.kind === "promo"
          ? { promo_coupon: { bonus_paise: coupon.bonus.amount } }
          : {}),
      };
    }),
  };
}

/** `12.5` → 1250 bps; null when it isn't a percentage between 0 and 100 with ≤2 decimals. */
export function parsePercent(text: string) {
  const value = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(value)) return null;
  const bps = Math.round(Number(value) * 100);
  return bps <= BPS ? bps : null;
}

/** `1.5` or `1.5x` → 150; null outside 1–3 or with more than two decimals. */
export function parseFactor(text: string) {
  const value = text.trim().replace(/[x×]$/i, "").trim();
  if (!/^\d(\.\d{0,2})?$/.test(value)) return null;
  const hundredths = Math.round(Number(value) * 100);
  return hundredths >= OVERSUBSCRIBE.min && hundredths <= OVERSUBSCRIBE.max
    ? hundredths
    : null;
}

export function factorLabel(hundredths: number) {
  return `${Number((hundredths / 100).toFixed(2))}×`;
}

export function bpsLabel(bps: number) {
  return `${Number((bps / 100).toFixed(2))}%`;
}

export function rateLabel(value: number) {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}
