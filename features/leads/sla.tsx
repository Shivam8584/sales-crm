"use client";

import { useEffect, useState } from "react";
import { slaClockStart } from "@/lib/domain/day";
import type { LeadStatus } from "@/lib/domain/enums";
import SegmentBar from "@/components/_common/segment-bar";
import { cn } from "@/lib/utils";
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

/** The clock starts at the next 09:00 India time for leads that land out of hours. */
export function slaState(lead: SlaLead, slaMs: number, now: number): SlaState {
  const start = slaClockStart(lead._creationTime);
  if (lead.firstTouchedAt) {
    const tookMs = Math.max(0, lead.firstTouchedAt - start);
    return { kind: "replied", tookMs, late: tookMs > slaMs };
  }
  if (lead.status === "disqualified" || lead.status === "converted") {
    return { kind: "none" };
  }
  const remainingMs = start + slaMs - now;
  if (remainingMs > 0 && !lead.slaBreachedAt) {
    return { kind: "pending", remainingMs };
  }
  return { kind: "breached", overMs: Math.max(0, -remainingMs) };
}

export function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function isSlaOpen(lead: SlaLead) {
  return (
    !lead.firstTouchedAt &&
    lead.status !== "disqualified" &&
    lead.status !== "converted"
  );
}

type MeterTone = "danger" | "warning" | "success";

/** How much of the SLA a lead has used, and the tone that goes with it. */
export function slaMeter(
  state: SlaState,
  slaMs: number,
): { percent: number; tone: MeterTone } | null {
  switch (state.kind) {
    case "pending": {
      const percent = slaMs
        ? Math.max(
            0,
            Math.min(100, ((slaMs - state.remainingMs) / slaMs) * 100),
          )
        : 100;
      return {
        percent,
        tone:
          state.remainingMs < 60_000
            ? "danger"
            : percent >= 50
              ? "warning"
              : "success",
      };
    }
    case "replied":
      return {
        percent: slaMs ? Math.min(100, (state.tookMs / slaMs) * 100) : 100,
        tone: state.late ? "warning" : "success",
      };
    case "breached":
      return { percent: 100, tone: "danger" };
    default:
      return null;
  }
}

/** Table cell: a small meter of the SLA used, then the countdown, reply time or overrun. */
export function SlaCell({ lead, slaMs }: { lead: SlaLead; slaMs: number }) {
  const now = useNow(isSlaOpen(lead), 1000);
  const state = slaState(lead, slaMs, now);
  const meter = slaMeter(state, slaMs);
  if (!meter) return <span className="text-fg-tertiary">—</span>;
  const [text, muted, title] =
    state.kind === "pending" && state.remainingMs > slaMs
      ? ["9:00", "start", "Arrived out of hours; the clock starts at 09:00 IST"]
      : state.kind === "pending"
        ? [
            countdown(state.remainingMs),
            "left",
            "Time left to make the first touch",
          ]
        : state.kind === "replied"
          ? [
              compactSpan(state.tookMs),
              "to reply",
              state.late
                ? "First touch came after the SLA"
                : "First touch within the SLA",
            ]
          : state.kind === "breached"
            ? [
                compactSpan(state.overMs),
                "late",
                "No first touch yet, past the SLA",
              ]
            : ["", "", ""];
  return (
    <span
      title={title}
      className="flex min-w-0 items-center gap-2 whitespace-nowrap tabular-nums"
    >
      <SegmentBar
        percent={meter.percent}
        segments={8}
        tone={meter.tone}
        className="h-3 w-11 shrink-0 px-px"
        segmentClassName="h-2"
      />
      <span
        className={cn(
          "truncate",
          state.kind === "breached" && "text-danger",
          state.kind === "pending" && meter.tone === "danger" && "text-danger",
        )}
      >
        {text} <span className="text-fg-tertiary">{muted}</span>
      </span>
    </span>
  );
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
