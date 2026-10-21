import { cn } from "@/lib/utils";

/**
 * An engraved rule: a dark line with a faint highlight below it, so it reads
 * as a cut on raised surfaces. Decorative; use `<hr>` when it separates content.
 */
export default function Divider({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-slot="divider"
      className={cn(
        "block shrink-0",
        orientation === "horizontal"
          ? "h-0.5 w-full bg-[linear-gradient(to_bottom,var(--divider-shade)_0_1px,var(--divider-light)_1px_2px)]"
          : "w-0.5 self-stretch bg-[linear-gradient(to_right,var(--divider-shade)_0_1px,var(--divider-light)_1px_2px)]",
        className,
      )}
    />
  );
}
