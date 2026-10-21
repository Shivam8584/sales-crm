/**
 * Money is stored as an integer count of the currency's minor unit (paise,
 * cents) next to an ISO 4217 code, so arithmetic never touches floats.
 */

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "INR";

export type Money = { amount: number; currency: Currency };

const MINOR_DIGITS: Record<Currency, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  SGD: 2,
};

const LOCALE: Record<Currency, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AED: "en-AE",
  SGD: "en-SG",
};

function toMinor(major: number, currency: Currency): number {
  const digits = MINOR_DIGITS[currency];
  const text = String(major);
  // Shifting the decimal point in the string avoids 1.005 * 100 = 100.4999….
  const shifted = text.includes("e")
    ? major * 10 ** digits
    : Number(`${text}e${digits}`);
  return Math.round(shifted);
}

export function toMajor(money: Money): number {
  return money.amount / 10 ** MINOR_DIGITS[money.currency];
}

export function money(major: number, currency: Currency = DEFAULT_CURRENCY) {
  return { amount: toMinor(major, currency), currency };
}

/** Indian digit grouping (1,00,000), so INR reads the same in every runtime, ICU data or not. */
function formatInr(paise: number, fractions: boolean) {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = fractions ? Math.floor(abs / 100) : Math.round(abs / 100);
  const digits = String(rupees);
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const grouped = head
    ? `${head.replace(/\B(?=(\d{2})+$)/g, ",")},${tail}`
    : tail;
  const decimals = fractions ? `.${String(abs % 100).padStart(2, "0")}` : "";
  return `${sign}₹${grouped}${decimals}`;
}

export function formatMoney(
  value: Money,
  options: { compact?: boolean; fractions?: boolean } = {},
) {
  if (value.currency === "INR" && !options.compact) {
    return formatInr(value.amount, Boolean(options.fractions));
  }
  return new Intl.NumberFormat(LOCALE[value.currency], {
    style: "currency",
    currency: value.currency,
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: options.compact ? 1 : options.fractions ? 2 : 0,
    minimumFractionDigits: options.fractions && !options.compact ? 2 : 0,
  }).format(toMajor(value));
}

export function isMinorAmount(amount: number) {
  return Number.isSafeInteger(amount);
}

/** Adds two amounts of the same currency; mixing currencies throws. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Can't add ${a.currency} to ${b.currency}`);
  }
  const amount = a.amount + b.amount;
  if (!isMinorAmount(amount)) throw new Error("Amount out of range");
  return { amount, currency: a.currency };
}

/** Sums by currency; mixed currencies are never converted silently. */
export function sumMoney(values: Money[]): Money[] {
  const totals = new Map<Currency, number>();
  for (const value of values) {
    totals.set(
      value.currency,
      (totals.get(value.currency) ?? 0) + value.amount,
    );
  }
  return [...totals].map(([currency, amount]) => ({ amount, currency }));
}
