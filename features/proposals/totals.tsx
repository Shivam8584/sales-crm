import type { ReactNode } from "react";
import type { Currency } from "@/lib/domain/money";
import {
  MARGIN_APPROVAL_BPS,
  MARGIN_DEFAULT_BPS,
  MARGIN_FLOOR_BPS,
  MARGIN_TARGET_BPS,
  MARKETPLACE_LABEL,
  approvalReasons,
  bpsLabel,
  marginBand,
  rateLabel,
  type LinePricing,
  type ProposalLine,
  type ProposalPricing,
} from "@/lib/domain/pricing";
import { cn } from "@/lib/utils";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import { Amount } from "./amount";

const SCALE_BPS = 4_000;

const BAND_TEXT = {
  below_floor: "text-danger",
  low: "text-warning",
  target: "text-foreground",
  default: "text-success",
} as const;

const BAND_FILL = {
  below_floor: "bg-danger",
  low: "bg-warning",
  target: "bg-foreground",
  default: "bg-success",
} as const;

function position(bps: number) {
  return `${Math.min(100, Math.max(0, (bps / SCALE_BPS) * 100))}%`;
}

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
  children,
  strong,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
      <dt className="text-fg-secondary truncate text-sm">{label}</dt>
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

/** Margin on a 0–40% scale with the floor, approval line, target band and default marked. */
function MarginGauge({
  margin,
  charge,
  rate,
}: {
  margin: number;
  charge: number;
  rate: number;
}) {
  const band = marginBand(margin, charge);
  const bps = Math.round(rate * 10_000);
  const marks = [
    { bps: MARGIN_FLOOR_BPS, label: "Floor" },
    { bps: MARGIN_APPROVAL_BPS, label: "Approval" },
    { bps: MARGIN_DEFAULT_BPS, label: "Default" },
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
        aria-valuenow={Math.round(bps) / 100}
        aria-valuetext={`${rateLabel(rate)}; floor ${bpsLabel(MARGIN_FLOOR_BPS)}, default ${bpsLabel(MARGIN_DEFAULT_BPS)}`}
        className="bg-track relative h-1.5 rounded-full"
      >
        <span
          aria-hidden
          className="bg-success/25 absolute inset-y-0 rounded-full"
          style={{
            left: position(MARGIN_TARGET_BPS.min),
            right: `calc(100% - ${position(MARGIN_TARGET_BPS.max)})`,
          }}
        />
        <span
          aria-hidden
          className="bg-danger/40 absolute inset-y-0 left-0 rounded-l-full"
          style={{ width: position(MARGIN_FLOOR_BPS) }}
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
  pricing,
  currency,
}: {
  pricing: ProposalPricing;
  currency: Currency;
}) {
  const { total } = pricing;
  const money = (amount: number) => <Amount value={{ amount, currency }} />;
  const warnings = approvalReasons(pricing);
  return (
    <Card eyebrow="Internal" note="Only your team sees this">
      <div className="flex flex-col gap-1.5">
        <span className="caption-style text-fg-tertiary">
          Hypedrive take per month
        </span>
        <span className="text-display leading-none font-medium">
          {money(total.take)}
        </span>
        <span className="caption-style text-fg-secondary">
          Fees {rateLabel(pricing.takeRate - pricing.marginRate)} + margin{" "}
          {rateLabel(pricing.marginRate)} of the brand charge
        </span>
      </div>
      <dl className="divide-border flex flex-col divide-y">
        <Row label="Brand charge / mo">{money(total.brandCharge)}</Row>
        <Row label="Creator payouts / mo">{money(total.creatorPayout)}</Row>
        <Row label="Order fees">{money(total.orderFee)}</Row>
        <Row label="Bonus fees">{money(total.bonusFee)}</Row>
        {total.coupon > 0 && (
          <Row label="Coupons (Hypedrive-funded)">{money(-total.coupon)}</Row>
        )}
        <Row label="Margin" strong>
          {money(total.margin)}
        </Row>
      </dl>
      <MarginGauge
        margin={total.margin}
        charge={total.brandCharge}
        rate={pricing.marginRate}
      />
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="text-danger flex items-start gap-2 text-sm leading-snug"
            >
              <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {warning}
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
  currency,
  action,
}: {
  lines: ProposalLine[];
  pricing: ProposalPricing;
  currency: Currency;
  action?: ReactNode;
}) {
  return (
    <Card eyebrow="Brand sees" note="Per verified sale, excl. GST">
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
              currency={currency}
            />
          ))}
        </ul>
      )}
      <div className="border-border flex items-end justify-between gap-3 border-t pt-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="caption-style text-fg-tertiary">Monthly total</span>
          <span className="text-2xl font-medium">
            <Amount value={{ amount: pricing.total.brandCharge, currency }} />
          </span>
        </div>
        {action}
      </div>
    </Card>
  );
}

function BrandLine({
  line,
  pricing,
  currency,
}: {
  line: ProposalLine;
  pricing: LinePricing;
  currency: Currency;
}) {
  const { perSale } = pricing;
  const money = (amount: number) => <Amount value={{ amount, currency }} />;
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
          <span className="caption-style text-fg-tertiary">
            {MARKETPLACE_LABEL[line.marketplace]} ·{" "}
            {line.slots.toLocaleString("en-IN")} sales / mo
          </span>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-medium">
            {money(perSale.brandCharge)}
          </span>
          <span className="caption-style text-fg-tertiary">per sale</span>
        </span>
      </div>
      {line.presentation === "itemised" && (
        <dl className="bg-overlay-1 caption-style flex flex-col gap-1.5 rounded-lg px-3 py-2.5">
          <ItemisedRow label="Product value, refunded to the creator">
            {money(perSale.orderValue)}
          </ItemisedRow>
          {perSale.bonus > 0 && (
            <ItemisedRow label="Creator bonus">
              {money(perSale.bonus)}
            </ItemisedRow>
          )}
          <ItemisedRow label="Hypedrive service fee">
            {money(perSale.brandCharge - perSale.orderValue - perSale.bonus)}
          </ItemisedRow>
        </dl>
      )}
    </li>
  );
}

function ItemisedRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-secondary truncate">{label}</dt>
      <dd className="text-foreground shrink-0 tabular-nums">{children}</dd>
    </div>
  );
}
