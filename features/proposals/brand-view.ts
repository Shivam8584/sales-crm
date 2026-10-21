import {
  ARCHETYPE_LABEL,
  MARKETPLACE_LABEL,
  PROPOSAL_CURRENCY,
  bpsLabel,
  usesProductCost,
  type LinePricing,
  type ProposalLine,
} from "@/lib/domain/pricing";
import { formatAmount } from "./amount";

/** What an itemised line shows the brand. Fees, coupons and margin never appear. */
export function brandParts(line: ProposalLine, pricing: LinePricing) {
  const { perEnrollment: p } = pricing;
  const parts: { label: string; amount: number }[] = [];
  if (line.order) {
    parts.push({
      label: `Order funding, ${bpsLabel(line.order.fundBps)} of a ${formatAmount(line.order.value.amount, PROPOSAL_CURRENCY)} order`,
      amount: p.orderGross,
    });
  }
  if (p.bonus > 0) parts.push({ label: "Creator bonus", amount: p.bonus });
  if (p.markup > 0) {
    parts.push({ label: "Hypedrive service fee", amount: p.markup });
  }
  return parts;
}

/** "Online purchase · Amazon · 100 slots". */
export function brandLineMeta(line: ProposalLine) {
  return [
    ARCHETYPE_LABEL[line.archetype],
    MARKETPLACE_LABEL[line.marketplace],
    `${line.slots.toLocaleString("en-IN")} ${line.slots === 1 ? "slot" : "slots"}`,
  ].join(" · ");
}

/** The note under a barter price: the product isn't on the bill. */
export function productNote(line: ProposalLine, pricing: LinePricing) {
  return usesProductCost(line.archetype) && pricing.perEnrollment.productCost
    ? `Plus the product you ship (${formatAmount(pricing.perEnrollment.productCost, PROPOSAL_CURRENCY)} cost)`
    : null;
}
