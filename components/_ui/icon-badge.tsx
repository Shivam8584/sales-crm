import type { ComponentType, ReactNode, SVGProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const iconBadgeVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center bg-linear-to-b shadow-badge",
  {
    variants: {
      size: {
        sm: "size-7 rounded-lg [&>svg]:size-3.5",
        md: "size-8 rounded-[10px] [&>svg]:size-4",
        lg: "size-10 rounded-xl [&>svg]:size-4.5",
      },
      tone: {
        neutral: "from-raised to-card text-icon",
        brand: "from-primary-hover to-primary text-primary-foreground",
        info: "from-info-surface to-info-surface text-info",
        success: "from-success-surface to-success-surface text-success",
        warning: "from-warning-surface to-warning-surface text-warning",
        danger: "from-danger-surface to-danger-surface text-danger",
      },
    },
    defaultVariants: { size: "lg", tone: "neutral" },
  },
);

type IconBadgeProps = VariantProps<typeof iconBadgeVariants> & {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  children?: ReactNode;
  className?: string;
};

/** Raised square tile holding an icon: the visual for section headers, stat cards and integrations. */
export default function IconBadge({
  icon: Icon,
  children,
  size,
  tone,
  className,
}: IconBadgeProps) {
  return (
    <span
      aria-hidden
      data-slot="icon-badge"
      className={cn(iconBadgeVariants({ size, tone }), className)}
    >
      {Icon ? <Icon /> : children}
    </span>
  );
}
