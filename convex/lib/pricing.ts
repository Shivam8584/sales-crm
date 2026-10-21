import { v, type Infer } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { Currency, Money } from "../../lib/domain/money";
import {
  APPROVAL_STATES,
  MARKETPLACES,
  MAX_LINES,
  MAX_PRODUCT_LENGTH,
  MAX_REASON_LENGTH,
  MAX_SLOTS,
  MAX_TERMS_LENGTH,
  PRESENTATIONS,
  PROPOSAL_STATUSES,
  BPS,
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

export const vProposalLine = v.object({
  key: v.string(),
  product: v.string(),
  marketplace: vMarketplace,
  orderValue: vMoney,
  slots: v.number(),
  bonus: vMoney,
  orderFeeBps: v.number(),
  bonusFeeBps: v.number(),
  coupon: vMoney,
  price: v.optional(vMoney),
  presentation: vPresentation,
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

/** Editable fields of a line; `price: null` returns it to the default-margin price. */
export const vLinePatch = v.object({
  product: v.optional(v.string()),
  marketplace: v.optional(vMarketplace),
  orderValue: v.optional(vMoney),
  slots: v.optional(v.number()),
  bonus: v.optional(vMoney),
  orderFeeBps: v.optional(v.number()),
  bonusFeeBps: v.optional(v.number()),
  coupon: v.optional(vMoney),
  price: v.optional(v.union(vMoney, v.null())),
  presentation: v.optional(vPresentation),
});

export type LinePatch = Infer<typeof vLinePatch>;

function sameCurrency(value: Money, currency: Currency, field: string) {
  assertMoney(value, field);
  if (value.currency !== currency) {
    invalid(field, `Use ${currency}, the proposal's currency`);
  }
  return value;
}

function cleanBps(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0 || value > BPS) {
    invalid(field, "Enter a rate between 0% and 100%");
  }
  return value;
}

/**
 * Product names may be empty while a draft is being filled in; `requireComplete`
 * enforces them before the proposal leaves the building.
 */
export function cleanLine(
  line: ProposalLine,
  currency: Currency,
): ProposalLine {
  const product = cleanText(line.product) ?? "";
  if (product.length > MAX_PRODUCT_LENGTH) {
    invalid("product", "Keep the product name shorter");
  }
  if (
    !Number.isInteger(line.slots) ||
    line.slots < 1 ||
    line.slots > MAX_SLOTS
  ) {
    invalid(
      "slots",
      `Enter between 1 and ${MAX_SLOTS.toLocaleString("en-IN")} slots`,
    );
  }
  const price = line.price
    ? sameCurrency(line.price, currency, "price")
    : undefined;
  if (price && price.amount === 0) invalid("price", "Enter a price above zero");
  return {
    key: line.key,
    product,
    marketplace: line.marketplace,
    orderValue: sameCurrency(line.orderValue, currency, "orderValue"),
    slots: line.slots,
    bonus: sameCurrency(line.bonus, currency, "bonus"),
    orderFeeBps: cleanBps(line.orderFeeBps, "orderFeeBps"),
    bonusFeeBps: cleanBps(line.bonusFeeBps, "bonusFeeBps"),
    coupon: sameCurrency(line.coupon, currency, "coupon"),
    ...(price ? { price } : {}),
    presentation: line.presentation,
  };
}

export function applyLinePatch(
  line: ProposalLine,
  patch: LinePatch,
  currency: Currency,
): ProposalLine {
  const { price, ...rest } = patch;
  const next: ProposalLine = { ...line, ...rest };
  if (price === null) delete next.price;
  else if (price !== undefined) next.price = price;
  return cleanLine(next, currency);
}

/** A proposal has to be complete before it is sent or approved. */
export function requireComplete(lines: ProposalLine[]) {
  if (lines.length === 0) invalid("lines", "Add at least one line");
  lines.forEach((line, index) => {
    if (!line.product) {
      invalid("product", `Name the product on line ${index + 1}`);
    }
    if (line.orderValue.amount + line.bonus.amount === 0) {
      invalid("orderValue", `Add an order value or bonus on line ${index + 1}`);
    }
  });
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

export function versionLabel(proposal: Pick<Doc<"proposals">, "version">) {
  return `proposal v${proposal.version}`;
}
