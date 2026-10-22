import type { TagTone } from "@/components/_ui/tag";
import { cn } from "@/lib/utils";

type DotTone = TagTone | "info" | "success" | "warning" | "danger";

const DOT_BG: Record<DotTone, string> = {
  blue: "bg-(--tag-blue-text)",
  purple: "bg-(--tag-purple-text)",
  green: "bg-(--tag-green-text)",
  moss: "bg-(--tag-moss-text)",
  red: "bg-(--tag-red-text)",
  orange: "bg-(--tag-orange-text)",
  amber: "bg-(--tag-amber-text)",
  teal: "bg-(--tag-teal-text)",
  yellow: "bg-(--tag-yellow-text)",
  neutral: "bg-fg-disabled",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export default function ToneDot({
  tone,
  className,
}: {
  tone: DotTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", DOT_BG[tone], className)}
    />
  );
}
