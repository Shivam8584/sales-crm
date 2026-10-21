import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Multi-line input matching `Input`; grows with its content up to `max-h-*`. */
function Textarea({
  className,
  rows = 3,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        "border-input bg-secondary text-foreground duration-fast ease-power3-out placeholder:text-fg-tertiary hover:border-fg-tertiary focus-visible:border-selected focus-visible:ring-selected/20 aria-invalid:border-danger field-sizing-content max-h-40 min-h-18 w-full resize-none rounded-lg border px-3 py-2.5 text-sm leading-snug transition-[border-color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:text-base",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
