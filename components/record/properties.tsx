import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Properties({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-1", className)}>
      {title && (
        <h2 className="caption-style text-fg-tertiary mb-1.5 font-medium">
          {title}
        </h2>
      )}
      <dl className="flex flex-col">{children}</dl>
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
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3">
      <dt className="caption-style text-fg-tertiary truncate leading-8">
        {label}
      </dt>
      <dd className="flex min-h-8 min-w-0 items-center gap-1">
        <span className="flex min-w-0 flex-1 items-center">{children}</span>
        {action}
      </dd>
    </div>
  );
}
