"use client";

import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils";

export type Segment = { value: string; label: string; count?: ReactNode };

type SegmentedControlProps = {
  value: string;
  onChange: (value: string) => void;
  segments: Segment[];
  /** Accessible name of the group, e.g. "Show". */
  label: string;
  className?: string;
};

/** A small set of mutually exclusive views, e.g. Unread / All. */
export default function SegmentedControl({
  value,
  onChange,
  segments,
  label,
  className,
}: SegmentedControlProps) {
  const id = useId();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next)}
      aria-label={label}
      className={cn(
        "bg-overlay-2 h-control-md inline-flex shrink-0 items-center gap-0.5 rounded-full p-0.75",
        className,
      )}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <ToggleGroup.Item
            key={segment.value}
            value={segment.value}
            className={cn(
              "text-fg-tertiary hover:text-foreground focus-visible:ring-ring duration-fast relative flex h-full cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs leading-none font-medium transition-colors outline-none focus-visible:ring-2",
              active && "text-foreground",
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={`${id}-thumb`}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                className="bg-secondary shadow-raised absolute inset-0 rounded-full"
              />
            )}
            <span className="relative">{segment.label}</span>
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
