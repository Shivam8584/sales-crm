import type { ReactNode } from "react";
import CountBadge from "@/components/_ui/count-badge";
import { RecordHeadSlot } from "@/components/shell/page";

type RecordLayoutProps = {
  header: ReactNode;
  /** Main column: timeline and related lists. */
  children: ReactNode;
  /** Properties column; stacks above the main column on narrow screens. */
  aside: ReactNode;
};

/** Two-column record page on the 12-column grid: activity in 8, properties in 4. */
export default function RecordLayout({
  header,
  children,
  aside,
}: RecordLayoutProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid w-full gap-x-8 gap-y-10 px-(--page-x) pt-1 pb-16 @4xl/page:grid-cols-12">
        <div className="rise min-w-0 [--i:1] empty:hidden @4xl/page:col-span-12">
          {header}
        </div>
        <aside className="rise flex min-w-0 flex-col gap-10 [--i:3] @4xl/page:order-2 @4xl/page:col-span-4">
          {aside}
        </aside>
        <div className="rise flex min-w-0 flex-col gap-10 [--i:2] @4xl/page:order-1 @4xl/page:col-span-8">
          {children}
        </div>
      </div>
    </div>
  );
}

/** The record's name, visual and summary; drawn in the page head in place of the plain title. */
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
    <RecordHeadSlot>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 lg:gap-x-5">
        <div className="shrink-0 [&>*]:size-14 lg:[&>*]:size-16">{visual}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-display lg:text-hero min-w-0 font-semibold">
            {title}
          </h1>
          {subtitle && (
            <div className="text-body text-fg-secondary mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              {subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 max-sm:basis-full">
            {actions}
          </div>
        )}
      </div>
    </RecordHeadSlot>
  );
}

export function RecordSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  /** Shown next to the title. */
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex h-7 items-center justify-between gap-2">
        <h2 className="title-style flex items-center gap-1.5">
          {title}
          {count !== undefined && (
            <CountBadge className="text-title font-medium">{count}</CountBadge>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
