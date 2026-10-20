"use client";

import { useRef, type KeyboardEvent } from "react";
import { PERIODS, type Period } from "@/convex/lib/reports";
import { cn } from "@/lib/utils";

export const PERIOD_LABEL: Record<Period, { short: string; long: string }> = {
  "7d": { short: "7D", long: "Last 7 days" },
  "30d": { short: "30D", long: "Last 30 days" },
  "90d": { short: "90D", long: "Last 90 days" },
  quarter: { short: "Quarter", long: "This quarter" },
};

/** Segmented radio group; arrow keys move between periods. */
export default function PeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (value: Period) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + PERIODS.length) % PERIODS.length;
    onChange(PERIODS[next]);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Period"
      className="bg-muted h-control-md flex rounded-full p-0.5"
    >
      {PERIODS.map((period, index) => {
        const active = period === value;
        return (
          <button
            key={period}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={PERIOD_LABEL[period].long}
            title={PERIOD_LABEL[period].long}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(period)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "focus-visible:ring-ring duration-fast rounded-full px-3 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-2",
              active
                ? "bg-card text-foreground shadow-raised"
                : "text-fg-secondary hover:text-foreground",
            )}
          >
            {PERIOD_LABEL[period].short}
          </button>
        );
      })}
    </div>
  );
}
