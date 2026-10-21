import type { ComponentType, ReactNode, SVGProps } from "react";
import { DetailSection } from "@/components/record/detail";
import Skeleton from "@/components/_ui/skeleton";
import { cn } from "@/lib/utils";
import type { Trend } from "./format";

/** Flat bordered surface shared by report blocks; tables inside it keep the page background. */
const REPORT_CARD =
  "border-border bg-background flex min-w-0 flex-col overflow-hidden rounded-xl border";

/** A report block: eyebrow title with an export action, a one-line description, the content and a footnote defining its metrics. */
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
    <section id={id} aria-label={title} className={cn(REPORT_CARD, className)}>
      <DetailSection
        title={title}
        action={aside}
        divider={false}
        className="gap-1 px-4 pt-3 pb-3.5 sm:px-5"
      >
        {description && (
          <p className="caption-style text-fg-tertiary leading-snug text-pretty">
            {description}
          </p>
        )}
      </DetailSection>
      {children}
      {footnote && (
        <p className="caption-style text-fg-tertiary border-border mt-auto border-t px-4 py-3 leading-snug text-pretty sm:px-5">
          {footnote}
        </p>
      )}
    </section>
  );
}

/** The body of a report block, ruled off from its heading. */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-border border-t", className)}>{children}</div>
  );
}

/** Stat tile in the record-detail style, with an optional comparison line. */
export function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  delta,
  tone,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  delta?: ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="border-line-strong flex min-w-0 flex-col gap-3 rounded-lg border p-2.75">
      <span className="caption-style text-fg-secondary flex min-w-0 items-center gap-1">
        {Icon && <Icon aria-hidden className="size-3 shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "truncate text-2xl leading-none font-semibold tabular-nums",
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
      <span className="text-fg-tertiary truncate">{label}</span>
    </span>
  );
}

/** Placeholder rows shaped like a meter chart. */
export function ChartSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
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
        "duration-base flex flex-col gap-5 transition-opacity",
        loading && "opacity-60",
      )}
    >
      {children}
    </div>
  );
}
