import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export default function CountBadge({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "text-fg-disabled inline-flex h-4 min-w-4 shrink-0 items-center justify-center text-center text-[13px] leading-none tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
