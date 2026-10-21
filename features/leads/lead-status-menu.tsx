"use client";

import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import ToneDot from "@/components/board/tone-dot";
import {
  DISQUALIFY_REASONS,
  LEAD_STATUSES,
  type DisqualifyReason,
  type LeadStatus,
} from "@/lib/domain/enums";
import {
  DISQUALIFY_REASON_LABEL,
  LEAD_STATUS_LABEL,
} from "@/lib/domain/labels";
import { STATUS_TONE } from "./lead-meta";

const WORKING = LEAD_STATUSES.filter(
  (status) => status !== "disqualified" && status !== "converted",
);

/**
 * Working statuses plus "Disqualify as…" reasons in one menu, since a
 * disqualification always needs a reason. `status` is null for a selection.
 */
export default function LeadStatusMenu({
  status,
  reason,
  onChange,
  children,
  align = "start",
  side,
  disqualifyOnly = false,
}: {
  status: LeadStatus | null;
  reason?: DisqualifyReason | null;
  onChange: (status: LeadStatus, reason?: DisqualifyReason) => void;
  /** The trigger, rendered `asChild`. */
  children: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  disqualifyOnly?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="min-w-52">
        {!disqualifyOnly && (
          <>
            <DropdownMenuRadioGroup
              aria-label="Status"
              value={status ?? ""}
              onValueChange={(value) => onChange(value as LeadStatus)}
            >
              {WORKING.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <ToneDot tone={STATUS_TONE[value]} />
                  {LEAD_STATUS_LABEL[value]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Disqualify as</DropdownMenuLabel>
        {DISQUALIFY_REASONS.map((value) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => onChange("disqualified", value)}
            className="pl-6"
            aria-current={
              status === "disqualified" && reason === value ? true : undefined
            }
          >
            {DISQUALIFY_REASON_LABEL[value]}
            {status === "disqualified" && reason === value && (
              <span className="text-fg-tertiary ml-auto">Current</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
