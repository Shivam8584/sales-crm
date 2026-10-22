"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "motion/react";
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
  const id = useId();

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
        "bg-well inline-flex shrink-0 items-center rounded-full p-1",
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
              "text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-base relative inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[13px] leading-none font-medium whitespace-nowrap transition-[color,scale] ease-out outline-none focus-visible:ring-2 active:scale-[0.97] motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2 pointer-coarse:after:content-['']",
              size === "sm" ? "h-7 px-2.5" : "h-8 px-3.5",
              checked && "text-foreground",
            )}
          >
            {checked && (
              <motion.span
                aria-hidden
                layoutId={`${id}-thumb`}
                transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                className="bg-background shadow-capsule absolute inset-0 rounded-full"
              />
            )}
            <span className="relative contents [&>svg]:relative">
              {option.icon}
            </span>
            <span
              className={cn(
                "relative",
                compact && option.icon && "max-sm:sr-only",
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
