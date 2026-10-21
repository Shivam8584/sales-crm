"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import { useBoardPrefs } from "@/components/board/board-prefs";
import { HiddenColumnsToggle } from "@/components/board/hidden-columns";
import SearchInput from "@/components/data-table/search-input";
import type { SortState } from "@/components/data-table/types";
import {
  CreateButton,
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
} from "@/components/shell/page";
import SavedViewsMenu from "@/features/views/saved-views-menu";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlState } from "@/hooks/use-url-state";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { PRIORITIES, type Priority } from "@/lib/domain/enums";
import { PRIORITY_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import ListIcon from "@/public/assets/icons/list.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import Segmented from "./segmented";
import TaskBulkBar from "./task-bulk-bar";
import TasksBoard, { TasksBoardSkeleton } from "./tasks-board";
import TasksList, { LIST_COLUMNS } from "./tasks-list";
import { dayFromToday, isOverdue } from "./task-meta";

const ANY = "any";
const DEFAULT_SORT: SortState = { id: "due", dir: "asc" };

export default function TasksPage() {
  const viewer = useViewer();
  const members = useMembers();
  const setCreate = useUiStore((state) => state.setCreate);
  const setEdit = useUiStore((state) => state.setEdit);
  const router = useRouter();
  const pathname = usePathname();

  const [view, setView] = useUrlState("view", "board");
  const [scope, setScope] = useUrlState("scope", "mine");
  const [assignee, setAssignee] = useUrlState("assignee", ANY);
  const [priority, setPriority] = useUrlState("priority", ANY);
  const [overdue, setOverdue] = useUrlState("overdue", "");
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [taskParam, setTaskParam] = useUrlState("task", "");
  const [group, setGroup] = useUrlState("group", "due");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const boardPrefs = useBoardPrefs("tasks");

  useEffect(() => {
    if (!taskParam) return;
    setEdit({ type: "task", id: taskParam });
    setTaskParam("");
  }, [taskParam, setEdit, setTaskParam]);

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: LIST_COLUMNS.some((column) => column.id === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "desc" ? "desc" : "asc",
  };

  const mine = scope !== "all";
  const assigneeFilter = mine ? viewer._id : assignee === ANY ? null : assignee;
  const query = useDebouncedValue(search);
  const rows = useQuery(api.tasks.list, {
    assigneeId: (assigneeFilter as Id<"members"> | null) ?? undefined,
    priority: PRIORITIES.find((value) => value === priority) as
      | Priority
      | undefined,
    overdueBefore: overdue ? dayFromToday() : undefined,
    search: query.trim() || undefined,
  });
  const overdueCount = rows?.filter(isOverdue).length ?? 0;

  const filtered =
    priority !== ANY ||
    Boolean(overdue) ||
    search.trim() !== "" ||
    (!mine && assignee !== ANY);

  // One navigation: separate useUrlState setters each start from the stale URL.
  function clearFilters() {
    setSearch("");
    const query = new URLSearchParams(window.location.search);
    for (const key of ["priority", "overdue", "assignee"]) query.delete(key);
    const next = query.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  const newTask = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => setCreate({ type: "task" })}
    >
      <PlusIcon aria-hidden className="size-3" />
      New task
    </Button>
  );

  const empty = filtered ? (
    <EmptyState
      icon={FilterIcon}
      title="No tasks match these filters"
      description="Clear the search or remove a filter to see more."
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : mine ? (
    <EmptyState
      icon={CheckSquareIcon}
      title="Nothing assigned to you"
      description="Tasks assigned to you show up here. Your teammates have some."
      action={
        <Button variant="secondary" size="sm" onClick={() => setScope("all")}>
          Show all tasks
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={CheckSquareIcon}
      title="No tasks yet"
      description="Track follow-ups like calls, demos and document chases. Link them to an account so the whole team sees them."
      action={newTask}
    />
  );

  const boardOverlay =
    rows && rows.length === 0 && (filtered || mine) ? (
      <div className="z-sticky-header pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-20">
        <div className="bg-popover border-line-strong shadow-overlay pointer-events-auto w-full max-w-sm rounded-xl border">
          {empty}
        </div>
      </div>
    ) : undefined;

  return (
    <Page>
      <PageHeader
        title="Tasks"
        meta={
          rows && (
            <PageStatus>
              <span className="tabular-nums">
                {rows.filter((task) => task.status !== "done").length} open
              </span>
            </PageStatus>
          )
        }
      />
      <PageToolbar
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search tasks"
            className="sm:w-56"
          />
        }
        actions={
          <>
            <SavedViewsMenu />
            <CreateButton onClick={() => setCreate({ type: "task" })}>
              New task
            </CreateButton>
          </>
        }
      >
        <Segmented
          label="Whose tasks"
          value={mine ? "mine" : "all"}
          onChange={setScope}
          options={[
            { value: "mine", label: "My tasks" },
            { value: "all", label: "All tasks" },
          ]}
        />
        {!mine && (
          <FilterMenu
            label="Assignee"
            value={assignee}
            onChange={setAssignee}
            options={[
              { value: ANY, label: "Anyone" },
              ...(members ?? []).map((member) => ({
                value: member._id,
                label: member._id === viewer._id ? "Me" : member.name,
              })),
            ]}
          />
        )}
        <FilterMenu
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={[
            { value: ANY, label: "Any" },
            ...PRIORITIES.map((value) => ({
              value,
              label: PRIORITY_LABEL[value],
            })),
          ]}
        />
        <Button
          variant="secondary"
          size="control"
          aria-pressed={Boolean(overdue)}
          onClick={() => setOverdue(overdue ? "" : "1")}
          className={cn(
            "px-2.5",
            overdue && "text-danger bg-danger/10 hover:bg-danger/15",
          )}
        >
          <AlertIcon aria-hidden className="size-3.5" />
          Overdue
          {overdueCount > 0 && (
            <span className="tabular-nums opacity-70">{overdueCount}</span>
          )}
        </Button>
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
        {view === "list" && (
          <FilterMenu
            label="Group"
            value={group === "none" ? "none" : "due"}
            onChange={setGroup}
            align="end"
            className="ml-auto max-sm:hidden"
            options={[
              { value: "due", label: "Due date" },
              { value: "none", label: "None" },
            ]}
          />
        )}
        <Segmented
          label="View"
          value={view === "list" ? "list" : "board"}
          onChange={setView}
          compact
          options={[
            {
              value: "board",
              label: "Board",
              icon: <ClipboardIcon aria-hidden className="size-3.5" />,
            },
            {
              value: "list",
              label: "List",
              icon: <ListIcon aria-hidden className="size-3.5" />,
            },
          ]}
          className={view === "list" ? "max-sm:ml-auto" : "ml-auto"}
        />
        {view !== "list" && <HiddenColumnsToggle prefs={boardPrefs} />}
      </PageToolbar>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {view === "list" ? (
          <>
            <TasksList
              rows={rows}
              grouped={group !== "none"}
              sort={sort}
              onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
              selected={selected}
              onSelectedChange={setSelected}
              empty={empty}
            />
            {rows && (
              <TaskBulkBar
                tasks={rows}
                selected={selected}
                onClear={() => setSelected(new Set())}
              />
            )}
          </>
        ) : rows ? (
          <TasksBoard
            tasks={rows}
            prefs={boardPrefs}
            assigneeId={(assigneeFilter as Id<"members"> | null) ?? undefined}
            overlay={boardOverlay}
          />
        ) : (
          <TasksBoardSkeleton />
        )}
      </div>
    </Page>
  );
}
