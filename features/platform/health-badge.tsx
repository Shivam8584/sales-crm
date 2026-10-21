"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Tag, { type TagTone } from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { HEALTH_BAND_LABEL, type HealthBand } from "@/lib/domain/health";
import { cn } from "@/lib/utils";

export const HEALTH_TONE: Record<HealthBand, TagTone> = {
  healthy: "green",
  watch: "amber",
  at_risk: "red",
};

const RING_TONE: Record<HealthBand, string> = {
  healthy: "text-success",
  watch: "text-warning",
  at_risk: "text-danger",
};

/** Score as a ring that fills to 100, coloured by band. */
export function HealthRing({
  score,
  band,
  size = 16,
  stroke = 2.5,
  className,
}: {
  score: number;
  band: HealthBand;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-overlay-3"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * length} ${length}`}
        className={cn("stroke-current", RING_TONE[band])}
      />
    </svg>
  );
}

/**
 * Compact health score: ring, number and (optionally) the band name. Use in
 * list cells, peeks and headers; pass the `score`/`band` from
 * `api.platform.healthIndex` or `api.activation.health`.
 */
export function HealthBadge({
  score,
  band,
  showBand = false,
  className,
}: {
  score: number;
  band: HealthBand;
  showBand?: boolean;
  className?: string;
}) {
  const label = `Health ${score} of 100, ${HEALTH_BAND_LABEL[band]}`;
  const badge = (
    <span
      aria-label={label}
      className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}
    >
      <HealthRing score={score} band={band} />
      <span className="w-[2.5ch] text-right">{score}</span>
      {showBand && (
        <Tag tone={HEALTH_TONE[band]} size="xs">
          {HEALTH_BAND_LABEL[band]}
        </Tag>
      )}
    </span>
  );
  return showBand ? badge : <Tooltip content={label}>{badge}</Tooltip>;
}

/**
 * Health for every account linked to the platform, keyed by account id; undefined
 * while loading. For a "Health" column on the accounts list:
 * `const health = useHealthIndex();` then
 * `cell: (row) => health?.[row._id] ? <HealthBadge {...health[row._id]} /> : dash`.
 */
export function useHealthIndex() {
  const index = useQuery(api.platform.healthIndex, {});
  return index as
    | Record<string, { score: number; band: HealthBand; signals: string[] }>
    | undefined;
}
