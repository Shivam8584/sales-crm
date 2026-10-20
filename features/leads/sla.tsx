"use client";

import { useEffect, useState } from "react";
import type { LeadStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import ClockIcon from "@/public/assets/icons/clock.svg";
import { compactSpan } from "./lead-meta";

type SlaLead = {
  _creationTime: number;
  status: LeadStatus;
  firstTouchedAt?: number | null;
  slaBreachedAt?: number | null;
};

export type SlaState =
  | { kind: "pending"; remainingMs: number }
  | { kind: "replied"; tookMs: number; late: boolean }
  | { kind: "breached"; overMs: number }
  | { kind: "none" };

export function slaState(lead: SlaLead, slaMs: number, now: number): SlaState {
  if (lead.firstTouchedAt) {
    const tookMs = Math.max(0, lead.firstTouchedAt - lead._creationTime);
    return { kind: "replied", tookMs, late: tookMs > slaMs };
  }
  if (lead.status === "disqualified" || lead.status === "converted") {
    return { kind: "none" };
  }
  const remainingMs = lead._creationTime + slaMs - now;
  if (remainingMs > 0 && !lead.slaBreachedAt) {
    return { kind: "pending", remainingMs };
  }
  return { kind: "breached", overMs: Math.max(0, -remainingMs) };
}

function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The current time, refreshed every `intervalMs` while `active`. */
export function useNow(active: boolean, intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** Speed-to-lead status: a live countdown until the first touch, then how long it took. */
export default function SlaIndicator({
  lead,
  slaMs,
  className,
}: {
  lead: SlaLead;
  slaMs: number;
  className?: string;
}) {
  const open =
    !lead.firstTouchedAt &&
    lead.status !== "disqualified" &&
    lead.status !== "converted";
  const now = useNow(open, 1000);
  const state = slaState(lead, slaMs, now);
  const base = cn(
    "caption-style inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums",
    className,
  );

  switch (state.kind) {
    case "pending":
      return (
        <span
          className={cn(
            base,
            state.remainingMs < 60_000 ? "text-warning" : "text-foreground",
          )}
        >
          <ClockIcon aria-hidden className="size-3" />
          {countdown(state.remainingMs)}
          <span className="text-fg-tertiary">left</span>
        </span>
      );
    case "replied":
      return (
        <span
          className={cn(base, state.late ? "text-warning" : "text-success")}
          title={state.late ? "First touch came after the SLA" : undefined}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          Replied in {compactSpan(state.tookMs)}
        </span>
      );
    case "breached":
      return (
        <span className={cn(base, "text-danger font-medium")}>
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          Breached by {compactSpan(state.overMs)}
        </span>
      );
    default:
      return <span className={cn(base, "text-fg-tertiary")}>—</span>;
  }
}
