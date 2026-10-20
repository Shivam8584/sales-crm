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

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

export function toMinor(major: number, currency: Currency): number {
  return Math.round(major * 10 ** MINOR_DIGITS[currency]);
}

export function toMajor(money: Money): number {
  return money.amount / 10 ** MINOR_DIGITS[money.currency];
}

export function money(major: number, currency: Currency = DEFAULT_CURRENCY) {
  return { amount: toMinor(major, currency), currency };
}

export function formatMoney(
  value: Money,
  options: { compact?: boolean; fractions?: boolean } = {},
) {
  return new Intl.NumberFormat(LOCALE[value.currency], {
    style: "currency",
    currency: value.currency,
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: options.compact ? 1 : options.fractions ? 2 : 0,
    minimumFractionDigits: options.fractions && !options.compact ? 2 : 0,
  }).format(toMajor(value));
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
