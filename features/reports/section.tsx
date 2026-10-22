import type { ReactNode } from "react";
import Skeleton from "@/components/_ui/skeleton";
import { cn } from "@/lib/utils";
import type { Trend } from "./format";

/** A report block: title with an export action, a one-line description, the content and a collapsed note defining its metrics. */
export function ReportSection({
  id,
  title,
  description,
  aside,
  footnote,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={cn("flex min-w-0 flex-col gap-4", className)}
    >
      <header className="flex min-w-0 items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="title-style">{title}</h2>
          {description && (
            <p className="text-fg-secondary text-sm text-pretty">
              {description}
            </p>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
      {footnote && (
        <details className="caption-style text-fg-tertiary leading-snug">
          <summary className="hover:text-fg-secondary focus-visible:ring-ring relative w-fit cursor-pointer rounded-sm outline-none focus-visible:ring-2 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3.5 pointer-coarse:after:content-['']">
            How this is measured
          </summary>
          <p className="pt-2 text-pretty">{footnote}</p>
        </details>
      )}
    </section>
  );
}

/** A figure with its label and an optional comparison line. */
export function MetricTile({
  label,
  value,
  detail,
  delta,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  delta?: ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="hover:bg-background duration-base flex min-w-0 flex-col gap-1.5 rounded-2xl px-4 py-3.5 transition-colors hover:duration-[120ms]">
      <span className="text-fg-secondary truncate text-xs">{label}</span>
      <span
        className={cn(
          "truncate text-2xl leading-none font-semibold tracking-[-0.02em] tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </span>
      {(detail || delta) && (
        <span className="flex min-h-4 flex-col gap-1.5">
          {detail && (
            <span className="text-fg-tertiary truncate text-xs tabular-nums">
              {detail}
            </span>
          )}
          {delta}
        </span>
      )}
    </div>
  );
}

export function MetricTileSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-1.5 px-4 py-3.5">
      <Skeleton className="my-0.5 h-3 w-20" />
      <Skeleton className="h-6 w-10" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="my-0.5 h-3 w-24" />
        <Skeleton className="my-0.5 h-3 w-12" />
      </div>
    </div>
  );
}

export function Delta({ value, trend }: { value: string; trend: Trend }) {
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        trend === "good" && "text-success",
        trend === "bad" && "text-danger",
        trend === "flat" && "text-fg-secondary",
      )}
    >
      {value}
      <span className="sr-only"> vs previous period</span>
    </span>
  );
}

/** Placeholder rows shaped like a meter chart. */
export function ChartSkeleton({
  rows,
  className,
}: {
  rows: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-3 w-24 shrink-0" />
          <Skeleton
            className="h-4"
            style={{ width: `${Math.max(12, 90 - index * 8)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/** Matches the lead-in line, stage meters and optional won/lost tiles of the pipeline and activation charts. */
export function StageSkeleton({
  rowClassName,
  tiles = false,
}: {
  rowClassName: string;
  tiles?: boolean;
}) {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <Skeleton className="my-[3.5px] h-3 w-48 max-w-full" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={cn("flex flex-col gap-2", rowClassName)}>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4" />
          </div>
        ))}
      </div>
      {tiles && (
        <div className="bg-well grid grid-cols-2 gap-1 rounded-3xl p-1">
          <MetricTileSkeleton />
          <MetricTileSkeleton />
        </div>
      )}
    </div>
  );
}

/** Dims a report while it reloads for new filters, keeping the old figures readable. */
export function Reloading({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-busy={loading}
      className={cn(
        "duration-base flex flex-col gap-10 transition-opacity",
        loading && "opacity-60",
      )}
    >
      {children}
    </div>
  );
}
