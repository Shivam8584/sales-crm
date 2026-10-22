"use client";

import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";

export type Segment<T extends string = string> = {
  value: T;
  label: string;
  count?: ReactNode;
  icon?: ReactNode;
};

export const SEGMENT_TRACK =
  "bg-well inline-flex h-9 shrink-0 items-center rounded-full p-0.75";

export const SEGMENT_ITEM =
  "text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-base relative flex h-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm leading-none font-medium whitespace-nowrap transition-[color,scale] outline-none focus-visible:ring-2 active:scale-[0.97] motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2 pointer-coarse:after:content-['']";

export function SegmentThumb({ id }: { id: string }) {
  return (
    <motion.span
      aria-hidden
      layoutId={id}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="bg-background shadow-capsule absolute inset-0 rounded-full"
    />
  );
}

type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  segments: Segment<T>[];
  /** Accessible name of the group, e.g. "Show". */
  label: string;
  /** Show only icons below the `sm` breakpoint. */
  compact?: boolean;
  className?: string;
};

/** A small set of mutually exclusive views, e.g. Unread / All. */
export default function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  label,
  compact = false,
  className,
}: SegmentedControlProps<T>) {
  const id = useId();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
      aria-label={label}
      className={cn(SEGMENT_TRACK, className)}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <ToggleGroup.Item
            key={segment.value}
            value={segment.value}
            className={cn(SEGMENT_ITEM, active && "text-foreground")}
          >
            {active && <SegmentThumb id={`${id}-thumb`} />}
            {segment.icon && (
              <span className="relative contents [&>svg]:relative">
                {segment.icon}
              </span>
            )}
            <span
              className={cn(
                "relative",
                compact && segment.icon && "max-sm:sr-only",
              )}
            >
              {segment.label}
            </span>
            {segment.count !== undefined && (
              <span className="text-fg-tertiary relative tabular-nums">
                {segment.count}
              </span>
            )}
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
