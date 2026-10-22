"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import {
  ARCHETYPES,
  ARCHETYPE_LABEL,
  COUPON_KIND_LABEL,
  MARKETPLACES,
  MARKETPLACE_LABEL,
  MAX_PRODUCT_LENGTH,
  MAX_SLOTS,
  PRESENTATIONS,
  PRESENTATION_LABEL,
  PROPOSAL_CURRENCY,
  bpsLabel,
  isOrderBased,
  marginBand,
  orderPoolProblem,
  parsePercent,
  rateLabel,
  usesProductCost,
  type CompanyPolicy,
  type LinePatch,
  type LinePricing,
  type OrderPool,
  type ProposalLine,
  type ProposalPricing,
} from "@/lib/domain/pricing";
import { cn } from "@/lib/utils";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import {
  Amount,
  editableAmount,
  formatAmount,
  groupedAmount,
  parseAmount,
} from "./amount";
import { EditableCell, SelectCell, type Parsed } from "./cells";

type Column = {
  id: string;
  header: string;
  hint?: string;
  width: string;
  align?: "start" | "end";
  cell: (row: RowContext) => ReactNode;
};

type RowContext = {
  line: ProposalLine;
  pricing: LinePricing;
  policy: CompanyPolicy;
  index: number;
  readOnly: boolean;
  autoFocus: boolean;
  save: (patch: LinePatch) => void;
  openSettings: () => void;
};

const currency = PROPOSAL_CURRENCY;

const ARCHETYPE_OPTIONS = ARCHETYPES.map((value) => ({
  value,
  label: ARCHETYPE_LABEL[value],
}));
const MARKETPLACE_OPTIONS = MARKETPLACES.map((value) => ({
  value,
  label: MARKETPLACE_LABEL[value],
}));
const PRESENTATION_OPTIONS = PRESENTATIONS.map((value) => ({
  value,
  label: PRESENTATION_LABEL[value],
}));

const BAND_TONE = {
  below_floor: "text-danger",
  target: "text-foreground",
  default: "text-success",
} as const;

const lineName = (row: RowContext) =>
  row.line.product || `line ${row.index + 1}`;

function amountResult(text: string): Parsed<number> {
  const value = parseAmount(text);
  return value === null
    ? { ok: false, message: "Enter an amount like 1,250.50" }
    : { ok: true, value };
}

function percentResult(text: string): Parsed<number> {
  const value = parsePercent(text);
  return value === null
    ? { ok: false, message: "Enter a rate from 0 to 100, like 12.5" }
    : { ok: true, value };
}

function Rupee() {
  return <span className="text-fg-tertiary shrink-0">₹</span>;
}

