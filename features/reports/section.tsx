import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Trend } from "./format";

/** A titled report block with an always-visible footnote that defines its metrics. */
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
      aria-labelledby={`${id}-title`}
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <div className="flex items-start justify-between gap-x-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`${id}-title`} className="lead-style font-medium">
            {title}
          </h2>
          {description && (
            <p className="caption-style text-fg-tertiary leading-snug text-pretty">
              {description}
            </p>
          )}
        </div>
        {aside && <div className="-mr-2 flex shrink-0">{aside}</div>}
      </div>
      {children}
      {footnote && (
        <p className="caption-style text-fg-tertiary max-w-prose leading-snug text-pretty">
          {footnote}
        </p>
      )}
    </section>
  );
}

/** Bordered surface for a chart or table inside a section. */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("shadow-hairline rounded-xl", className)}>
      {children}
    </div>
  );
}

export function Delta({
  value,
  trend,
  label = "vs previous",
}: {
  value: string;
  trend: Trend;
  label?: string;
}) {
  return (
    <span className="caption-style inline-flex items-center gap-1 tabular-nums">
      <span
        className={cn(
          "font-medium",
          trend === "good" && "text-success",
          trend === "bad" && "text-danger",
          trend === "flat" && "text-fg-secondary",
        )}
      >
        {value}
      </span>
      <span className="text-fg-tertiary">{label}</span>
    </span>
  );
}
