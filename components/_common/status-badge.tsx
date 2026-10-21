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

/** Small filled square with a glyph, used for board columns and card status (from the kanban design). */
export default function StatusBadge({
  icon: Icon,
  tone,
  className,
}: StatusBadgeProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-[4px] text-white shadow-[0_1px_2px_0_rgb(9_9_11/0.08)]",
        TONES[tone],
        className,
      )}
    >
      <Icon className="size-2" />
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_1px_20px_0_rgb(255_255_255/0.16)]" />
    </span>
  );
}
