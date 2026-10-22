"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import SegmentBar from "@/components/_common/segment-bar";
import {
  TARGET_METRICS,
  TARGET_METRIC_LABEL,
  type Attainment,
} from "@/lib/domain/forecast";
import { formatFigure } from "./format";

const SHOWN = 3;

/** The viewer's month against their goals, one quiet line; absent until there is a goal or some activity. */
export default function MonthStrip() {
  const data = useQuery(api.targets.attainment, {});
  if (!data) return null;

  const shown = TARGET_METRICS.flatMap((metric) => {
    const cell: Attainment = data.mine[metric];
    return cell.target !== null || cell.actual > 0 ? [{ metric, cell }] : [];
  })
    .sort(
      (a, b) => Number(b.cell.target !== null) - Number(a.cell.target !== null),
    )
    .slice(0, SHOWN);
  if (shown.length === 0) return null;

  return (
    <p className="caption-style text-fg-tertiary flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1">
      <span>This month</span>
      {shown.map(({ metric, cell }) => (
        <span key={metric} className="flex items-center gap-2 tabular-nums">
          {TARGET_METRIC_LABEL[metric]}
          <span className="text-foreground">
            {formatFigure(metric, cell.actual)}
            {cell.target !== null && ` / ${formatFigure(metric, cell.target)}`}
          </span>
          {cell.pct !== null && (
            <SegmentBar
              percent={Math.min(100, cell.pct)}
              segments={10}
              tone={cell.pace === "behind" ? "warning" : "success"}
              className="w-11 shrink-0"
            />
          )}
          {cell.pace && <span>{cell.pace}</span>}
        </span>
      ))}
    </p>
  );
}
