"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import {
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import {
  ActivationCell,
  OwnerCell,
  activationPercent,
  activationSteps,
  cellDate,
  dash,
} from "@/features/accounts/record-cells";
import { StageTag } from "@/features/accounts/stage";
import { chipClass } from "@/features/tasks/task-chips";
import { PriorityIcon, StatusIcon } from "@/features/tasks/task-meta";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { ACTIVATION_STAGES } from "@/lib/domain/platform";
import { STAGE_LABEL, TASK_STATUS_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ListIcon from "@/public/assets/icons/list.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import XIcon from "@/public/assets/icons/x.svg";
import FunnelStrip from "./funnel-strip";
import RunChecksButton from "./run-checks-button";
import { firstSentence, stuckFor } from "./stall";

type Desk = FunctionReturnType<typeof api.activation.desk>;
type Rule = Desk["rules"][number];
type Row = Desk["rows"][number] & { rule: Rule };

const ALL = "all";
const MINE = "mine";

function TaskAction({ row }: { row: Row }) {
  const setEdit = useUiStore((state) => state.setEdit);
  const ensureTask = useMutation(api.activation.ensureTask);
  const [busy, setBusy] = useState(false);
  const task = row.task;

  async function create() {
    setBusy(true);
    try {
      const id = await ensureTask({ accountId: row._id });
      if (id) setEdit({ type: "task", id });
      else toast(`${row.account.name} isn't stuck any more`);
    } catch (error) {
      toast(readError(error, "Couldn't open the task").message, {
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!task) {
    return (
      <button
        type="button"
        disabled={busy}
        aria-busy={busy || undefined}
        className={cn(chipClass(), "text-fg-tertiary disabled:opacity-60")}
        onClick={() => void create()}
      >
        <PlusIcon aria-hidden className="size-2.5" />
        Create task
      </button>
    );
  }
  return (
    <button
      type="button"
      className={cn(chipClass(), "max-w-full")}
      onClick={() => setEdit({ type: "task", id: task._id })}
      aria-label={`Open task for ${row.account.name}: ${TASK_STATUS_LABEL[task.status]}${task.assignee ? `, assigned to ${task.assignee.name}` : ""}`}
    >
      <StatusIcon status={task.status} />
      <span className="truncate">
        {task.status === "done" ? "Followed up" : "Open task"}
      </span>
    </button>
  );
}

const DAY = 24 * 60 * 60_000;
const DEFAULT_SORT: SortState = { id: "since", dir: "asc" };

function StallTag({ rule }: { rule: Rule }) {
  return (
    <Tag
      tone={rule.priority === "urgent" ? "red" : "amber"}
      size="sm"
      title={firstSentence(rule.playbook)}
      className="max-w-full min-w-0 gap-1"
    >
      <PriorityIcon priority={rule.priority} className="size-3" />
      <span className="truncate">{rule.label}</span>
    </Tag>
  );
}

function LastEventCell({ at }: { at: number | null }) {
  if (!at) return dash;
  return (
    <Tooltip content={dateTime(at)}>
      <span className="text-fg-secondary flex min-w-0 items-center gap-1">
        <CalendarIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="w-12.5 shrink-0 tabular-nums">{cellDate(at)}</span>
        <span aria-hidden className="bg-overlay-4 mx-0.75 h-2 w-px shrink-0" />
        <span className="truncate">{relativeTime(at)}</span>
      </span>
    </Tooltip>
  );
}

const COLUMNS: Column<Row>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(11rem,1.4fr)",
    sortValue: (row) => row.account.name,
    cell: (row) => (
      <>
        <AccountLogo account={row.account} size="xs" />
        <span className="truncate" title={row.account.name}>
          {row.account.name}
        </span>
      </>
    ),
  },
  {
    id: "activation",
    header: "Activation",
    width: "7.5rem",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => activationSteps(true, row.stage),
    cell: (row) => <ActivationCell steps={activationSteps(true, row.stage)} />,
  },
  {
    id: "stall",
    header: "Stuck on",
    width: "minmax(10rem,1.1fr)",
    sortValue: (row) => row.severity,
    cell: (row) => <StallTag rule={row.rule} />,
  },
  {
    id: "since",
    header: "Stuck for",
    width: "6.5rem",
    align: "end",
    sortValue: (row) => row.since,
    cell: (row) => (
      <span
        className={cn(
          "tabular-nums",
          Date.now() - row.since > 7 * DAY
            ? "text-danger"
            : "text-fg-secondary",
        )}
        title={`Since ${dateTime(row.since)}`}
      >
        {stuckFor(row.since)}
      </span>
    ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(8.75rem,1fr)",
    minViewport: 900,
    sortValue: (row) => row.owner?.name ?? null,
    cell: (row) => <OwnerCell owner={row.owner} />,
  },
  {
    id: "activity",
    header: "Last on Hypedrive",
    width: "minmax(12.5rem,1fr)",
    defaultDir: "desc",
    minViewport: 1200,
    sortValue: (row) => row.lastEventAt,
    cell: (row) => <LastEventCell at={row.lastEventAt} />,
  },
  {
    id: "task",
    header: "Task",
    width: "minmax(8rem,0.8fr)",
    sortValue: (row) => (row.task ? (row.task.status === "done" ? 2 : 1) : 0),
    cell: (row) => <TaskAction row={row} />,
  },
];

/** Brands stuck between signup and their first approved result, one saved view per stall rule. */
export default function ActivationPage() {
  const viewer = useViewer();
  const members = useMembers();
  const desk = useQuery(api.activation.desk, {});
  const ensureTask = useMutation(api.activation.ensureTask);
  const setEdit = useUiStore((state) => state.setEdit);
  const setPeek = useUiStore((state) => state.setPeek);
  const canRun = viewer.role !== "rep";

  const [stall, setStall] = useUrlState("stall", ALL);
  const [stage, setStage] = useUrlState("stage", ALL);
  const defaultOwner = canRun ? ALL : MINE;
  const [owner, setOwner] = useUrlState("owner", defaultOwner);
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [now] = useState(() => Date.now());

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId && column.sortValue)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "desc" ? "desc" : "asc",
  };

  const all = useMemo(() => {
    if (!desk) return undefined;
    const rules = new Map(desk.rules.map((rule) => [rule.id, rule]));
    return desk.rows.map((row) => ({ ...row, rule: rules.get(row.ruleId)! }));
  }, [desk]);

  const scoped = useMemo(
    () =>
      all?.filter(
        (row) =>
          (stage === ALL || row.stage === stage) &&
          (owner === ALL ||
            row.owner?._id === (owner === MINE ? viewer._id : owner)),
      ),
    [all, stage, owner, viewer._id],
  );

  const rows = useMemo(
    () => scoped?.filter((row) => stall === ALL || row.ruleId === stall),
    [scoped, stall],
  );

  const totals = useMemo(() => {
    if (!rows) return null;
    const open = rows.filter((row) => row.task && row.task.status !== "done");
    const days = rows.map((row) => (now - row.since) / DAY);
    const onPath = rows.map((row) =>
      activationPercent(activationSteps(true, row.stage)!),
    );
    return {
      avgDays: days.length
        ? days.reduce((sum, value) => sum + value, 0) / days.length
        : null,
      withTask: open.length,
      noTask: rows.filter((row) => !row.task).length,
      avgActivation: onPath.length
        ? Math.round(
            onPath.reduce((sum, value) => sum + value, 0) / onPath.length,
          )
        : null,
    };
  }, [rows, now]);

  const filtered = stage !== ALL || owner !== defaultOwner;
  const onlyMine = stall === ALL && stage === ALL && owner === MINE;

  function clearFilters() {
    setStage(ALL);
    setOwner(defaultOwner);
  }

  function showEveryone() {
    setStall(ALL);
    setStage(ALL);
    setOwner(ALL);
  }

  async function openTask(row: Row) {
    if (row.task) return setEdit({ type: "task", id: row.task._id });
    try {
      const id = await ensureTask({ accountId: row._id });
      if (id) setEdit({ type: "task", id });
      else toast(`${row.account.name} isn't stuck any more`);
    } catch (error) {
      toast(readError(error, "Couldn't open the task").message, {
        tone: "danger",
      });
    }
  }

  return (
    <Page>
      <PageHeader
        title="Activation"
        meta={
          all && (
            <PageStatus tone={all.length > 0 ? "warning" : "success"}>
              <span className="tabular-nums">
                {all.length} stuck · {desk?.linked ?? 0} on Hypedrive
              </span>
            </PageStatus>
          )
        }
        actions={canRun && <RunChecksButton />}
      />
      <PageViews
        param="stall"
        label="Stuck on"
        value={stall}
        onChange={setStall}
        views={[
          { id: ALL, label: "All stuck", count: scoped?.length },
          ...(desk?.rules ?? []).map((rule) => ({
            id: rule.id,
            label: rule.label,
            count: scoped?.filter((row) => row.ruleId === rule.id).length,
          })),
        ]}
      />
      <FunnelStrip
        desk={desk}
        selected={stage === ALL ? null : stage}
        onSelect={(next) => setStage(next ?? ALL)}
      />
      <PageToolbar>
        <FilterMenu
          label="Sort by"
          value={sort.id}
          onChange={(id) =>
            setSortParam(
              `${id}:${COLUMNS.find((column) => column.id === id)?.defaultDir ?? "asc"}`,
            )
          }
          options={[
            { value: "since", label: "Stuck longest" },
            { value: "stall", label: "Severity" },
            { value: "activation", label: "Activation" },
            { value: "activity", label: "Last on Hypedrive" },
            { value: "name", label: "Name" },
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
        {stage !== ALL && (
          <Button
            variant="secondary"
            size="control"
            className="px-2.5"
            onClick={() => setStage(ALL)}
            aria-label={`Stage: ${STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}. Remove filter`}
          >
            <StageTag stage={stage as (typeof ACTIVATION_STAGES)[number]} />
            <XIcon aria-hidden className="text-fg-tertiary size-3" />
          </Button>
        )}
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </PageToolbar>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label="Stuck brands"
          columns={COLUMNS}
          rows={rows}
          getId={(row) => row._id}
          getHref={(row) => `/accounts/${row._id}`}
          getLabel={(row) => row.account.name}
          sort={sort}
          onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
          onPeek={(row) => setPeek({ type: "account", id: row._id })}
          rowMenu={(row) => [
            {
              label: row.task ? "Open task" : "Create task",
              icon: row.task ? ListIcon : PlusIcon,
              onSelect: () => void openTask(row),
            },
          ]}
          footer={[
            { label: "Stuck in view", value: rows?.length ?? 0 },
            {
              label: "Avg time stuck",
              value:
                totals?.avgDays == null ? (
                  dash
                ) : (
                  <>
                    {totals.avgDays < 10
                      ? totals.avgDays.toFixed(1)
                      : Math.round(totals.avgDays)}
                    <span className="text-fg-tertiary">d</span>
                  </>
                ),
            },
            {
              label: "Avg activation",
              value:
                totals?.avgActivation == null ? (
                  dash
                ) : (
                  <>
                    {totals.avgActivation}
                    <span className="text-fg-tertiary">%</span>
                  </>
                ),
            },
            {
              label: "Open tasks",
              value: (
                <>
                  {totals?.withTask ?? 0}
                  {totals && totals.noTask > 0 && (
                    <span className="text-warning ml-1.5">
                      {totals.noTask} without
                    </span>
                  )}
                </>
              ),
            },
          ]}
          renderCard={(row) => (
            <span className="flex flex-col gap-2.5">
              <span className="flex items-center gap-3">
                <AccountLogo account={row.account} size="md" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="lead-style truncate font-medium">
                    {row.account.name}
                  </span>
                  <span className="caption-style text-fg-tertiary truncate">
                    {stuckFor(row.since)}
                    {row.owner ? ` · ${row.owner.name}` : ""}
                    {row.task ? ` · ${TASK_STATUS_LABEL[row.task.status]}` : ""}
                  </span>
                </span>
              </span>
              <span className="caption-style flex items-center justify-between gap-3 pl-11">
                <StallTag rule={row.rule} />
                <ActivationCell steps={activationSteps(true, row.stage)} />
              </span>
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
                    : "Try another step, view or owner."
                }
                action={
                  <Button variant="secondary" size="sm" onClick={showEveryone}>
                    {onlyMine ? "Show everyone" : "Show all stuck brands"}
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
      </div>
    </Page>
  );
}
