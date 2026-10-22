import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-fg-tertiary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

type StatusBadgeProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: BadgeTone;
  className?: string;
};

/** Small filled square with a glyph for board columns and card status. */
export default function StatusBadge({
  icon: Icon,
  tone,
  className,
}: StatusBadgeProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "text-primary-foreground inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm",
        TONES[tone],
        className,
      )}
    >
      <Icon className="size-2" />
    </span>
  );
}
