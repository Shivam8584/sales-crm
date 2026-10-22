"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import SegmentedControl from "@/components/_ui/segmented-control";
import Skeleton from "@/components/_ui/skeleton";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import SearchInput from "@/components/data-table/search-input";
import type { Column, SortState } from "@/components/data-table/types";
import {
  CreateButton,
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { useUrlState } from "@/hooks/use-url-state";
import { useViewer } from "@/hooks/use-viewer";
import { SUBJECT_KINDS, SUBJECT_LABEL } from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { isEditableTarget } from "@/lib/keyboard";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import { StatusTag, StoppedStatus } from "./automation-parts";
import NewAutomationDialog from "./new-automation-dialog";
import TemplatesGallery from "./templates-gallery";
import { routes } from "@/lib/routes";

type Row = FunctionReturnType<typeof api.automations.list>[number];

const VIEWS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Drafts" },
  { id: "paused", label: "Paused" },
  { id: "templates", label: "Templates" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const ALL = "all";
const DEFAULT_SORT: SortState = { id: "updated", dir: "desc" };
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const COLUMNS: Column<Row>[] = [
  {
    id: "name",
    header: "Sequence",
    width: "minmax(14rem,2fr)",
    sortValue: (row) => row.name,
    cell: (row) => (
      <>
        <span className="bg-well text-fg-secondary grid size-8 shrink-0 place-items-center rounded-lg">
          <AutomationIcon aria-hidden className="size-3.5" />
        </span>
        <span className="truncate" title={row.name}>
          {row.name}
        </span>
      </>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "7.5rem",
    sortValue: (row) => row.status,
    cell: (row) => <StatusTag status={row.status} />,
  },
  {
    id: "trigger",
    header: "Trigger",
    width: "minmax(12rem,1.6fr)",
    minViewport: 1000,
    sortValue: (row) => row.trigger,
    cell: (row) => (
      <span className="text-fg-secondary truncate" title={row.trigger}>
        {row.trigger}
      </span>
    ),
  },
  {
    id: "enrolled",
    header: "Enrolled",
    width: "5.5rem",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => row.stats.enrolled,
    cell: (row) => <span className="tabular-nums">{row.stats.enrolled}</span>,
  },
  {
    id: "active",
    header: "Active",
    width: "5rem",
    align: "end",
    defaultDir: "desc",
    minViewport: 700,
    sortValue: (row) => row.stats.active,
    cell: (row) => <span className="tabular-nums">{row.stats.active}</span>,
  },
  {
    id: "completed",
    header: "Completed",
    width: "6.75rem",
    align: "end",
    defaultDir: "desc",
    minViewport: 800,
    sortValue: (row) => row.stats.completed,
    cell: (row) => <span className="tabular-nums">{row.stats.completed}</span>,
  },
  {
    id: "updated",
    header: "Edited",
    width: "8.5rem",
    align: "end",
    defaultDir: "desc",
    minViewport: 900,
    sortValue: (row) => row.updatedAt,
    cell: (row) => (
      <time
        title={dateTime(row.updatedAt)}
        className="text-fg-secondary truncate tabular-nums"
      >
        {relativeTime(row.updatedAt)}
      </time>
    ),
  },
];

const SORT_OPTIONS = [
  { value: "updated", label: "Last edited" },
  { value: "name", label: "Name" },
  { value: "enrolled", label: "Enrolled" },
  { value: "active", label: "Active runs" },
];

function matches(row: Row, query: string) {
  const text = `${row.name} ${row.description} ${row.trigger}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

export default function AutomationsPage() {
  const router = useRouter();
  const viewer = useViewer();
  const canEdit = viewer.role !== "rep";
  const automations = useQuery(api.automations.list, {});
  const catalog = useQuery(api.automations.catalog, {});
  const pause = useMutation(api.automations.pause);
  const activate = useMutation(api.automations.activate);
  const duplicate = useMutation(api.automations.duplicate);
  const remove = useMutation(api.automations.remove);
  const restore = useMutation(api.automations.restore);
  const { belowSm } = useMobileBreakpoints();

  const [viewParam, setView] = useUrlState("view", "all");
  const [search, setSearch] = useUrlState("q", "");
  const [subject, setSubject] = useUrlState("records", ALL);
  const [layout, setLayout] = useUrlState("layout", "table");
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [creating, setCreating] = useState(false);

  const view: View = VIEWS.some((item) => item.id === viewParam)
    ? (viewParam as View)
    : "all";
  const grid = layout === "grid" || belowSm;

  useEffect(() => {
    if (!canEdit) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (
        isEditableTarget(event.target) ||
        document.querySelector("[role=dialog]")
      )
        return;
      event.preventDefault();
      setCreating(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit]);

  const sort: SortState = useMemo(() => {
    const [sortId, sortDir] = sortParam.split(":");
    return {
      id: COLUMNS.some((column) => column.id === sortId && column.sortValue)
        ? sortId
        : DEFAULT_SORT.id,
      dir: sortDir === "asc" ? "asc" : "desc",
    };
  }, [sortParam]);

  const counts = useMemo(() => {
    if (!automations) return undefined;
    return {
      all: automations.length,
      active: automations.filter((row) => row.status === "active").length,
      draft: automations.filter((row) => row.status === "draft").length,
      paused: automations.filter((row) => row.status === "paused").length,
      templates: catalog?.templates.length,
    } as Record<View, number | undefined>;
  }, [automations, catalog]);

  const rows = useMemo(() => {
    if (!automations) return undefined;
    return automations.filter(
      (row) =>
        (view === "all" || view === "templates" || row.status === view) &&
        (subject === ALL || row.subjectKind === subject) &&
        (!search.trim() || matches(row, search)),
    );
  }, [automations, view, subject, search]);

  const sortedRows = useMemo(() => {
    if (!rows) return undefined;
    const column = COLUMNS.find((item) => item.id === sort.id);
    if (!column?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (left === right) return 0;
      if (typeof left === "string" && typeof right === "string")
        return left.localeCompare(right) * factor;
      return ((left ?? 0) < (right ?? 0) ? -1 : 1) * factor;
    });
  }, [rows, sort]);

  const filtered = subject !== ALL || search.trim() !== "";
  const clearFilters = () => {
    setSearch("");
    setSubject(ALL);
  };

  async function toggle(row: Row) {
    try {
      if (row.status === "active") {
        await pause({ id: row._id });
        toast(`${row.name} paused`, () => void activate({ id: row._id }));
      } else {
        const result = await activate({ id: row._id });
        toast(`${row.name} is live · version ${result.version}`);
      }
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function copy(row: Row) {
    try {
      const id = await duplicate({ id: row._id });
      router.push(routes.sequence(id));
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function destroy(row: Row) {
    try {
      const { ended } = await remove({ id: row._id });
      toast(
        `${row.name} deleted${ended ? ` · ${ended} live ${ended === 1 ? "run" : "runs"} ended` : ""}`,
        () => void restore({ id: row._id }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  const empty = filtered ? (
    <EmptyState
      icon={AutomationIcon}
      title="No sequences match"
      description="Try another search or clear the filters."
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : view !== "all" ? (
    <EmptyState
      icon={AutomationIcon}
      title={`No ${view === "draft" ? "drafts" : `${view} sequences`}`}
      description={
        view === "active"
          ? "Activate a draft to start enrolling records."
          : view === "paused"
            ? "Paused sequences hold their runs until you activate them."
            : "New sequences start as drafts."
      }
      action={
        <Button variant="secondary" size="sm" onClick={() => setView("all")}>
          Show all sequences
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={AutomationIcon}
      title="No sequences yet"
      description="Follow up automatically with emails and call tasks. Start from a template."
      action={
        <span className="flex gap-2">
          <Button
            variant={canEdit ? "secondary" : "primary"}
            size="sm"
            onClick={() => setView("templates")}
          >
            Browse templates
          </Button>
          {canEdit && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreating(true)}
            >
              New sequence
            </Button>
          )}
        </span>
      }
    />
  );

  return (
    <Page>
      <PageHeader
        title="Sequences"
        meta={
          <>
            {counts && (
              <PageStatus tone={counts.active ? "success" : "neutral"}>
                {counts.active} live of {counts.all}
              </PageStatus>
            )}
            <StoppedStatus />
          </>
        }
      />
      <PageViews
        value={view}
        onChange={setView}
        views={VIEWS.map((item) => ({ ...item, count: counts?.[item.id] }))}
      />
      {view === "templates" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex max-w-180 flex-col gap-4 px-(--page-x) pt-1 pb-16">
            <p className="text-fg-secondary text-sm">
              Each template opens as your own draft. Nothing is sent until you
              activate it.
            </p>
            <TemplatesGallery templates={catalog?.templates} />
          </div>
        </div>
      ) : (
        <>
          <PageToolbar
            activeFilters={Number(subject !== ALL)}
            onClearFilters={clearFilters}
            search={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search sequences"
              />
            }
            actions={
              <>
                <SegmentedControl
                  label="Layout"
                  value={grid ? "grid" : "table"}
                  onChange={setLayout}
                  segments={[
                    { value: "table", label: "Table" },
                    { value: "grid", label: "Cards" },
                  ]}
                  className="max-sm:hidden"
                />
                {canEdit && (
                  <CreateButton onClick={() => setCreating(true)}>
                    New sequence
                  </CreateButton>
                )}
              </>
            }
          >
            <FilterMenu
              label="Sort by"
              value={
                SORT_OPTIONS.some((option) => option.value === sort.id)
                  ? sort.id
                  : DEFAULT_SORT.id
              }
              options={SORT_OPTIONS}
              onChange={(id) =>
                setSortParam(`${id}:${id === "name" ? "asc" : "desc"}`)
              }
            />
            <FilterMenu
              label="Records"
              value={subject}
              onChange={setSubject}
              options={[
                { value: ALL, label: "Any" },
                ...SUBJECT_KINDS.map((kind) => ({
                  value: kind,
                  label: capital(SUBJECT_LABEL[kind][1]),
                })),
              ]}
            />
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
          </PageToolbar>
          {grid ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-(--page-x) pt-1 pb-16">
              <AutomationsGrid rows={sortedRows} empty={empty} />
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <DataTable
                label="Sequences"
                columns={COLUMNS}
                rows={sortedRows}
                getId={(row) => row._id}
                getHref={(row) => routes.sequence(row._id)}
                getLabel={(row) => row.name}
                sort={sort}
                onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
                rowMenu={(row) =>
                  canEdit || row.mine
                    ? [
                        {
                          label: row.status === "active" ? "Pause" : "Activate",
                          onSelect: () => void toggle(row),
                        },
                        canEdit && {
                          label: "Duplicate",
                          onSelect: () => void copy(row),
                        },
                        {
                          label: "Delete",
                          icon: TrashIcon,
                          tone: "danger",
                          onSelect: () => void destroy(row),
                        },
                      ]
                    : []
                }
                footer={[
                  {
                    label: "Sequences in view",
                    value: sortedRows?.length ?? 0,
                  },
                  {
                    label: "Enrolled",
                    value:
                      sortedRows?.reduce(
                        (sum, row) => sum + row.stats.enrolled,
                        0,
                      ) ?? 0,
                  },
                  {
                    label: "Active runs",
                    value:
                      sortedRows?.reduce(
                        (sum, row) => sum + row.stats.active,
                        0,
                      ) ?? 0,
                  },
                  {
                    label: "Completed",
                    value:
                      sortedRows?.reduce(
                        (sum, row) => sum + row.stats.completed,
                        0,
                      ) ?? 0,
                  },
                ]}
                renderCard={(row) => <AutomationCardBody row={row} />}
                empty={empty}
              />
            </div>
          )}
        </>
      )}
      <NewAutomationDialog
        open={creating}
        onOpenChange={setCreating}
        onBrowseTemplates={() => setView("templates")}
      />
    </Page>
  );
}

function AutomationCardBody({ row }: { row: Row }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{row.name}</span>
        <StatusTag status={row.status} />
      </div>
      <span className="caption-style text-fg-tertiary truncate">
        {row.stats.enrolled} enrolled · {row.stats.active} active ·{" "}
        {row.stats.completed} completed
      </span>
    </div>
  );
}

function AutomationsGrid({
  rows,
  empty,
}: {
  rows: Row[] | undefined;
  empty: React.ReactNode;
}) {
  const grid =
    "grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3";
  if (rows === undefined) {
    return (
      <ul className={grid}>
        {Array.from({ length: 3 }, (_, index) => (
          <li
            key={index}
            className="border-border flex h-28 flex-col gap-3 rounded-xl border p-4"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
          </li>
        ))}
      </ul>
    );
  }
  if (rows.length === 0) return empty;
  return (
    <ul className={grid}>
      {rows.map((row) => (
        <li key={row._id}>
          <Link
            href={routes.sequence(row._id)}
            className="border-border focus-visible:ring-ring hover:bg-row-hover duration-fast flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-2"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium">{row.name}</span>
              <StatusTag status={row.status} />
            </span>
            <span className="text-fg-tertiary line-clamp-2 text-sm">
              {row.description || row.trigger}
            </span>
            <span className="caption-style text-fg-tertiary mt-auto flex items-center justify-between gap-3 pt-1 tabular-nums">
              <span className="min-w-0 truncate">
                {row.stats.enrolled} enrolled · {row.stats.active} active ·{" "}
                {row.stats.completed} completed
              </span>
              <span className="shrink-0" title={dateTime(row.updatedAt)}>
                {relativeTime(row.updatedAt)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
