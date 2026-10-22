import type { ComponentType, ReactNode, SVGProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const iconBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center",
  {
    variants: {
      size: {
        sm: "[&>svg]:size-3.5",
        md: "[&>svg]:size-4",
        lg: "[&>svg]:size-4",
      },
      tone: {
        neutral: "text-icon",
        brand: "text-primary",
        info: "text-info",
        success: "text-success",
        warning: "text-warning",
        danger: "text-danger",
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

/** A bare tinted icon: the visual for section headers and integrations. */
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