/** A cell that doesn't apply to this line's archetype. */
function NotApplicable({ reason }: { reason: string }) {
  return (
    <span
      title={reason}
      className="text-fg-tertiary flex h-8 items-center justify-end px-2 text-sm"
    >
      <span aria-hidden>—</span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}

function AmountCell({
  row,
  header,
  amount,
  onCommit,
}: {
  row: RowContext;
  header: string;
  amount: number;
  onCommit: (value: number) => void;
}) {
  return (
    <EditableCell
      label={`${header} for ${lineName(row)}`}
      display={amount ? groupedAmount(amount, currency) : ""}
      edit={editableAmount(amount)}
      placeholder="0"
      prefix={<Rupee />}
      parse={amountResult}
      same={(value) => value === amount}
      onCommit={onCommit}
      readOnly={row.readOnly}
    />
  );
}

function PercentCell({
  row,
  header,
  bps,
  check,
  onCommit,
}: {
  row: RowContext;
  header: string;
  bps: number;
  check?: (value: number) => string | null;
  onCommit: (value: number) => void;
}) {
  return (
    <EditableCell
      label={`${header} for ${lineName(row)}`}
      display={bpsLabel(bps).replace("%", "")}
      edit={bpsLabel(bps).replace("%", "")}
      suffix={<span className="text-fg-tertiary shrink-0">%</span>}
      parse={(text) => {
        const parsed = percentResult(text);
        const problem = parsed.ok && check?.(parsed.value);
        return problem ? { ok: false, message: problem } : parsed;
      }}
      same={(value) => value === bps}
      onCommit={onCommit}
      readOnly={row.readOnly}
    />
  );
}

const ONLINE_ONLY = "Only online purchases fund an order";

function orderColumn(
  id: "fundBps" | "feeBps",
  header: string,
  hint: string,
): Column {
  return {
    id,
    header,
    hint,
    width: "5.25rem",
    cell: (row) => {
      const order = row.line.order;
      if (!order) return <NotApplicable reason={ONLINE_ONLY} />;
      return (
        <PercentCell
          row={row}
          header={header}
          bps={order[id]}
          check={(value) =>
            id === "fundBps"
              ? orderPoolProblem(value, order.feeBps)
              : orderPoolProblem(order.fundBps, value)
          }
          onCommit={(value) =>
            row.save({ order: { ...order, [id]: value } satisfies OrderPool })
          }
        />
      );
    },
  };
}

function couponText(line: ProposalLine) {
  const { coupon } = line;
  if (coupon.kind === "none") return null;
  const bonus = formatAmount(coupon.bonus.amount, currency);
  return coupon.kind === "promo"
    ? `${COUPON_KIND_LABEL.promo} ${bonus}`
    : `${COUPON_KIND_LABEL.share} ${bonus} + ${formatAmount(coupon.commission.amount, currency)}`;
}

const COLUMNS: Column[] = [
  {
    id: "product",
    header: "Product",
    width: "9.5rem",
    align: "start",
    cell: (row) => (
      <EditableCell
        label={`Product on line ${row.index + 1}`}
        display={row.line.product}
        edit={row.line.product}
        placeholder="Product name"
        align="start"
        inputMode="text"
        autoFocus={row.autoFocus}
        parse={(text): Parsed<string> => {
          const value = text.trim().replace(/\s+/g, " ");
          return value.length > MAX_PRODUCT_LENGTH
            ? { ok: false, message: "Keep the product name shorter" }
            : { ok: true, value };
        }}
        same={(value) => value === row.line.product}
        onCommit={(product) => row.save({ product })}
        readOnly={row.readOnly}
        className="font-medium"
      />
    ),
  },
  {
    id: "archetype",
    header: "Campaign",
    hint: "What the creator does to earn: buy online, receive the product (barter), check in or post content",
    width: "8.5rem",
    align: "start",
    cell: (row) => (
      <SelectCell
        label={`Campaign type for ${lineName(row)}`}
        value={row.line.archetype}
        options={ARCHETYPE_OPTIONS}
        onChange={(archetype) => row.save({ archetype })}
        readOnly={row.readOnly}
      />
    ),
  },
  {
    id: "slots",
    header: "Slots",
    hint: "Enrollments the campaign takes (max_enrollments)",
    width: "5rem",
    cell: (row) => (
      <EditableCell
        label={`Slots for ${lineName(row)}`}
        display={row.line.slots.toLocaleString("en-IN")}
        edit={String(row.line.slots)}
        inputMode="numeric"
        parse={(text): Parsed<number> => {
          const value = Number(text.replace(/[,\s]/g, ""));
          return Number.isInteger(value) && value >= 1 && value <= MAX_SLOTS
            ? { ok: true, value }
            : {
                ok: false,
                message: `Enter between 1 and ${MAX_SLOTS.toLocaleString("en-IN")} slots`,
              };
        }}
        same={(value) => value === row.line.slots}
        onCommit={(slots) => row.save({ slots })}
        readOnly={row.readOnly}
      />
    ),
  },
  {
    id: "orderValue",
    header: "Order value",
    hint: "Expected order value; on the platform each charge follows the verified order",
    width: "6.5rem",
    cell: (row) => {
      const order = row.line.order;
      if (!order) return <NotApplicable reason={ONLINE_ONLY} />;
      return (
        <AmountCell
          row={row}
          header="Order value"
          amount={order.value.amount}
          onCommit={(amount) =>
            row.save({ order: { ...order, value: { amount, currency } } })
          }
        />
      );
    },
  },
  orderColumn(
    "fundBps",
    "Fund",
    "Share of the order the brand funds (order_funding_rate)",
  ),
  orderColumn(
    "feeBps",
    "Order cut",
    "Platform's cut of the order (order_fee_rate). The creator keeps fund − cut, at least 50%.",
  ),
  {
    id: "productCost",
    header: "Product cost",
    hint: "Barter: what the product the brand ships costs them. Never billed.",
    width: "6.5rem",
    cell: (row) => {
      if (!usesProductCost(row.line.archetype)) {
        return <NotApplicable reason="Only barter ships a product" />;
      }
      return (
        <AmountCell
          row={row}
          header="Product cost"
          amount={row.line.productCost?.amount ?? 0}
          onCommit={(amount) => row.save({ productCost: { amount, currency } })}
        />
      );
    },
  },
  {
    id: "bonus",
    header: "Bonus",
    hint: "Flat creator bonus per enrollment (bonus_gross)",
    width: "5.5rem",
    cell: (row) => (
      <AmountCell
        row={row}
        header="Bonus"
        amount={row.line.bonus.amount}
        onCommit={(amount) => row.save({ bonus: { amount, currency } })}
      />
    ),
  },
  {
    id: "bonusFeeBps",
    header: "Bonus cut",
    hint: "Platform's cut of the bonus (bonus_fee_rate)",
    width: "5.25rem",
    cell: (row) => (
      <PercentCell
        row={row}
        header="Bonus cut"
        bps={row.line.bonusFeeBps}
        onCommit={(bonusFeeBps) => row.save({ bonusFeeBps })}
      />
    ),
  },
  {
    id: "coupon",
    header: "Coupon",
    hint: "Platform-funded creator coupon: promo, or share with a referral commission",
    width: "8.5rem",
    align: "start",
    cell: (row) => {
      if (!isOrderBased(row.line.archetype)) {
        return (
          <NotApplicable reason="Coupons only apply to online purchases" />
        );
      }
      const text = couponText(row.line);
      if (row.readOnly) {
        return (
          <span
            className={cn(
              "flex h-8 items-center truncate px-2 text-sm",
              !text && "text-fg-tertiary",
            )}
          >
            {text ?? "None"}
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={row.openSettings}
          aria-label={`Coupon for ${lineName(row)}: ${text ?? "none"}`}
          className={cn(
            "hover:bg-overlay-1 focus-visible:ring-ring duration-fast flex h-8 w-full min-w-0 cursor-pointer items-center rounded-md px-2 text-left text-sm whitespace-nowrap tabular-nums transition-colors outline-none focus-visible:ring-2",
            !text && "text-fg-tertiary",
          )}
        >
          <span className="truncate">{text ?? "Add coupon"}</span>
        </button>
      );
    },
  },
  {
    id: "price",
    header: "Price",
    hint: "What the brand pays per enrollment, all-in (for barter, including the product they ship). Leave it empty for the default margin.",
    width: "6.5rem",
    cell: (row) => {
      const price = row.line.price?.amount ?? null;
      return (
        <EditableCell
          label={`Price per enrollment for ${lineName(row)}`}
          display={price === null ? "" : groupedAmount(price, currency)}
          edit={price === null ? "" : editableAmount(price)}
          placeholder={
            row.pricing.defaultPrice
              ? groupedAmount(row.pricing.defaultPrice, currency)
              : "0"
          }
          prefix={<Rupee />}
          parse={(text): Parsed<number | null> => {
            if (!text.trim()) return { ok: true, value: null };
            const value = parseAmount(text);
            if (value === null) return amountResult(text);
            return value > 0
              ? { ok: true, value }
              : {
                  ok: false,
                  message:
                    "Enter a price above zero, or clear it for the default",
                };
          }}
          same={(value) => value === price}
          onCommit={(value) =>
            row.save({
              price: value === null ? null : { amount: value, currency },
            })
          }
          readOnly={row.readOnly}
          className={cn(price !== null && "font-medium")}
        />
      );
    },
  },
  {
    id: "margin",
    header: "Margin",
    hint: "(Price − funded order − bonus − product − coupon − commission) ÷ price",
    width: "4.75rem",
    cell: ({ pricing, policy }) => {
      const band = marginBand(
        pricing.perEnrollment.margin,
        pricing.perEnrollment.brandCharge,
        policy,
      );
      return (
        <span
          title={`${formatAmount(pricing.perEnrollment.margin, currency)} margin per enrollment`}
          className={cn(
            "flex h-8 items-center justify-end gap-1 px-2 text-sm font-medium tabular-nums",
            BAND_TONE[band],
          )}
        >
          {band === "below_floor" && (
            <AlertIcon aria-label="Below the margin floor" className="size-3" />
          )}
          {rateLabel(pricing.marginRate)}
        </span>
      );
    },
  },
  {
    id: "take",
    header: "Take",
    hint: "Platform fee + markup − share commission, across all slots",
    width: "6.5rem",
    cell: ({ pricing }) => (
      <span className="flex h-8 items-center justify-end px-2 text-sm">
        <Amount value={{ amount: pricing.total.take, currency }} />
      </span>
    ),
  },
  {
    id: "marketplace",
    header: "Marketplace",
    width: "8rem",
    align: "start",
    cell: (row) => (
      <SelectCell
        label={`Marketplace for ${lineName(row)}`}
        value={row.line.marketplace}
        options={MARKETPLACE_OPTIONS}
        onChange={(marketplace) => row.save({ marketplace })}
        readOnly={row.readOnly}
      />
    ),
  },
  {
    id: "presentation",
    header: "Brand sees",
    hint: "Bundled shows one price per enrollment; itemised shows the parts",
    width: "7rem",
    align: "start",
    cell: (row) => (
      <SelectCell
        label={`What the brand sees for ${lineName(row)}`}
        value={row.line.presentation}
        options={PRESENTATION_OPTIONS}
        onChange={(presentation) => row.save({ presentation })}
        readOnly={row.readOnly}
      />
    ),
  },
];

const STICKY =
  "sticky left-0 z-sticky bg-background group-hover/row:bg-row-hover group-data-[scrolled=true]/table:shadow-[inset_-1px_0_0_var(--line-strong)]";

/** Proposal line items, edited in place like a spreadsheet. */
export default function LineTable({
  lines,
  pricing,
  policy,
  readOnly,
  focusKey,
  onSave,
  onSettings,
  onDuplicate,
  onRemove,
  footer,
}: {
  lines: ProposalLine[];
  pricing: ProposalPricing;
  policy: CompanyPolicy;
  readOnly: boolean;
  focusKey: string | null;
  onSave: (line: ProposalLine, patch: LinePatch) => void;
  onSettings: (line: ProposalLine) => void;
  onDuplicate: (line: ProposalLine, index: number) => void;
  onRemove: (line: ProposalLine) => void;
  footer: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [scrollEnd, setScrollEnd] = useState(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => {
      setScrolled(element.scrollLeft > 0);
      setScrollEnd(
        element.scrollLeft + element.clientWidth >= element.scrollWidth - 1,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-col">
      <div
        ref={scrollRef}
        data-scrolled={scrolled}
        data-scroll-end={scrollEnd}
        className="group/table scrollbar-none relative min-w-0 overflow-x-auto"
      >
        <table className="w-max min-w-full border-separate border-spacing-0">
          <colgroup>
            {COLUMNS.map((column) => (
              <col key={column.id} style={{ width: column.width }} />
            ))}
            <col style={{ width: "2.75rem" }} />
          </colgroup>
          <thead>
            <tr className="h-row">
              {COLUMNS.map((column, index) => (
                <th
                  key={column.id}
                  scope="col"
                  title={column.hint}
                  className={cn(
                    "caption-style text-fg-tertiary border-border bg-background border-b px-4 text-left font-normal whitespace-nowrap",
                    column.align !== "start" && "text-right",
                    index === 0 &&
                      "z-sticky sticky left-0 group-data-[scrolled=true]/table:shadow-[inset_-1px_0_0_var(--line-strong)]",
                    column.hint && "cursor-help",
                  )}
                >
                  {column.header}
                </th>
              ))}
              <th
                scope="col"
                className="border-border bg-background z-sticky sticky right-0 border-b group-data-[scroll-end=false]/table:shadow-[inset_1px_0_0_var(--line-strong)]"
              >
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const row: RowContext = {
                line,
                pricing: pricing.lines[index],
                policy,
                index,
                readOnly,
                autoFocus: focusKey === line.key,
                save: (patch) => onSave(line, patch),
                openSettings: () => onSettings(line),
              };
              const issues = row.pricing.issues.length > 0;
              return (
                <tr
                  key={line.key}
                  className="group/row hover:bg-row-hover h-row"
                >
                  {COLUMNS.map((column, columnIndex) => (
                    <td
                      key={column.id}
                      className={cn(
                        "border-border border-b px-2 py-1",
                        columnIndex === 0 && cn(STICKY, "pl-2"),
                        columnIndex === 0 &&
                          issues &&
                          "shadow-[inset_2px_0_0_var(--color-warning)]",
                        index === lines.length - 1 && "border-b-0",
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                  <td
                    className={cn(
                      "border-border bg-background group-hover/row:bg-row-hover z-sticky sticky right-0 border-b pr-2 group-data-[scroll-end=false]/table:shadow-[inset_1px_0_0_var(--line-strong)]",
                      index === lines.length - 1 && "border-b-0",
                    )}
                  >
                    <LineMenu
                      name={lineName(row)}
                      readOnly={readOnly}
                      priceSet={row.pricing.priceSet}
                      onSettings={row.openSettings}
                      onReset={() => onSave(line, { price: null })}
                      onDuplicate={() => onDuplicate(line, index)}
                      onRemove={() => onRemove(line)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

function LineMenu({
  name,
  readOnly,
  priceSet,
  onSettings,
  onReset,
  onDuplicate,
  onRemove,
}: {
  name: string;
  readOnly: boolean;
  priceSet: boolean;
  onSettings: () => void;
  onReset: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${name}`}
          className="data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground"
        >
          <DotsIcon aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onSelect={onSettings}>
          {readOnly
            ? "Coupon and campaign settings"
            : "Coupon and campaign settings…"}
        </DropdownMenuItem>
        {!readOnly && (
          <>
            <DropdownMenuItem onSelect={onDuplicate}>
              Duplicate line
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!priceSet} onSelect={onReset}>
              Reset to default price
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRemove} className="text-danger">
              <TrashIcon
                aria-hidden
                className="text-danger size-3.5 shrink-0"
              />
              Remove line
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The totals under the line table. */
export function LineFooter({
  stats,
}: {
  stats: { label: string; value: ReactNode; tone?: string }[];
}) {
  return (
    <div
      role="group"
      aria-label="Proposal totals"
      className="caption-style border-border flex flex-wrap gap-x-8 gap-y-2 border-t px-2 py-3"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "text-foreground flex shrink-0 items-center tabular-nums",
              stat.tone,
            )}
          >
            {stat.value}
          </span>
          <span className="text-fg-tertiary truncate">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
