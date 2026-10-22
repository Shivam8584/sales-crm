"use client";

import Link from "next/link";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import { api } from "@/convex/_generated/api";
import { usePagedList } from "@/hooks/use-paged-list";
import { cn } from "@/lib/utils";
import { dateTime } from "@/lib/time";

type Entry = FunctionReturnType<typeof api.audit.list>["page"][number];
type Filters = Omit<FunctionArgs<typeof api.audit.list>, "paginationOpts">;

const TYPE_LABEL = {
  accounts: "Account",
  people: "Person",
  leads: "Lead",
  deals: "Deal",
  tasks: "Task",
} as const;

const COLUMNS = "md:grid-cols-[10rem_9rem_13rem_minmax(0,1fr)]";

export function ChangesList({
  filters,
  filtered,
  onClear,
}: {
  filters: Filters;
  filtered: boolean;
  onClear: () => void;
}) {
  const { rows, paging } = usePagedList(api.audit.list, filters, 40);

  if (rows === undefined) return <ListSkeleton />;
  if (rows.length === 0 && paging.status === "Exhausted") {
    return (
      <EmptyState
        title={filtered ? "No changes match" : "No changes yet"}
        description={
          filtered
            ? undefined
            : "Edits to records show up here with what they were before."
        }
        action={
          filtered && (
            <Button variant="secondary" size="sm" onClick={onClear}>
              Clear filters
            </Button>
          )
        }
      />
    );
  }
  return (
    <div
      aria-busy={paging.stale}
      className={cn(
        "scrollbar-none min-h-0 flex-1 overflow-y-auto",
        paging.stale && "opacity-60",
      )}
    >
      <div
        className={cn(
          "caption-style text-fg-tertiary border-border grid gap-x-4 border-b px-4 py-2 max-md:hidden",
          COLUMNS,
        )}
      >
        <span>When</span>
        <span>Who</span>
        <span>Record</span>
        <span>Change</span>
      </div>
      <ul>
        {rows.map((entry) => (
          <ChangeRow key={entry._id} entry={entry} />
        ))}
      </ul>
      {(paging.status === "CanLoadMore" || paging.status === "LoadingMore") && (
        <div className="flex justify-center py-3">
          <Button
            variant="ghost"
            size="xs"
            disabled={paging.status === "LoadingMore"}
            onClick={paging.loadMore}
            className="text-fg-secondary"
          >
            {paging.status === "LoadingMore" ? "Loading more…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ChangeRow({ entry }: { entry: Entry }) {
  const { record } = entry;
  const type = entry.recordType ? TYPE_LABEL[entry.recordType] : null;
  return (
    <li
      className={cn(
        "border-border grid gap-x-4 gap-y-1 border-b px-4 py-3 text-sm",
        COLUMNS,
      )}
    >
      <time
        dateTime={new Date(entry.at).toISOString()}
        className="caption-style text-fg-tertiary tabular-nums"
      >
        {dateTime(entry.at)}
      </time>
      <span className="min-w-0 break-words">
        {entry.actor?.name ?? "System"}
      </span>
      <span className="min-w-0 break-words">
        {record?.href ? (
          <Link
            href={record.href}
            className="focus-visible:ring-ring rounded-sm outline-none hover:underline focus-visible:ring-2"
          >
            {record.name}
          </Link>
        ) : (
          (record?.name ?? "Deleted record")
        )}
        {(type || record?.archived) && (
          <span className="caption-style text-fg-tertiary block">
            {[type, record?.archived && "archived"].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      <ul className="flex min-w-0 flex-col gap-0.5">
        {entry.changes.map((change) => (
          <li key={change.field} className="break-words">
            <span className="text-fg-secondary">{change.field}</span>{" "}
            <span className="text-fg-tertiary">{change.from ?? "empty"}</span>{" "}
            <span aria-label="to" className="text-fg-tertiary">
              →
            </span>{" "}
            <span>{change.to ?? "cleared"}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function ListSkeleton() {
  return (
    <div aria-busy className="flex flex-col">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="border-border flex items-center gap-4 border-b px-4 py-3.5"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
