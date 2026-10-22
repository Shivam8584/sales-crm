"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Segment<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: Segment<T>[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /** Show only icons below the `sm` breakpoint. */
  compact?: boolean;
  className?: string;
};

/** Single choice from a few options, as a radio group with arrow-key navigation. */
export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "sm",
  compact = false,
  className,
}: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    ref.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
      ?.focus();
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "bg-overlay-2 inline-flex shrink-0 items-center gap-0.5 rounded-full p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.value}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-fast ease-power3-out relative inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-xs leading-none whitespace-nowrap transition-[color,background-color,box-shadow] outline-none focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2 pointer-coarse:after:content-['']",
              size === "sm" ? "h-6.5 px-2" : "h-8 px-3",
              checked && "bg-raised text-foreground shadow-raised font-medium",
            )}
          >
            {option.icon}
            <span className={cn(compact && option.icon && "max-sm:sr-only")}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
