import type { ComponentProps, ComponentType, ReactNode, SVGProps } from "react";
import type { VariantProps } from "class-variance-authority";
import Divider from "@/components/_ui/divider";
import IconBadge, { iconBadgeVariants } from "@/components/_ui/icon-badge";
import { cn } from "@/lib/utils";

/** Raised surface for a block of content: settings sections, dashboard panels. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "bg-card shadow-card flex min-w-0 flex-col overflow-hidden rounded-2xl",
        className,
      )}
      {...props}
    />
  );
}

type CardHeaderProps = {
  /** Links the heading to the card's `aria-labelledby`. */
  id?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  iconTone?: VariantProps<typeof iconBadgeVariants>["tone"];
  /** Custom visual in place of `icon`, e.g. a logo. */
  visual?: ReactNode;
  title: ReactNode;
  /** Beside the title: a count or a status tag. */
  meta?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "danger";
  size?: "md" | "sm";
  /** The engraved rule under the band; off when the body draws its own top edge. */
  divider?: boolean;
  as?: "h2" | "h3";
  className?: string;
};

/** Header band of a `Card`: icon badge, title with meta, a short note and an action. */
export function CardHeader({
  id,
  icon,
  iconTone,
  visual,
  title,
  meta,
  description,
  action,
  tone = "default",
  size = "md",
  divider = true,
  as: Heading = "h2",
  className,
}: CardHeaderProps) {
  return (
    <>
      <header
        data-slot="card-header"
        className={cn(
          "bg-overlay-1 flex min-w-0 items-center gap-3 px-4 sm:px-5",
          size === "md" ? "min-h-16 py-3.5" : "min-h-13 py-2.5",
          tone === "danger" &&
            "bg-[linear-gradient(90deg,var(--danger-wash),transparent_60%)]",
          className,
        )}
      >
        {visual ??
          (icon && (
            <IconBadge
              icon={icon}
              size={size === "md" ? "md" : "sm"}
              tone={iconTone ?? (tone === "danger" ? "danger" : "neutral")}
            />
          ))}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Heading id={id} className="min-w-0 text-sm leading-5 font-medium">
              {title}
            </Heading>
            {meta}
          </div>
          {description && (
            <p className="caption-style text-fg-tertiary max-w-prose leading-snug">
              {description}
            </p>
          )}
        </div>
        {action && (
          <div className="flex shrink-0 items-center gap-2">{action}</div>
        )}
      </header>
      {divider && <Divider />}
    </>
  );
}

/** Count beside a card title. */
export function CardCount({ children }: { children: ReactNode }) {
  return (
    <span className="caption-style text-fg-tertiary tabular-nums">
      {children}
    </span>
  );
}
