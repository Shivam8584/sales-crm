import { cn } from "@/lib/utils";

/** A hairline rule. Decorative; use `<hr>` when it separates content. */
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
          ? "bg-border h-px w-full"
          : "bg-border w-px self-stretch",
        className,
      )}
    />
  );
}
