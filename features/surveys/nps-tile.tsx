"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Skeleton from "@/components/_ui/skeleton";
import { signed } from "@/features/reports/format";
import { MetricTile } from "@/features/reports/section";
import { NPS_MIN_RESPONSES } from "@/lib/domain/surveys";
import MessageIcon from "@/public/assets/icons/message.svg";

const DAYS = 90;

/** Workspace-wide NPS for the last 90 days; the score waits for enough answers to mean something. */
export default function NpsTile() {
  const data = useQuery(api.surveys.nps, { days: DAYS });
  if (!data) {
    return (
      <div
        aria-busy
        className="border-line-strong flex flex-col gap-3 rounded-lg border p-2.75"
      >
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-10" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }
  const ready = data.nps !== null && data.total >= NPS_MIN_RESPONSES;
  return (
    <MetricTile
      icon={MessageIcon}
      label={`NPS (${DAYS} days)`}
      value={ready ? signed(data.nps!) : "—"}
      detail={`${data.total} ${data.total === 1 ? "response" : "responses"}`}
    />
  );
}
