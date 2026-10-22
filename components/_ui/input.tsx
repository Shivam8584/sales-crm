import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Input({
  className,
  type = "text",
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "bg-well text-foreground duration-base placeholder:text-fg-tertiary focus-visible:bg-background shadow-field focus-visible:ring-ring hover:bg-well-hover text-body flex h-10 w-full min-w-0 rounded-xl px-3.5 leading-none transition-[background-color] ease-out outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:text-base",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
