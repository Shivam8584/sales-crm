import type { ReactNode } from "react";
import CountBadge from "@/components/_ui/count-badge";

type RecordLayoutProps = {
  header: ReactNode;
  /** Main column: timeline and related lists. */
  children: ReactNode;
  /** Properties column; stacks above the main column on narrow screens. */
  aside: ReactNode;
};

/** Two-column record page: activity on the left, properties on the right. */
export default function RecordLayout({
  header,
  children,
  aside,
}: RecordLayoutProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-6xl gap-x-12 gap-y-8 px-4 pt-6 pb-16 sm:px-6 @4xl/page:grid-cols-[minmax(0,1fr)_19rem] lg:pt-8">
        <div className="min-w-0 @4xl/page:col-span-2">{header}</div>
        <aside className="flex min-w-0 flex-col gap-7 @4xl/page:order-2">
          {aside}
        </aside>
        <div className="flex min-w-0 flex-col gap-8 @4xl/page:order-1">{children}</div>
      </div>
    </div>
  );
}

export function RecordHeader({
  visual,
  title,
  subtitle,
  actions,
}: {
  visual: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="shrink-0">{visual}</div>
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2 pt-0.5">
        <div className="font-display min-w-0 text-2xl font-medium text-balance">
          {title}
        </div>
        {subtitle && (
          <div className="text-fg-secondary flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
          {actions}
        </div>
      )}
    </div>
  );
}

export function RecordSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  /** Shown as a badge next to the title. */
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex h-7 items-center justify-between gap-2">
        <h2 className="lead-style flex items-center gap-2 font-medium">
          {title}
          {count !== undefined && <CountBadge>{count}</CountBadge>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
