"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { PageStatus } from "@/components/shell/page";
import {
  AUTOMATION_STATUS_LABEL,
  type AutomationStatus,
  type NodeKind,
} from "@/lib/domain/automations";
import { cn } from "@/lib/utils";
import { NODE_META, STATUS_TONE, toneVars } from "./node-meta";
import { routes } from "@/lib/routes";

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

/** Header pill while an admin has stopped every sequence; links to the switch. */
export function StoppedStatus() {
  const safety = useQuery(api.automations.safety, {});
  if (!safety?.killSwitch) return null;
  return (
    <Tooltip
      content={`${safety.killSwitch.by} stopped all sequences. Runs hold and nothing sends until it's turned off in Settings → Workspace.`}
    >
      <Link
        href={routes.workspace}
        className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
      >
        <PageStatus tone="danger">All sequences stopped</PageStatus>
      </Link>
    </Tooltip>
  );
}

/** The steps of a sequence as a row of small coloured icon tiles. */
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
