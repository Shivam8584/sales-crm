import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Properties({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  /** Small control on the right of the title, e.g. a refresh button. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {(title || action) && (
        <div className="flex h-6 items-center justify-between gap-2">
          {title && (
            <h2 className="caption-style text-fg-tertiary font-medium">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      <dl className="flex flex-col gap-px">{children}</dl>
    </section>
  );
}

/** One label/value line; the value is usually an inline editor. */
export function Property({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3">
      <dt
        title={label}
        className="caption-style text-fg-tertiary truncate leading-8"
      >
        {label}
      </dt>
      <dd className="flex min-h-8 min-w-0 items-center gap-1">
        <span className="flex min-w-0 flex-1 items-center">{children}</span>
        {action}
      </dd>
    </div>
  );
}
