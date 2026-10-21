import type { Currency, Money } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

const MINOR = 100;

function formatter(currency: Currency, fractions: boolean, compact: boolean) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: fractions ? 2 : 0,
    maximumFractionDigits: fractions ? 2 : compact ? 1 : 0,
  });
}

/** Paise only when there are any, so ₹1,715 stays whole and ₹144.50 keeps both digits. */
export function formatAmount(
  amount: number,
  currency: Currency,
  options: { compact?: boolean } = {},
) {
  const fractions = !options.compact && amount % MINOR !== 0;
  return formatter(currency, fractions, Boolean(options.compact)).format(
    amount / MINOR,
  );
}

/** Major-unit text for editing, e.g. 14450 → "144.5". */
export function editableAmount(amount: number) {
  if (!amount) return "";
  const whole = Math.trunc(amount / MINOR);
  const fraction = Math.abs(amount % MINOR);
  return fraction
    ? `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`
    : String(whole);
}

/** Digits grouped for the currency without the symbol, e.g. "1,00,000.50". */
export function groupedAmount(amount: number, currency: Currency) {
  const fractions = amount % MINOR !== 0;
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: fractions ? 2 : 0,
    maximumFractionDigits: fractions ? 2 : 0,
  }).format(amount / MINOR);
}

/** "1,000.50" or "₹1,000.50" → minor units; null when it isn't a non-negative amount. */
export function parseAmount(text: string) {
  const value = text.replace(/[,\s]/g, "").replace(/^[^\d.]+/, "");
  if (value === "") return 0;
  if (!/^\d{0,13}(\.\d{0,2})?$/.test(value) || value === ".") return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole || "0") * MINOR + Number(fraction.padEnd(2, "0"));
}

/** Money with a muted currency symbol, in tabular figures. */
export function Amount({
  value,
  compact,
  className,
}: {
  value: Money | { amount: number; currency: Currency };
  compact?: boolean;
  className?: string;
}) {
  const fractions = !compact && value.amount % MINOR !== 0;
  const parts = formatter(
    value.currency,
    fractions,
    Boolean(compact),
  ).formatToParts(value.amount / MINOR);
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {parts.map((part, index) =>
        part.type === "currency" ? (
          <span key={index} className="text-fg-tertiary mr-px">
            {part.value}
          </span>
        ) : part.type === "literal" ? null : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </span>
  );
}
