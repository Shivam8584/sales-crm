"use client";

import type { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/_ui/collapsible";
import { cn } from "@/lib/utils";

/** A titled block of label/value lines; a titled block folds away from its title. */
export function Properties({
  title,
  action,
  children,
  className,
  defaultOpen = true,
}: {
  title?: string;
  /** Small control on the right of the title, e.g. a refresh button. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  const list = <dl className="flex flex-col gap-px">{children}</dl>;
  if (!title) {
    return (
      <section className={cn("flex min-w-0 flex-col gap-2", className)}>
        {action && (
          <div className="flex h-6 items-center justify-end gap-2">
            {action}
          </div>
        )}
        {list}
      </section>
    );
  }
  return (
    <Collapsible
      asChild
      defaultOpen={defaultOpen}
      className={cn("group/collapsible flex min-w-0 flex-col", className)}
    >
      <section>
        <div className="flex h-6 items-center justify-between gap-2">
          <h2 className="flex min-w-0 flex-1">
            <CollapsibleTrigger className="eyebrow-style hover:text-fg-secondary focus-visible:ring-ring duration-fast -mx-1 flex max-w-full cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 transition-colors outline-none focus-visible:ring-2">
              <span className="truncate">{title}</span>
              <CollapsibleChevron className="opacity-60" />
            </CollapsibleTrigger>
          </h2>
          {action}
        </div>
        <CollapsibleContent>
          <div className="pt-2">{list}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
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
