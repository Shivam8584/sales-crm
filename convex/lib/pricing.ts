import { v, type Infer } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { Money } from "../../lib/domain/money";
import {
  APPROVAL_STATES,
  ARCHETYPES,
  MARKETPLACES,
  MAX_LINES,
  MAX_REASON_LENGTH,
  MAX_TERMS_LENGTH,
  PAYMENT_MODES,
  PRESENTATIONS,
  PROPOSAL_CURRENCY,
  PROPOSAL_STATUSES,
  SLOT_MODES,
  lineProblem,
  patchLine,
  paymentProblem,
  type CompanyPolicy,
  type LinePatch,
  type Payment,
  type ProposalLine,
} from "../../lib/domain/pricing";
import { cleanText, isValidDay } from "../../lib/domain/normalize";
import { invalid, notFound } from "./errors";
import { assertMoney } from "./money";
import { literals, vMoney } from "./validators";

export const vProposalStatus = literals(PROPOSAL_STATUSES);
export const vMarketplace = literals(MARKETPLACES);
export const vPresentation = literals(PRESENTATIONS);
export const vApprovalState = literals(APPROVAL_STATES);
export const vArchetype = literals(ARCHETYPES);
export const vSlotMode = literals(SLOT_MODES);
export const vPaymentMode = literals(PAYMENT_MODES);

export const vOrderPool = v.object({
  value: vMoney,
  fundBps: v.number(),
  feeBps: v.number(),
});

export const vCoupon = v.union(
  v.object({ kind: v.literal("none") }),
  v.object({ kind: v.literal("promo"), bonus: vMoney }),
  v.object({ kind: v.literal("share"), bonus: vMoney, commission: vMoney }),
);

export const vProposalLine = v.object({
  key: v.string(),
  product: v.string(),
  marketplace: vMarketplace,
  archetype: vArchetype,
  order: v.optional(vOrderPool),
  bonus: vMoney,
  bonusFeeBps: v.number(),
  productCost: v.optional(vMoney),
  coupon: vCoupon,
  slots: v.number(),
  slotMode: vSlotMode,
  expiryDays: v.number(),
  oversubscribe: v.number(),
  price: v.optional(vMoney),
  presentation: vPresentation,
});

export const vPayment = v.object({
  mode: vPaymentMode,
  creditLimit: v.optional(vMoney),
});

/** The policy a sent proposal was priced under. */
export const vPolicy = v.object({
  marginFloorBps: v.number(),
  defaultMarginBps: v.number(),
  defaultFundBps: v.number(),
  defaultFeeBps: v.number(),
  defaultBonusFeeBps: v.number(),
  platformFloor: v.object({ rateBps: v.number(), minimum: v.number() }),
});

export const vApproval = v.object({
  state: vApprovalState,
  requestedById: v.optional(v.id("members")),
  requestedAt: v.optional(v.number()),
  decidedById: v.optional(v.id("members")),
  decidedAt: v.optional(v.number()),
  reason: v.optional(v.string()),
});

export type Approval = Infer<typeof vApproval>;

/** Editable fields of a line; `null` clears `order`, `productCost` and `price`. */
export const vLinePatch = v.object({
  product: v.optional(v.string()),
  marketplace: v.optional(vMarketplace),
  archetype: v.optional(vArchetype),
  order: v.optional(v.union(vOrderPool, v.null())),
  bonus: v.optional(vMoney),
  bonusFeeBps: v.optional(v.number()),
  productCost: v.optional(v.union(vMoney, v.null())),
  coupon: v.optional(vCoupon),
  slots: v.optional(v.number()),
  slotMode: v.optional(vSlotMode),
  expiryDays: v.optional(v.number()),
  oversubscribe: v.optional(v.number()),
  price: v.optional(v.union(vMoney, v.null())),
  presentation: v.optional(vPresentation),
});

function rupees(value: Money, field: string): Money {
  assertMoney(value, field);
  if (value.currency !== PROPOSAL_CURRENCY) {
    invalid(field, `Proposals are priced in ${PROPOSAL_CURRENCY}`);
  }
  return { amount: value.amount, currency: value.currency };
}

/**
 * Normalises a line and enforces the platform's pricing rules. Product names
 * may be empty while a draft is filled in; `requireComplete` catches them.
 */
export function cleanLine(line: ProposalLine): ProposalLine {
  const clean: ProposalLine = {
    key: line.key,
    product: cleanText(line.product) ?? "",
    marketplace: line.marketplace,
    archetype: line.archetype,
    ...(line.order
      ? {
          order: {
            value: rupees(line.order.value, "orderValue"),
            fundBps: line.order.fundBps,
            feeBps: line.order.feeBps,
          },
        }
      : {}),
    bonus: rupees(line.bonus, "bonus"),
    bonusFeeBps: line.bonusFeeBps,
    ...(line.productCost
      ? { productCost: rupees(line.productCost, "productCost") }
      : {}),
    coupon:
      line.coupon.kind === "none"
        ? { kind: "none" }
        : line.coupon.kind === "promo"
          ? { kind: "promo", bonus: rupees(line.coupon.bonus, "couponBonus") }
          : {
              kind: "share",
              bonus: rupees(line.coupon.bonus, "couponBonus"),
              commission: rupees(line.coupon.commission, "commission"),
            },
    slots: line.slots,
    slotMode: line.slotMode,
    expiryDays: line.expiryDays,
    oversubscribe: line.oversubscribe,
    ...(line.price ? { price: rupees(line.price, "price") } : {}),
    presentation: line.presentation,
  };
  const problem = lineProblem(clean);
  if (problem) invalid(problem.field, problem.message);
  return clean;
}

export function applyLinePatch(
  line: ProposalLine,
  patch: LinePatch,
  policy: CompanyPolicy,
): ProposalLine {
  return cleanLine(patchLine(line, patch, policy));
}

export function cleanPayment(payment: Payment): Payment {
  const clean: Payment = {
    mode: payment.mode,
    ...(payment.creditLimit
      ? { creditLimit: rupees(payment.creditLimit, "creditLimit") }
      : {}),
  };
  const problem = paymentProblem(clean);
  if (problem) invalid(problem.field, problem.message);
  return clean;
}

export function checkLineCount(count: number) {
  if (count > MAX_LINES)
    invalid("lines", `A proposal holds up to ${MAX_LINES} lines`);
}

export function cleanTerms(input: string) {
  const terms = input.trim();
  if (terms.length > MAX_TERMS_LENGTH)
    invalid("terms", "Keep the terms shorter");
  return terms;
}

export function cleanValidUntil(input: string) {
  if (!isValidDay(input)) invalid("validUntil", "Pick a valid date");
  return input;
}

export function cleanReason(input: string | undefined, required: boolean) {
  const reason = cleanText(input);
  if (required && !reason) invalid("reason", "Give a reason");
  if (reason && reason.length > MAX_REASON_LENGTH) {
    invalid("reason", "Keep the reason shorter");
  }
  return reason;
}

export async function requireProposal(ctx: QueryCtx, id: Id<"proposals">) {
  const proposal = await ctx.db.get(id);
  if (!proposal) notFound("Proposal");
  return proposal;
}

export async function requireDeal(ctx: QueryCtx, id: Id<"deals">) {
  const deal = await ctx.db.get(id);
  if (!deal) notFound("Deal");
  return deal;
}
