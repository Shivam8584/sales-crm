import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export default function Skeleton({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn(
        "animate-shimmer block rounded-lg bg-[linear-gradient(90deg,var(--overlay-2)_25%,var(--overlay-4)_37%,var(--overlay-2)_63%)] [background-size:400%_100%] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
