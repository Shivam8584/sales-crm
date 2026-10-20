"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import { Page, PageHeader, PageToolbar } from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import { StageTag } from "@/features/accounts/stage";
import { PriorityIcon, StatusIcon } from "@/features/tasks/task-meta";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { ACTIVATION_STAGES } from "@/lib/domain/platform";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/domain/labels";
import { relativeTime } from "@/lib/time";
import { useUiStore } from "@/stores/ui-store";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import FunnelStrip from "./funnel-strip";
import RunChecksButton from "./run-checks-button";

type Desk = FunctionReturnType<typeof api.activation.desk>;
type Rule = Desk["rules"][number];
type Row = Desk["rows"][number] & { rule: Rule };

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "stall", dir: "asc" };
const HOUR = 60 * 60_000;

function stuckFor(since: number) {
  const ms = Date.now() - since;
  const hours = Math.max(1, Math.floor(ms / HOUR));
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${Math.floor(ms / (24 * HOUR))} days`;
}

function TaskStatus({ task }: { task: Row["task"] }) {
  const setEdit = useUiStore((state) => state.setEdit);
  if (!task) {
    return <span className="text-fg-tertiary truncate">Not created yet</span>;
  }
  return (
    <Button
      variant="ghost"
      size="inline"
      className="text-fg-secondary min-w-0"
      onClick={() => setEdit({ type: "task", id: task._id })}
    >
      <StatusIcon status={task.status} />
      <span className="truncate">
        {TASK_STATUS_LABEL[task.status]}
        {task.assignee && task.status !== "done" && (
          <span className="sr-only">, assigned to {task.assignee.name}</span>
        )}
      </span>
    </Button>
  );
}

const COLUMNS: Column<Row>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(12rem,1.6fr)",
    sortValue: (row) => row.account.name,
    cell: (row) => (
      <>
        <AccountLogo account={row.account} size="xs" />
        <span className="truncate">{row.account.name}</span>
      </>
    ),
  },
  {
    id: "stage",
    header: "Stage",
    width: "8.5rem",
    sortValue: (row) => ACTIVATION_STAGES.indexOf(row.stage),
    cell: (row) => <StageTag stage={row.stage} />,
  },
  {
    id: "stall",
    header: "Stuck on",
    width: "minmax(11rem,1.3fr)",
    sortValue: (row) => row.severity * 1e13 + row.since,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <PriorityIcon priority={row.rule.priority} />
        <span className="sr-only">{PRIORITY_LABEL[row.rule.priority]}: </span>
        <span className="truncate" title={row.rule.description}>
          {row.rule.label}
        </span>
      </span>
    ),
  },
  {
    id: "since",
    header: "For",
    width: "6.5rem",
    defaultDir: "asc",
    sortValue: (row) => row.since,
    cell: (row) => (
      <span className="text-fg-secondary tabular-nums">
        {stuckFor(row.since)}
      </span>
    ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(9rem,1fr)",
    minViewport: 900,
    sortValue: (row) => row.owner?.name ?? null,
    cell: (row) =>
      row.owner ? (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={row.owner.name} />
          <span className="truncate">{row.owner.name}</span>
        </span>
      ) : (
        <span className="text-fg-tertiary">No owner</span>
      ),
  },
  {
    id: "task",
    header: "Task",
    width: "minmax(7.5rem,0.8fr)",
    sortValue: (row) =>
      row.task ? ["todo", "in_progress", "done"].indexOf(row.task.status) : -1,
    cell: (row) => <TaskStatus task={row.task} />,
  },
  {
    id: "activity",
    header: "Last on Hypedrive",
    width: "9.5rem",
    align: "end",
    defaultDir: "desc",
    minViewport: 1100,
    sortValue: (row) => row.lastEventAt,
    cell: (row) => (
      <span className="text-fg-secondary">
        {row.lastEventAt ? relativeTime(row.lastEventAt) : "—"}
      </span>
    ),
  },
];

/** Brands stuck between signup and their first approved result, each with a rep task. */
export default function ActivationPage() {
  const viewer = useViewer();
  const members = useMembers();
  const desk = useQuery(api.activation.desk, {});
  const canRun = viewer.role !== "rep";

  const [stall, setStall] = useUrlState("stall", ALL);
  const defaultOwner = canRun ? ALL : MINE;
  const [owner, setOwner] = useUrlState("owner", defaultOwner);
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "desc" ? "desc" : "asc",
  };

  const all = useMemo(() => {
    if (!desk) return undefined;
    const rules = new Map(desk.rules.map((rule) => [rule.id, rule]));
    return desk.rows.map((row) => ({ ...row, rule: rules.get(row.ruleId)! }));
  }, [desk]);

  const rows = useMemo(
    () =>
      all?.filter(
        (row) =>
          (stall === ALL || row.ruleId === stall) &&
          (owner === ALL ||
            row.owner?._id === (owner === MINE ? viewer._id : owner)),
      ),
    [all, stall, owner, viewer._id],
  );

  const filtered = stall !== ALL || owner !== defaultOwner;
  const onlyMine = stall === ALL && owner === MINE;

  function clearFilters() {
    setStall(ALL);
    setOwner(defaultOwner);
  }

  function showEveryone() {
    setStall(ALL);
    setOwner(ALL);
  }

  return (
    <Page>
      <PageHeader
        title="Activation"
        meta={
          all && (
            <span className="caption-style text-fg-tertiary tabular-nums">
              {all.length} stuck
            </span>
          )
        }
        actions={canRun && <RunChecksButton />}
      />
      <FunnelStrip desk={desk} />
      <PageToolbar>
        <FilterMenu
          label="Stuck on"
          value={stall}
          onChange={setStall}
          options={[
            { value: ALL, label: "Any step" },
            ...(desk?.rules ?? []).map((rule) => ({
              value: rule.id,
              label: rule.label,
            })),
          ]}
        />
        <FilterMenu
          label="Owner"
          value={owner}
          onChange={setOwner}
          options={[
            { value: ALL, label: "Anyone" },
            { value: MINE, label: "Me" },
            ...(members ?? [])
              .filter((member) => member._id !== viewer._id)
              .map((member) => ({ value: member._id, label: member.name })),
          ]}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
        {rows && all && filtered && (
          <span className="caption-style text-fg-tertiary ml-auto tabular-nums">
            {rows.length} of {all.length}
          </span>
        )}
      </PageToolbar>

      <DataTable
        label="Stuck brands"
        columns={COLUMNS}
        rows={rows}
        getId={(row) => row._id}
        getHref={(row) => `/accounts/${row._id}`}
        getLabel={(row) => row.account.name}
        sort={sort}
        onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
        renderCard={(row) => (
          <span className="flex items-center gap-3">
            <AccountLogo account={row.account} size="md" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="lead-style truncate font-medium">
                {row.account.name}
              </span>
              <span className="caption-style text-fg-tertiary flex min-w-0 items-center gap-1.5">
                <PriorityIcon priority={row.rule.priority} />
                <span className="truncate">
                  {row.rule.label} · {stuckFor(row.since)}
                  {row.task ? ` · ${TASK_STATUS_LABEL[row.task.status]}` : ""}
                </span>
              </span>
            </span>
            <StageTag stage={row.stage} />
          </span>
        )}
        empty={
          all && all.length > 0 ? (
            <EmptyState
              icon={CheckCircleIcon}
              title={
                onlyMine
                  ? "None of your brands are stuck"
                  : "No stuck brands match"
              }
              description={
                onlyMine
                  ? `${all.length} ${all.length === 1 ? "brand is" : "brands are"} stuck across the team.`
                  : "Try another step or owner."
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onlyMine ? showEveryone : clearFilters}
                >
                  {onlyMine ? "Show everyone" : "Clear filters"}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={CheckCircleIcon}
              title={
                desk?.linked === 0
                  ? "No brands on Hypedrive yet"
                  : "Every brand is moving"
              }
              description={
                !desk?.linked
                  ? "Brands show up here once they sign up on Hypedrive."
                  : desk.linked === 1
                    ? "The one brand on Hypedrive isn't stuck on any step."
                    : `None of the ${desk.linked} brands on Hypedrive is stuck on a step.`
              }
              action={
                <Button variant="secondary" size="sm" href="/accounts">
                  View accounts
                </Button>
              }
            />
          )
        }
      />
    </Page>
  );
}
