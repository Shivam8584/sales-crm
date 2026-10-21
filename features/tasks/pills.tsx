"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { chipClass } from "./task-chips";

export type Pill<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

/** Single choice shown as wrapping pills; a radio group with arrow-key navigation. */
export default function Pills<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: Pill<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
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

  const focusable = options.some((option) => option.value === value)
    ? value
    : options[0]?.value;

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("flex flex-wrap gap-2", className)}
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
            tabIndex={option.value === focusable ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              chipClass("md"),
              "max-w-full",
              "text-fg-tertiary aria-checked:text-foreground aria-checked:shadow-[0_0_0_1px_var(--foreground)]",
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
