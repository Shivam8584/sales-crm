import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A well: the filled surface for a block of content, in place of a bordered box. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "bg-well flex min-w-0 flex-col overflow-hidden rounded-3xl",
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
        "flex min-w-0 items-center gap-3 px-5 pt-5 pb-3 sm:px-6",
        className,
      )}
    >
      {visual}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h2
            id={id}
            className={cn(
              "title-style min-w-0",
              tone === "danger" && "text-danger",
            )}
          >
            {title}
          </h2>
          {meta}
        </div>
        {description && (
          <p className="text-fg-secondary max-w-prose text-sm">
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
