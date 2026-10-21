import type { ReactNode } from "react";
import {
  PROPOSAL_CURRENCY,
  TAX_BPS,
  approvalReasons,
  bpsLabel,
  marginBand,
  rateLabel,
  type CompanyPolicy,
  type LinePricing,
  type ProposalLine,
  type ProposalPricing,
} from "@/lib/domain/pricing";
import { cn } from "@/lib/utils";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import { Amount } from "./amount";
import { brandLineMeta, brandParts, productNote } from "./brand-view";

const SCALE_BPS = 4_000;
const currency = PROPOSAL_CURRENCY;

const BAND_TEXT = {
  below_floor: "text-danger",
  target: "text-foreground",
  default: "text-success",
} as const;

const BAND_FILL = {
  below_floor: "bg-danger",
  target: "bg-foreground",
  default: "bg-success",
} as const;

function position(bps: number) {
  return `${Math.min(100, Math.max(0, (bps / SCALE_BPS) * 100))}%`;
}

const money = (amount: number) => <Amount value={{ amount, currency }} />;

function Card({
  eyebrow,
  note,
  children,
  className,
}: {
  eyebrow: string;
  note: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={eyebrow}
      className={cn(
        "bg-card shadow-card flex min-w-0 flex-col gap-5 rounded-xl p-5",
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="eyebrow-style text-fg-secondary">{eyebrow}</h3>
        <span className="caption-style text-fg-tertiary truncate">{note}</span>
      </header>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  strong,
  indent,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  strong?: boolean;
  indent?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
      <dt
        title={hint}
        className={cn(
          "truncate text-sm",
          strong ? "text-foreground font-medium" : "text-fg-secondary",
          indent && "pl-3",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-sm tabular-nums",
          strong && "text-foreground font-medium",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** Margin on a 0–40% scale with the policy's floor and default marked. */
function MarginGauge({
  margin,
  charge,
  rate,
  policy,
}: {
  margin: number;
  charge: number;
  rate: number;
  policy: CompanyPolicy;
}) {
  const band = marginBand(margin, charge, policy);
  const bps = Math.round(rate * 10_000);
  const marks = [
    { bps: policy.marginFloorBps, label: "Floor" },
    { bps: policy.defaultMarginBps, label: "Default" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-fg-secondary text-sm">Blended margin</span>
        <span
          className={cn("text-sm font-medium tabular-nums", BAND_TEXT[band])}
        >
          {charge > 0 ? rateLabel(rate) : "—"}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Blended margin"
        aria-valuemin={0}
        aria-valuemax={SCALE_BPS / 100}
        aria-valuenow={Math.max(0, Math.min(SCALE_BPS, bps)) / 100}
        aria-valuetext={`${rateLabel(rate)}; approval under the ${bpsLabel(policy.marginFloorBps)} floor, default ${bpsLabel(policy.defaultMarginBps)}`}
        className="bg-track relative h-1.5 rounded-full"
      >
        <span
          aria-hidden
          className="bg-success/25 absolute inset-y-0 rounded-full"
          style={{
            left: position(policy.marginFloorBps),
            right: `calc(100% - ${position(policy.defaultMarginBps)})`,
          }}
        />
        <span
          aria-hidden
          className="bg-danger/40 absolute inset-y-0 left-0 rounded-l-full"
          style={{ width: position(policy.marginFloorBps) }}
        />
        {charge > 0 && (
          <span
            aria-hidden
            className={cn(
              "ring-card absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 transition-[left] duration-200",
              BAND_FILL[band],
            )}
            style={{ left: position(bps) }}
          />
        )}
      </div>
      <div aria-hidden className="relative h-4">
        {marks.map((mark) => (
          <span
            key={mark.label}
            className="caption-style text-fg-tertiary absolute top-0 -translate-x-1/2 whitespace-nowrap"
            style={{ left: position(mark.bps) }}
          >
            {mark.label} {bpsLabel(mark.bps)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Every number behind the price: the team's view. */
export function InternalTotals({
  lines,
  pricing,
  policy,
}: {
  lines: ProposalLine[];
  pricing: ProposalPricing;
  policy: CompanyPolicy;
}) {
  const { total } = pricing;
  const reasons = approvalReasons(pricing, policy);
  const enrollments = pricing.lines.reduce(
    (sum, line) => sum + line.maxEnrollments,
    0,
  );
  const slots = lines.reduce((sum, line) => sum + line.slots, 0);
  return (
    <Card eyebrow="Internal" note="Only your team sees this">
      <div className="flex flex-col gap-1.5">
        <span className="caption-style text-fg-tertiary">Hypedrive take</span>
        <span className="text-display leading-none font-medium">
          {money(total.take)}
        </span>
        <span className="caption-style text-fg-secondary">
          {rateLabel(pricing.takeRate)} of the brand price ·{" "}
          {rateLabel(pricing.marginRate)} margin
        </span>
      </div>
      <dl className="divide-border flex flex-col divide-y">
        <Row label="Brand billed, excl. GST">{money(total.billed)}</Row>
        <Row
          label="Creator payouts"
          hint="Cashback (fund − cut) + bonus after its cut + coupon bonuses"
        >
          {money(total.creatorNet)}
        </Row>
        <Row
          label="Platform fee"
          hint="order_fee + bonus_fee − coupon_net, as the platform computes it"
        >
          {money(total.platformFee)}
        </Row>
        <Row label="Order cut" indent>
          {money(total.orderFee)}
        </Row>
        <Row label="Bonus cut" indent>
          {money(total.bonusFee)}
        </Row>
        {total.couponNet > 0 && (
          <Row label="Coupon bonuses" indent>
            {money(-total.couponNet)}
          </Row>
        )}
        <Row label="Markup" hint="Price above the funded order and bonus">
          {money(total.markup)}
        </Row>
        {total.commission > 0 && (
          <Row label="Share commissions">{money(-total.commission)}</Row>
        )}
        <Row label="Take" strong>
          {money(total.take)}
        </Row>
      </dl>
      <MarginGauge
        margin={total.margin}
        charge={total.brandCharge}
        rate={pricing.marginRate}
        policy={policy}
      />
      {enrollments > slots && (
        <p className="caption-style text-fg-tertiary leading-snug">
          With oversubscription the platform may accept up to{" "}
          {enrollments.toLocaleString("en-IN")} enrollments, billing up to{" "}
          {money(pricing.maxBilled)} before GST.
        </p>
      )}
      {(reasons.length > 0 || pricing.issues.length > 0) && (
        <ul className="flex flex-col gap-1.5">
          {reasons.map((reason) => (
            <li
              key={reason}
              className="text-danger flex items-start gap-2 text-sm leading-snug"
            >
              <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {reason}
            </li>
          ))}
          {pricing.issues.map((issue) => (
            <li
              key={`${issue.key}-${issue.message}`}
              className="text-warning flex items-start gap-2 text-sm leading-snug"
            >
              <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="font-medium">
                  {lines[issue.index]?.product || `Line ${issue.index + 1}`}:
                </span>{" "}
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The price as the brand will read it on the proposal. */
export function BrandTotals({
  lines,
  pricing,
}: {
  lines: ProposalLine[];
  pricing: ProposalPricing;
}) {
  return (
    <Card eyebrow="Brand sees" note="Per enrollment, excl. GST">
      {lines.length === 0 ? (
        <p className="text-fg-tertiary text-sm">
          Add a line to see the brand&apos;s price.
        </p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {lines.map((line, index) => (
            <BrandLine
              key={line.key}
              line={line}
              pricing={pricing.lines[index]}
            />
          ))}
        </ul>
      )}
      <dl className="border-border flex flex-col gap-1 border-t pt-4">
        <Row label="Subtotal">{money(pricing.total.billed)}</Row>
        <Row label={`GST ${bpsLabel(TAX_BPS)}`}>{money(pricing.total.tax)}</Row>
        <div className="flex items-end justify-between gap-3 pt-2">
          <dt className="caption-style text-fg-tertiary">Total incl. GST</dt>
          <dd className="text-2xl font-medium">
            {money(pricing.total.billed + pricing.total.tax)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function BrandLine({
  line,
  pricing,
}: {
  line: ProposalLine;
  pricing: LinePricing;
}) {
  const note = productNote(line, pricing);
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span
            className={cn(
              "truncate text-sm font-medium",
              !line.product && "text-fg-tertiary",
            )}
          >
            {line.product || "Untitled product"}
          </span>
          <span className="caption-style text-fg-tertiary truncate">
            {brandLineMeta(line)}
          </span>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-medium">
            {money(pricing.perEnrollment.billed)}
          </span>
          <span className="caption-style text-fg-tertiary">per enrollment</span>
        </span>
      </div>
      {note && <span className="caption-style text-fg-secondary">{note}</span>}
      {line.presentation === "itemised" && (
        <dl className="bg-overlay-1 caption-style flex flex-col gap-1.5 rounded-lg px-3 py-2.5">
          {brandParts(line, pricing).map((part) => (
            <div
              key={part.label}
              className="flex items-center justify-between gap-3"
            >
              <dt className="text-fg-secondary truncate">{part.label}</dt>
              <dd className="text-foreground shrink-0 tabular-nums">
                {money(part.amount)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
