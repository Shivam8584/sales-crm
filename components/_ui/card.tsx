import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Raised surface for a block of content: settings sections, dashboard panels. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "border-border flex min-w-0 flex-col overflow-hidden rounded-xl border",
        className,
      )}
      {...props}
    />
  );
}

type CardHeaderProps = {
  /** Links the heading to the card's `aria-labelledby`. */
  id?: string;
  /** A logo or icon shown before the title. */
  visual?: ReactNode;
  title: ReactNode;
  /** Beside the title: a count or a status tag. */
  meta?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
};

/** Top of a `Card`: title with meta, a short note and an action. */
export function CardHeader({
  id,
  visual,
  title,
  meta,
  description,
  action,
  tone = "default",
  className,
}: CardHeaderProps) {
  return (
    <header
      data-slot="card-header"
      className={cn(
        "flex min-w-0 items-center gap-3 px-4 py-3.5 sm:px-6",
        className,
      )}
    >
      {visual}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h2
            id={id}
            className={cn(
              "min-w-0 text-sm leading-5 font-medium",
              tone === "danger" && "text-danger",
            )}
          >
            {title}
          </h2>
          {meta}
        </div>
        {description && (
          <p className="caption-style text-fg-tertiary max-w-prose leading-snug">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </header>
  );
}
