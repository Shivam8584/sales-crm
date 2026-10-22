"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import SegmentedControl from "@/components/_ui/segmented-control";
import FilterMenu from "@/components/_common/filter-menu";
import BoardDisplay from "@/components/board/board-display";
import { useBoardPrefs } from "@/components/board/board-prefs";
import { HiddenColumnsToggle } from "@/components/board/hidden-columns";
import SearchInput from "@/components/data-table/search-input";
import type { SortState } from "@/components/data-table/types";
import {
  CreateButton,
  Page,
  PageActions,
  PageHeader,
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
import ListIcon from "@/public/assets/icons/list.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import PasteTasksDialog from "./paste-tasks-dialog";
import TaskBulkBar from "./task-bulk-bar";
import { TASK_CARD_FIELDS } from "./task-card";
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
  const [pasting, setPasting] = useState(false);
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
      New task
    </Button>
  );

  const empty = filtered ? (
    <EmptyState
      title="No tasks match"
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : mine ? (
    <EmptyState
      title="Nothing assigned to you"
      action={
        <Button variant="secondary" size="sm" onClick={() => setScope("all")}>
          Show all tasks
        </Button>
      }
    />
  ) : (
    <EmptyState title="No tasks yet" action={newTask} />
  );

  const boardOverlay =
    rows && rows.length === 0 && (filtered || mine) ? (
      <div className="z-sticky-header pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-20">
        <div className="bg-background pointer-events-auto w-full max-w-sm rounded-xl">
          {empty}
        </div>
      </div>
    ) : undefined;

  return (
    <Page wide>
      <PageHeader
        title="Tasks"
        meta={
          rows && (
            <span className="tabular-nums">
              {rows.filter((task) => task.status !== "done").length} open
            </span>
          )
        }
        actions={
          <PageActions
            label="Task list actions"
            actions={[
              { label: "Paste tasks…", onSelect: () => setPasting(true) },
            ]}
          />
        }
      />
      <PageToolbar
        activeFilters={
          Number(priority !== ANY) +
          Number(Boolean(overdue)) +
          Number(!mine && assignee !== ANY)
        }
        onClearFilters={clearFilters}
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
        <SegmentedControl
          label="Whose tasks"
          value={mine ? "mine" : "all"}
          onChange={setScope}
          segments={[
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
          Overdue
          {overdueCount > 0 && (
            <span className="tabular-nums opacity-70">{overdueCount}</span>
          )}
        </Button>
        {filtered && (
          <Button
            variant="ghost"
            size="xs"
            data-filter-clear
            onClick={clearFilters}
          >
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
        <SegmentedControl
          label="View"
          value={view === "list" ? "list" : "board"}
          onChange={setView}
          compact
          segments={[
            {
              value: "board",
              label: "Board",
              icon: <ClipboardIcon aria-hidden className="size-3" />,
            },
            {
              value: "list",
              label: "List",
              icon: <ListIcon aria-hidden className="size-3" />,
            },
          ]}
          className={view === "list" ? "max-sm:ml-auto" : "ml-auto"}
        />
        {view !== "list" && (
          <>
            <BoardDisplay prefs={boardPrefs} fields={TASK_CARD_FIELDS} />
            <HiddenColumnsToggle prefs={boardPrefs} />
          </>
        )}
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
      <PasteTasksDialog open={pasting} onOpenChange={setPasting} />
    </Page>
  );
}
