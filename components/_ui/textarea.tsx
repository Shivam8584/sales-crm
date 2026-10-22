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
        "bg-well text-foreground duration-base placeholder:text-fg-tertiary hover:bg-well-hover focus-visible:bg-background focus-visible:ring-foreground/15 aria-invalid:ring-danger/40 text-body field-sizing-content max-h-40 min-h-18 w-full resize-none rounded-xl px-3.5 py-2.5 leading-snug transition-[background-color,box-shadow] ease-out outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 pointer-coarse:text-base",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
