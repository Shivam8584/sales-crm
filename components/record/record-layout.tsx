import type { ReactNode } from "react";

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
      <div className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-8">
        <div className="lg:col-span-2">{header}</div>
        <aside className="flex flex-col gap-6 lg:order-2">{aside}</aside>
        <div className="flex min-w-0 flex-col gap-8 lg:order-1">{children}</div>
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
    <div className="flex items-start gap-4">
      {visual}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <div className="text-xl leading-tight font-semibold tracking-[-0.01em]">
          {title}
        </div>
        {subtitle && (
          <div className="text-fg-secondary flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function RecordSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-between gap-2">
        <h2 className="lead-style font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
