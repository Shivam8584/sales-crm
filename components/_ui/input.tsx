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
        "bg-well text-foreground duration-base ease-out placeholder:text-fg-tertiary focus-visible:bg-background focus-visible:ring-foreground/15 hover:bg-well-hover flex h-10 w-full min-w-0 rounded-xl px-3.5 text-body leading-none transition-[background-color,box-shadow] outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:text-base",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
