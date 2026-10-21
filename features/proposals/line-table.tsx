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
import type { Currency } from "@/lib/domain/money";
import {
  MARGIN_DEFAULT_BPS,
  MARKETPLACES,
  MARKETPLACE_LABEL,
  MAX_PRODUCT_LENGTH,
  MAX_SLOTS,
  PRESENTATIONS,
  PRESENTATION_LABEL,
  bpsLabel,
  marginBand,
  parsePercent,
  rateLabel,
  type LinePricing,
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
import type { LinePatch } from "./use-proposals";

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
  index: number;
  currency: Currency;
  readOnly: boolean;
  autoFocus: boolean;
  save: (patch: LinePatch) => void;
};

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
  low: "text-warning",
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

function CurrencySymbol({ currency }: { currency: Currency }) {
  const symbol =
    new Intl.NumberFormat("en-IN", { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency;
  return <span className="text-fg-tertiary shrink-0">{symbol}</span>;
}

function moneyColumn(
  id: "orderValue" | "bonus" | "coupon",
  header: string,
  width: string,
  hint: string,
): Column {
  return {
    id,
    header,
    hint,
    width,
    cell: (row) => {
      const amount = row.line[id].amount;
      return (
        <EditableCell
          label={`${header} for ${lineName(row)}`}
          display={amount ? groupedAmount(amount, row.currency) : ""}
          edit={editableAmount(amount)}
          placeholder="0"
          prefix={<CurrencySymbol currency={row.currency} />}
          parse={amountResult}
          same={(value) => value === amount}
          onCommit={(value) =>
            row.save({ [id]: { amount: value, currency: row.currency } })
          }
          readOnly={row.readOnly}
        />
      );
    },
  };
}

function percentColumn(
  id: "orderFeeBps" | "bonusFeeBps",
  header: string,
  hint: string,
): Column {
  return {
    id,
    header,
    hint,
    width: "5.25rem",
    cell: (row) => {
      const bps = row.line[id];
      return (
        <EditableCell
          label={`${header} for ${lineName(row)}`}
          display={bpsLabel(bps).replace("%", "")}
          edit={bpsLabel(bps).replace("%", "")}
          suffix={<span className="text-fg-tertiary shrink-0">%</span>}
          parse={percentResult}
          same={(value) => value === bps}
          onCommit={(value) => row.save({ [id]: value })}
          readOnly={row.readOnly}
        />
      );
    },
  };
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
    id: "slots",
    header: "Slots / mo",
    hint: "Verified sales per month",
    width: "5rem",
    cell: (row) => (
      <EditableCell
        label={`Slots per month for ${lineName(row)}`}
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
  moneyColumn(
    "orderValue",
    "Order value",
    "6.5rem",
    "What the creator pays for the product; the brand refunds it",
  ),
  moneyColumn("bonus", "Bonus", "5.5rem", "Creator bonus per verified sale"),
  {
    id: "price",
    header: "Price / sale",
    hint: `What the brand pays per verified sale. Leave it empty for the ${bpsLabel(MARGIN_DEFAULT_BPS)} default margin.`,
    width: "6.5rem",
    cell: (row) => {
      const price = row.line.price?.amount ?? null;
      return (
        <EditableCell
          label={`Price per sale for ${lineName(row)}`}
          display={price === null ? "" : groupedAmount(price, row.currency)}
          edit={price === null ? "" : editableAmount(price)}
          placeholder={
            row.pricing.defaultPrice
              ? groupedAmount(row.pricing.defaultPrice, row.currency)
              : "0"
          }
          prefix={<CurrencySymbol currency={row.currency} />}
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
              price:
                value === null
                  ? null
                  : { amount: value, currency: row.currency },
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
    hint: "Margin ÷ price: price − order value − bonus − coupon",
    width: "4.75rem",
    cell: ({ pricing, currency }) => {
      const band = marginBand(
        pricing.perSale.margin,
        pricing.perSale.brandCharge,
      );
      return (
        <span
          title={`${formatAmount(pricing.perSale.margin, currency)} margin per sale`}
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
    header: "Take / mo",
    hint: "Hypedrive fees + margin for the month",
    width: "6.5rem",
    cell: ({ pricing, currency }) => (
      <span className="flex h-8 items-center justify-end px-2 text-sm">
        <Amount value={{ amount: pricing.total.take, currency }} />
      </span>
    ),
  },
  percentColumn(
    "orderFeeBps",
    "Order fee",
    "Hypedrive's cut of the order value, withheld from the creator",
  ),
  percentColumn(
    "bonusFeeBps",
    "Bonus fee",
    "Hypedrive's cut of the bonus, withheld from the creator",
  ),
  moneyColumn(
    "coupon",
    "Coupon",
    "6rem",
    "Funded by Hypedrive out of the margin; the brand never pays it",
  ),
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
    hint: "Bundled shows one price per verified sale; itemised shows the parts",
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
  currency,
  readOnly,
  focusKey,
  onSave,
  onDuplicate,
  onRemove,
  footer,
}: {
  lines: ProposalLine[];
  pricing: ProposalPricing;
  currency: Currency;
  readOnly: boolean;
  focusKey: string | null;
  onSave: (line: ProposalLine, patch: LinePatch) => void;
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
    <div className="border-border flex min-w-0 flex-col overflow-hidden rounded-xl border">
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
            {!readOnly && <col style={{ width: "2.75rem" }} />}
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
              {!readOnly && (
                <th
                  scope="col"
                  className="border-border bg-background z-sticky sticky right-0 border-b group-data-[scroll-end=false]/table:shadow-[inset_1px_0_0_var(--line-strong)]"
                >
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const row: RowContext = {
                line,
                pricing: pricing.lines[index],
                index,
                currency,
                readOnly,
                autoFocus: focusKey === line.key,
                save: (patch) => onSave(line, patch),
              };
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
                        index === lines.length - 1 && "border-b-0",
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                  {!readOnly && (
                    <td
                      className={cn(
                        "border-border bg-background group-hover/row:bg-row-hover z-sticky sticky right-0 border-b pr-2 group-data-[scroll-end=false]/table:shadow-[inset_1px_0_0_var(--line-strong)]",
                        index === lines.length - 1 && "border-b-0",
                      )}
                    >
                      <LineMenu
                        name={lineName(row)}
                        priceSet={row.pricing.priceSet}
                        onReset={() => onSave(line, { price: null })}
                        onDuplicate={() => onDuplicate(line, index)}
                        onRemove={() => onRemove(line)}
                      />
                    </td>
                  )}
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
  priceSet,
  onReset,
  onDuplicate,
  onRemove,
}: {
  name: string;
  priceSet: boolean;
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
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onSelect={onDuplicate}>
          Duplicate line
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!priceSet} onSelect={onReset}>
          Reset to default price
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove} className="text-danger">
          <TrashIcon aria-hidden className="text-danger size-3.5 shrink-0" />
          Remove line
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The calculation bar under the line table. */
export function LineFooter({
  stats,
}: {
  stats: { label: string; value: ReactNode; tone?: string }[];
}) {
  return (
    <div
      role="group"
      aria-label="Proposal totals"
      className="caption-style border-border grid shrink-0 grid-cols-2 gap-px overflow-hidden border-t sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none"
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="outline-border flex min-w-0 items-center gap-2 px-4 py-3 outline-1"
        >
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
