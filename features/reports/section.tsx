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
          <h2 className="text-sm leading-5 font-medium">{title}</h2>
          {description && (
            <p className="caption-style text-fg-tertiary leading-snug text-pretty">
              {description}
            </p>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
      {footnote && (
        <details className="caption-style text-fg-tertiary mt-auto leading-snug">
          <summary className="hover:text-fg-secondary focus-visible:ring-ring w-fit cursor-pointer rounded-sm outline-none focus-visible:ring-2">
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
    <div className="flex min-w-0 flex-col gap-2">
      <span className="caption-style text-fg-tertiary truncate">{label}</span>
      <span
        className={cn(
          "truncate text-2xl leading-none font-medium tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </span>
      {(detail || delta) && (
        <span className="flex min-h-4 flex-col gap-1.5">
          {detail && (
            <span className="caption-style text-fg-tertiary truncate tabular-nums">
              {detail}
            </span>
          )}
          {delta}
        </span>
      )}
    </div>
  );
}

export function Delta({ value, trend }: { value: string; trend: Trend }) {
  return (
    <span
      className={cn(
        "caption-style tabular-nums",
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
export function ChartSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-4">
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
