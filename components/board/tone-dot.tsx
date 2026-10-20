import type { TagTone } from "@/data/companies";
import { cn } from "@/lib/utils";

const DOT_BG: Record<TagTone, string> = {
  blue: "bg-(--tag-blue-text)",
  purple: "bg-(--tag-purple-text)",
  green: "bg-(--tag-green-text)",
  moss: "bg-(--tag-moss-text)",
  red: "bg-(--tag-red-text)",
  orange: "bg-(--tag-orange-text)",
  amber: "bg-(--tag-amber-text)",
  teal: "bg-(--tag-teal-text)",
  yellow: "bg-(--tag-yellow-text)",
  neutral: "bg-(--tag-neutral-text)",
};

export default function ToneDot({
  tone,
  className,
}: {
  tone: TagTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", DOT_BG[tone], className)}
    />
  );
}
