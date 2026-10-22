"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CountUp from "@/components/_common/count-up";
import SegmentBar from "@/components/_common/segment-bar";
import Skeleton from "@/components/_ui/skeleton";
import {
  TARGET_METRICS,
  TARGET_METRIC_LABEL,
  type Attainment,
} from "@/lib/domain/forecast";
import { cn } from "@/lib/utils";
import { formatFigure } from "./format";

const LIFTED =
  "bg-background shadow-card relative flex h-full flex-col overflow-hidden rounded-4xl p-6";

/** The viewer's month on Today: won take in rose against the target, then the other goals as a ledger. */
export default function MonthCard({ className }: { className?: string }) {
  const data = useQuery(api.targets.attainment, {});

  if (!data) {
    return (
      <section aria-busy className={cn(LIFTED, className)}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-10 w-36" />
        <Skeleton className="mt-6 h-1.5 w-full" />
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </section>
    );
  }

  const won: Attainment = data.mine.won_take;
  const rest = TARGET_METRICS.filter((metric) => metric !== "won_take");

  return (
    <section
      aria-labelledby="month-card-title"
      className={cn(LIFTED, className)}
    >
      <span
        aria-hidden
        className="bg-rose/[0.07] pointer-events-none absolute -top-24 -right-24 size-60 rounded-full blur-3xl"
      />
      <h2 id="month-card-title" className="text-fg-secondary relative text-sm">
        Won this month
      </h2>
      <p className="text-rose relative mt-1 text-[2.75rem] leading-none font-semibold tracking-[-0.035em] max-lg:text-4xl">
        <CountUp
          value={won.actual}
          format={(value) => formatFigure("won_take", value)}
        />
      </p>
      {won.target !== null && (
        <div className="relative mt-4">
          <SegmentBar
            percent={won.pct ?? 0}
            segmentClassName="bg-rose"
            className="h-1.5"
          />
          <p className="text-fg-tertiary mt-2 text-xs tabular-nums">
            {won.pct}% of the {formatFigure("won_take", won.target)} target
            {won.pace && ` · ${won.pace}`}
          </p>
        </div>
      )}
      <dl className="border-border relative mt-5 flex flex-col gap-3 border-t pt-4 text-sm tabular-nums">
        {rest.map((metric) => {
          const cell = data.mine[metric];
          return (
            <div
              key={metric}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-fg-secondary">
                {TARGET_METRIC_LABEL[metric]}
              </dt>
              <dd className="font-medium">
                {formatFigure(metric, cell.actual)}
                {cell.target !== null && (
                  <span className="text-fg-tertiary font-normal">
                    {" "}
                    / {formatFigure(metric, cell.target)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
