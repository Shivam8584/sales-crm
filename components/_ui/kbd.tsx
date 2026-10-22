import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export default function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-background text-fg-secondary shadow-tile inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 font-sans text-[11px] leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}
