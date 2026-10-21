"use client";

import type { CSSProperties } from "react";
import Tag from "@/components/_ui/tag";
import {
  AUTOMATION_STATUS_LABEL,
  type AutomationStatus,
  type NodeKind,
} from "@/lib/domain/automations";
import { cn } from "@/lib/utils";
import { NODE_META, STATUS_TONE, toneVars } from "./node-meta";

export function StatusTag({
  status,
  version,
}: {
  status: AutomationStatus;
  version?: number;
}) {
  return (
    <Tag tone={STATUS_TONE[status]} size="xs" className="gap-1">
      {AUTOMATION_STATUS_LABEL[status]}
      {version ? <span className="opacity-70">v{version}</span> : null}
    </Tag>
  );
}

/** The steps of an automation as a row of small coloured icon tiles. */
export function StepIcons({
  steps,
  max = 6,
  size = "md",
  className,
}: {
  steps: NodeKind[];
  max?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const shown = steps.slice(0, max);
  return (
    <span
      className={cn("flex flex-wrap items-center gap-1", className)}
      aria-label={`${steps.length} steps`}
    >
      {shown.map((kind, index) => {
        const meta = NODE_META[kind];
        return (
          <span
            key={index}
            title={meta.label}
            style={toneVars(meta.tone) as CSSProperties}
            className={cn(
              "flex items-center justify-center rounded-md border border-(--accent-border) bg-(--accent-surface)",
              size === "md" ? "size-7" : "size-6",
            )}
          >
            <meta.Icon
              aria-hidden
              className={cn(
                "text-(--accent)",
                size === "md" ? "size-3.5" : "size-3",
              )}
            />
          </span>
        );
      })}
      {steps.length > max && (
        <span
          className={cn(
            "bg-overlay-2 text-fg-tertiary flex items-center rounded-md px-1.5 text-xs font-medium tabular-nums",
            size === "md" ? "h-7" : "h-6",
          )}
        >
          +{steps.length - max}
        </span>
      )}
    </span>
  );
}
