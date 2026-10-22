"use client";

import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import CountBadge from "@/components/_ui/count-badge";
import Tooltip from "@/components/_ui/tooltip";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Data = FunctionReturnType<typeof api.account360.platform>;
export type Linked = Extract<Data, { linked: true }>;
export type Campaign = Linked["campaigns"][number];

export function Section({
  title,
  count,
  meta,
  action,
  children,
}: {
  title: string;
  count?: number;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-4">
      <div className="min-h-control-md flex items-center justify-between gap-3">
        <h3 className="text-fg-secondary flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">{title}</span>
          {count !== undefined && count > 0 && <CountBadge>{count}</CountBadge>}
        </h3>
        {meta && (
          <span className="caption-style text-fg-tertiary min-w-0 truncate">
            {meta}
          </span>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-fg-tertiary text-sm leading-snug">{children}</p>;
}

export function When({ at, className }: { at: number; className?: string }) {
  return (
    <Tooltip content={dateTime(at)}>
      <time
        tabIndex={0}
        dateTime={new Date(at).toISOString()}
        className={cn("rounded-sm tabular-nums", className)}
      >
        {relativeTime(at)}
      </time>
    </Tooltip>
  );
}
