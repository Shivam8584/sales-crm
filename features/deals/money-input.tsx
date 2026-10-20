"use client";

import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { SelectContent, SelectItem } from "@/components/_ui/select";
import { CURRENCIES, type Currency, type Money } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";

const FRACTION_DIGITS = 2;
const MAX_WHOLE_DIGITS = 13;

const grouping = (currency: Currency) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US");

type Parsed = { whole: string; fraction: string | null };

function parse(input: string): Parsed {
  const cleaned = input.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const wholeRaw = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const whole = wholeRaw.replace(/^0+(?=\d)/, "").slice(0, MAX_WHOLE_DIGITS);
  const fraction =
    dot === -1
      ? null
      : cleaned
          .slice(dot + 1)
          .replace(/\./g, "")
          .slice(0, FRACTION_DIGITS);
  return { whole, fraction };
}

function display({ whole, fraction }: Parsed, currency: Currency) {
  const grouped = whole ? grouping(currency).format(BigInt(whole)) : "";
  if (fraction === null) return grouped;
  return `${grouped || "0"}.${fraction}`;
}

function toMinor({ whole, fraction }: Parsed) {
  const major = Number(whole || "0");
  const minor = Number((fraction ?? "").padEnd(FRACTION_DIGITS, "0"));
  return major * 10 ** FRACTION_DIGITS + minor;
}

function fromMinor(value: Money): string {
  if (!value.amount) return "";
  const whole = Math.floor(value.amount / 10 ** FRACTION_DIGITS);
  const minor = value.amount % 10 ** FRACTION_DIGITS;
  return display(
    {
      whole: String(whole),
      fraction: minor
        ? String(minor).padStart(FRACTION_DIGITS, "0").replace(/0$/, "")
        : null,
    },
    value.currency,
  );
}

/** Index in `text` just after the `count`-th digit or decimal point. */
function caretAfter(text: string, count: number) {
  if (count === 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index++) {
    if (/[\d.]/.test(text[index])) seen += 1;
    if (seen === count) return index + 1;
  }
  return text.length;
}

type MoneyInputProps = {
  id: string;
  value: Money;
  onChange: (value: Money) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
};

/**
 * Amount with a currency picker. Groups digits as you type (lakh/crore for
 * INR) and reports the value in integer minor units.
 */
export default function MoneyInput({
  id,
  value,
  onChange,
  placeholder = "0",
  invalid,
  describedBy,
  className,
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const [text, setText] = useState(() => fromMinor(value));
  const [synced, setSynced] = useState(value);

  if (value.amount !== synced.amount || value.currency !== synced.currency) {
    setSynced(value);
    if (value.amount !== toMinor(parse(text))) setText(fromMinor(value));
    else if (value.currency !== synced.currency) {
      setText(display(parse(text), value.currency));
    }
  }

  useLayoutEffect(() => {
    if (caretRef.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  }, [text]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const significant = raw.slice(0, caret).replace(/[^\d.]/g, "").length;
    const parsed = parse(raw);
    const next = display(parsed, value.currency);
    caretRef.current = caretAfter(next, significant);
    setText(next);
    const amount = toMinor(parsed);
    setSynced({ amount, currency: value.currency });
    onChange({ amount, currency: value.currency });
  }

  return (
    <div
      className={cn(
        "border-input bg-secondary duration-fast ease-power3-out focus-within:border-selected focus-within:ring-selected/20 flex h-9 w-full min-w-0 items-center rounded-lg border transition-[border-color,box-shadow] focus-within:ring-3",
        invalid && "border-danger",
        className,
      )}
    >
      <SelectPrimitive.Root
        value={value.currency}
        onValueChange={(currency) =>
          onChange({ amount: value.amount, currency: currency as Currency })
        }
      >
        <SelectPrimitive.Trigger
          aria-label="Currency"
          className="group text-fg-secondary hover:text-foreground border-input focus-visible:bg-overlay-2 flex h-full shrink-0 cursor-pointer items-center gap-1 rounded-l-lg border-r pr-2 pl-3 text-xs font-medium outline-none"
        >
          <SelectPrimitive.Value />
          <ChevronDownIcon
            aria-hidden
            className="text-fg-tertiary duration-base size-2.5 transition-transform group-data-[state=open]:rotate-180"
          />
        </SelectPrimitive.Trigger>
        <SelectContent align="start">
          {CURRENCIES.map((currency) => (
            <SelectItem key={currency} value={currency}>
              {currency}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive.Root>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={handleChange}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="placeholder:text-fg-tertiary h-full min-w-0 flex-1 bg-transparent px-3 text-sm leading-none tabular-nums outline-none"
      />
    </div>
  );
}
