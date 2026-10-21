import type { ComponentType, ReactNode, SVGProps } from "react";
import SegmentBar from "@/components/_common/segment-bar";
import Sparkline from "@/components/_common/sparkline";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/_ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * A block of a detail sheet or record sidebar: uppercase eyebrow title, an
 * optional control on the right, and a divider underneath. `collapsible`
 * lets the title fold the block away.
 */
export function DetailSection({
  title,
  action,
  children,
  className,
  divider = true,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Turn off for the last section of a sheet. */
  divider?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const classes = cn(
    "flex min-w-0 flex-col gap-4 px-6 py-5",
    divider && "shadow-divider",
    className,
  );
  if (collapsible) {
    return (
      <Collapsible
        asChild
        defaultOpen={defaultOpen}
        className={cn(
          classes,
          "group/collapsible duration-base ease-power3-out transition-[gap] data-[state=closed]:gap-0",
        )}
      >
        <section>
          <div className="min-h-control-md flex items-center justify-between gap-2">
            <h3 className="flex min-w-0 flex-1">
              <CollapsibleTrigger className="eyebrow-style hover:text-fg-secondary focus-visible:ring-ring duration-fast -mx-1 flex max-w-full cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 transition-colors outline-none focus-visible:ring-2">
                <span className="truncate">{title}</span>
                <CollapsibleChevron className="opacity-60" />
              </CollapsibleTrigger>
            </h3>
            {action}
          </div>
          <CollapsibleContent className="-mx-1 flex min-w-0 flex-col gap-[inherit] px-1">
            {children}
          </CollapsibleContent>
        </section>
      </Collapsible>
    );
  }
  return (
    <section className={classes}>
      <div className="min-h-control-md flex items-center justify-between gap-2">
        <h3 className="eyebrow-style font-normal">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Large visual, name and tags at the top of a detail sheet. */
export function DetailHero({
  visual,
  title,
  children,
  className,
}: {
  visual: ReactNode;
  title: ReactNode;
  /** Tags or a one-line summary under the title. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shadow-divider flex items-start gap-3 px-6 py-5",
        className,
      )}
    >
      <div className="shrink-0">{visual}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
        <h2
          title={typeof title === "string" ? title : undefined}
          className="truncate"
        >
          {title}
        </h2>
        {children && (
          <div className="flex min-w-0 flex-wrap items-center gap-0.75">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/** Bordered tile with an icon, a caption and a value, used in a grid of 2–4. */
export function StatTile({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-overlay-1 shadow-hairline flex min-w-0 flex-col gap-3 rounded-xl p-3",
        className,
      )}
    >
      <span className="caption-style text-fg-secondary flex min-w-0 items-center gap-1">
        {Icon && <Icon aria-hidden className="size-3 shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span className="lead-style block truncate tabular-nums">{value}</span>
    </div>
  );
}

/** Headline figure with a caption, optionally followed by a sparkline of raw counts. */
export function BigNumber({
  value,
  caption,
  trend,
  size = "display",
}: {
  value: ReactNode;
  caption?: ReactNode;
  /** Values per bucket, oldest first; scaled to the largest. */
  trend?: number[];
  /** `display` for a lone headline, `md` next to a sparkline or other figures. */
  size?: "display" | "md";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 tabular-nums">
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "block leading-none",
            "font-display font-medium",
            size === "display" ? "text-display" : "text-2xl",
          )}
        >
          {value}
        </span>
        {trend && trend.length > 0 && (
          <Sparkline values={trend} className="h-5.5" />
        )}
      </div>
      {caption && (
        <span className="caption-style text-fg-secondary block leading-snug">
          {caption}
        </span>
      )}
    </div>
  );
}

/** Labelled progress row: name and percentage above a full-width segment bar. */
export function MeterRow({
  label,
  percent,
  value,
  tone = "auto",
}: {
  label: ReactNode;
  percent: number;
  /** Shown on the right instead of the percentage, e.g. "3 of 6". */
  value?: ReactNode;
  tone?: "auto" | "danger" | "warning" | "success";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="caption-style flex items-center justify-between gap-2 tabular-nums">
        <span className="truncate">{label}</span>
        <span className="shrink-0">{value ?? `${Math.round(percent)}%`}</span>
      </div>
      <SegmentBar
        percent={percent}
        segments={48}
        tone={tone}
        className="border-overlay-1 h-3 w-full border px-px"
        segmentClassName="h-2"
        trackClassName="bg-overlay-3"
      />
    </div>
  );
}
