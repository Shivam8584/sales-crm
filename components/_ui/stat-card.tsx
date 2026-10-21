import Link from "next/link";
import type { ComponentProps, ComponentType, ReactNode, SVGProps } from "react";
import IconBadge, { iconBadgeVariants } from "@/components/_ui/icon-badge";
import Skeleton from "@/components/_ui/skeleton";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

const CHANGE = {
  positive: "bg-success-surface text-success-foreground",
  negative: "bg-danger-surface text-danger-foreground",
  neutral: "bg-overlay-2 text-fg-secondary",
};

type StatCardProps = {
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  iconTone?: VariantProps<typeof iconBadgeVariants>["tone"];
  /** `undefined` renders a skeleton while the figure loads. */
  value: ReactNode | undefined;
  /** Smaller suffix after the value, e.g. "%" or "days". */
  unit?: ReactNode;
  /** Muted note after the value, e.g. "of 12 this week". */
  context?: ReactNode;
  change?: { label: ReactNode; tone: keyof typeof CHANGE };
  /** Extra content under the figure, e.g. a sparkline. */
  children?: ReactNode;
  href?: ComponentProps<typeof Link>["href"];
  onClick?: () => void;
  /** Toggle state when the card filters something, e.g. a focus mode. */
  pressed?: boolean;
  valueClassName?: string;
  size?: "md" | "sm";
  className?: string;
};

/** Headline metric: icon badge and label, then a large figure with context and change. */
export default function StatCard({
  label,
  icon,
  iconTone,
  value,
  unit,
  context,
  change,
  children,
  href,
  onClick,
  pressed,
  valueClassName,
  size = "md",
  className,
}: StatCardProps) {
  const interactive = Boolean(href || onClick);
  const classes = cn(
    "group/stat bg-card shadow-card relative isolate flex min-w-0 flex-col overflow-hidden rounded-2xl text-left outline-none",
    size === "md"
      ? "gap-4 p-4 sm:gap-5 sm:p-5"
      : "gap-3 p-3 max-sm:flex-row max-sm:items-center max-sm:justify-between sm:p-3.5",
    interactive &&
      "focus-visible:ring-ring duration-base ease-power3-out aria-pressed:bg-raised aria-pressed:ring-selected cursor-pointer transition-[translate,box-shadow,background-color] hover:-translate-y-px focus-visible:ring-2 active:translate-y-0 aria-pressed:ring-1 motion-reduce:hover:translate-y-0",
    className,
  );
  const body = (
    <>
      {interactive && (
        <span
          aria-hidden
          className="duration-slow ease-power3-out pointer-events-none absolute inset-x-0 -top-24 -z-10 h-40 bg-[radial-gradient(closest-side,var(--overlay-3),transparent)] opacity-0 transition-opacity group-hover/stat:opacity-100 group-focus-visible/stat:opacity-100"
        />
      )}
      <span className="flex min-w-0 items-center gap-3">
        {icon && (
          <IconBadge
            icon={icon}
            tone={iconTone}
            size={size === "md" ? "lg" : "md"}
          />
        )}
        <span
          title={label}
          className={cn(
            "text-fg-secondary group-hover/stat:text-foreground duration-base min-w-0 truncate transition-colors",
            size === "md" ? "text-sm font-medium" : "text-xs font-medium",
          )}
        >
          {label}
        </span>
      </span>
      <span className="flex min-w-0 shrink-0 flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-baseline gap-2">
          {value === undefined ? (
            <Skeleton
              className={cn(size === "md" ? "my-2 h-7 w-16" : "my-1 h-5 w-10")}
            />
          ) : (
            <span
              className={cn(
                "font-display whitespace-nowrap tabular-nums",
                valueClassName,
                size === "md"
                  ? "text-[2.25rem] leading-10 tracking-[-0.02em]"
                  : "text-xl leading-7 sm:text-2xl",
              )}
            >
              {value}
              {unit && (
                <span className="text-fg-tertiary ml-0.5 text-[0.6em] leading-none">
                  {unit}
                </span>
              )}
            </span>
          )}
          {context && (
            <span className="caption-style text-fg-tertiary min-w-0 truncate pb-1.5 leading-snug">
              {context}
            </span>
          )}
        </span>
        {change && (
          <span
            className={cn(
              "mb-1.5 inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs leading-none font-semibold tabular-nums",
              CHANGE[change.tone],
            )}
          >
            {change.label}
          </span>
        )}
      </span>
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        className={classes}
      >
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
