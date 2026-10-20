"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import Avatar from "@/components/_ui/avatar";
import { PRIORITIES, TASK_STATUSES } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import { RecordChip } from "./task-card";
import { AssigneeChip, DueChip, PriorityChip, StatusChip } from "./task-chips";
import {
  PriorityIcon,
  StatusIcon,
  formatDay,
  isOverdue,
  type TaskRow,
} from "./task-meta";

export const LIST_COLUMNS: Column<TaskRow>[] = [
  {
    id: "title",
    header: "Task",
    width: "minmax(16rem,3fr)",
    sortValue: (row) => row.title,
    cell: (row) => (
      <>
        <StatusIcon status={row.status} />
        <span
          className={cn(
            "truncate",
            row.status === "done" && "text-fg-secondary",
          )}
        >
          {row.title}
        </span>
      </>
    ),
  },
  {
    id: "record",
    header: "Record",
    width: "minmax(10rem,1.5fr)",
    minViewport: 900,
    sortValue: (row) => row.person?.name ?? row.account?.name ?? null,
    cell: (row) =>
      row.person || row.account ? (
        <RecordChip task={row} className="mx-0" />
      ) : (
        <span className="text-fg-tertiary">—</span>
      ),
  },
  {
    id: "priority",
    header: "Priority",
    width: "8rem",
    sortValue: (row) => PRIORITIES.indexOf(row.priority),
    cell: (row) => <PriorityChip task={row} />,
  },
  {
    id: "assignee",
    header: "Assignee",
    width: "9rem",
    minViewport: 1100,
    sortValue: (row) => row.assignee?.name ?? null,
    cell: (row) => <AssigneeChip task={row} />,
  },
  {
    id: "due",
    header: "Due",
    width: "8.5rem",
    sortValue: (row) => row.dueDate,
    cell: (row) => <DueChip task={row} />,
  },
  {
    id: "status",
    header: "Status",
    width: "9rem",
    sortValue: (row) => TASK_STATUSES.indexOf(row.status),
    cell: (row) => <StatusChip task={row} />,
  },
];

function MobileCard({ row }: { row: TaskRow }) {
  const overdue = isOverdue(row);
  const meta: ReactNode[] = [];
  const record = row.person?.name ?? row.account?.name;
  if (record) meta.push(record);
  if (row.dueDate) {
    meta.push(
      <span className={overdue ? "text-danger" : undefined}>
        {formatDay(row.dueDate)}
      </span>,
    );
  }
  return (
    <span className="flex items-start gap-3">
      <StatusIcon status={row.status} className="mt-0.5" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span
          className={cn(
            "lead-style line-clamp-2 leading-snug font-medium",
            row.status === "done" && "text-fg-secondary",
          )}
        >
          {row.title}
        </span>
        {meta.length > 0 && (
          <span className="caption-style text-fg-tertiary flex min-w-0 items-center gap-1.5">
            {meta.map((item, index) => (
              <span key={index} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && <span aria-hidden>·</span>}
                <span className="truncate">{item}</span>
              </span>
            ))}
          </span>
        )}
      </span>
      {row.priority !== "normal" && (
        <PriorityIcon priority={row.priority} className="mt-0.5" />
      )}
      {row.assignee && <Avatar name={row.assignee.name} />}
    </span>
  );
}

type TasksListProps = {
  rows: TaskRow[] | undefined;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  empty: ReactNode;
};

/** Rows link to `?task=<id>` on this page, which opens the task dialog. */
export default function TasksList({
  rows,
  sort,
  onSortChange,
  empty,
}: TasksListProps) {
  const params = useSearchParams();
  const href = (row: TaskRow) => {
    const query = new URLSearchParams(params.toString());
    query.set("task", row._id);
    return `/tasks?${query.toString()}`;
  };

  return (
    <DataTable
      label="Tasks"
      columns={LIST_COLUMNS}
      rows={rows}
      getId={(row) => row._id}
      getHref={href}
      getLabel={(row) => row.title}
      renderCard={(row) => <MobileCard row={row} />}
      sort={sort}
      onSortChange={onSortChange}
      empty={empty}
    />
  );
}
