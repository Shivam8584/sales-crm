import { cn } from "@/lib/utils";

type SparklineProps = {
  values: number[];
  className?: string;
};

const HEIGHT_CLASS: Record<number, string> = {
  1: "h-px",
  2: "h-0.5",
  3: "h-0.75",
  4: "h-1",
  5: "h-1.25",
  6: "h-1.5",
  7: "h-1.75",
  8: "h-2",
  9: "h-2.25",
  10: "h-2.5",
  11: "h-2.75",
  12: "h-3",
  13: "h-3.25",
  14: "h-3.5",
};

/** Activity bars scaled to the busiest bucket; empty buckets show as a muted stub. */
export default function Sparkline({ values, className }: SparklineProps) {
  const max = Math.max(1, ...values);
  return (
    <span aria-hidden className={cn("flex h-3.5 items-end gap-px", className)}>
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            "w-1 shrink-0 rounded-xs",
            HEIGHT_CLASS[
              value > 0 ? Math.max(2, Math.round((value / max) * 14)) : 1
            ],
            value > 0 ? "bg-trend" : "bg-trend-muted",
          )}
        />
      ))}
    </span>
  );
}
