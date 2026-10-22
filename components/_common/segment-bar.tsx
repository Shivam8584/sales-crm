import { cn } from "@/lib/utils";

type SegmentTone = "auto" | "danger" | "warning" | "success";

type SegmentBarProps = {
  percent: number;
  segments?: number;
  tone?: SegmentTone;
  className?: string;
  segmentClassName?: string;
  trackClassName?: string;
};

const TONE_CLASS: Record<SegmentTone, string> = {
  auto: "bg-foreground",
  success: "bg-foreground",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** A thin rounded progress bar on an ink-6% track. */
export default function SegmentBar({
  percent,
  tone = "auto",
  className,
  segmentClassName,
  trackClassName = "bg-track",
}: SegmentBarProps) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("flex h-3.5 items-center", className)}
    >
      <span
        className={cn(
          "block h-1.5 w-full overflow-hidden rounded-full",
          trackClassName,
        )}
      >
        <span
          className={cn(
            "ease-out-hd block h-full rounded-full transition-[width] duration-[420ms]",
            TONE_CLASS[tone],
            segmentClassName,
          )}
          style={{ width: `${value}%` }}
        />
      </span>
    </span>
  );
}
