"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import Avatar from "@/components/_ui/avatar";
import { PRIORITIES, TASK_STATUSES } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import GroupedTable, { type RowGroup } from "./grouped-table";
import { AutoTag, DoneToggle, RecordChip } from "./task-card";
import { AssigneeChip, DueChip, PriorityChip, StatusChip } from "./task-chips";
import {
  DUE_GROUPS,
  DUE_GROUP_LABEL,
  PriorityIcon,
  StatusIcon,
  byUrgency,
  dueGroup,
  formatDay,
  isOverdue,
  recordName,
  type DueGroup,
  type TaskRow,
} from "./task-meta";
import { routes } from "@/lib/routes";

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
        {row.automated && <AutoTag className="shrink-0" />}
      </>
    ),
  },
  {
    id: "record",
    header: "Record",
    width: "minmax(10rem,1.5fr)",
    minViewport: 900,
    sortValue: recordName,
    cell: (row) =>
      recordName(row) ? (
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
  const record = recordName(row);
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

const GROUPED_COLUMNS: Column<TaskRow>[] = LIST_COLUMNS.filter(
  (column) => column.id !== "status",
).map((column) =>
  column.id === "title"
    ? {
        ...column,
        cell: (row: TaskRow) => (
          <>
            <span
              className={cn(
                "truncate",
                row.status === "done" && "text-fg-secondary line-through",
              )}
            >
              {row.title}
            </span>
            {row.automated && <AutoTag className="shrink-0" />}
          </>
        ),
      }
    : column,
);

type TasksListProps = {
  rows: TaskRow[] | undefined;
  grouped: boolean;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  empty: ReactNode;
};

/** Grouped by due date, or one sortable table. Rows link to `?task=<id>`, which opens the task dialog. */
export default function TasksList({
  rows,
  grouped,
  sort,
  onSortChange,
  selected,
  onSelectedChange,
  empty,
}: TasksListProps) {
  const params = useSearchParams();
  const setEdit = useUiStore((state) => state.setEdit);
  const href = (row: TaskRow) => {
    const query = new URLSearchParams(params.toString());
    query.set("task", row._id);
    return `${routes.tasks}?${query.toString()}`;
  };

  const groups = useMemo((): RowGroup<TaskRow>[] | undefined => {
    if (!rows) return undefined;
    const buckets = new Map<DueGroup, TaskRow[]>(
      DUE_GROUPS.map((group) => [group, []]),
    );
    for (const row of rows) buckets.get(dueGroup(row))!.push(row);
    return DUE_GROUPS.map((group) => ({
      id: group,
      label: DUE_GROUP_LABEL[group],
      rows: buckets
        .get(group)!
        .sort(
          group === "done"
            ? (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)
            : byUrgency,
        ),
      tone: group === "overdue" ? "danger" : undefined,
      defaultCollapsed: group === "done",
    }));
  }, [rows]);

  if (grouped) {
    return (
      <GroupedTable
        label="Tasks"
        columns={GROUPED_COLUMNS}
        groups={groups}
        getId={(row) => row._id}
        getLabel={(row) => row.title}
        onOpen={(row) => setEdit({ type: "task", id: row._id })}
        renderCard={(row) => <MobileCard row={row} />}
        leading={(row) => <DoneToggle task={row} />}
        selected={selected}
        onSelectedChange={onSelectedChange}
        empty={empty}
      />
    );
  }

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
      selected={selected}
      onSelectedChange={onSelectedChange}
      empty={empty}
    />
  );
}
