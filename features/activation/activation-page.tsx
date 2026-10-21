"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import type { Column } from "@/components/data-table/types";
import { Page, PageHeader, PageToolbar } from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import { StageTag } from "@/features/accounts/stage";
import GroupedTable, { type RowGroup } from "@/features/tasks/grouped-table";
import { chipClass } from "@/features/tasks/task-chips";
import { PriorityIcon, StatusIcon } from "@/features/tasks/task-meta";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { ACTIVATION_STAGES } from "@/lib/domain/platform";
import {
  PRIORITY_LABEL,
  STAGE_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
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

const COLUMNS: Column<Row>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(12rem,1.8fr)",
    cell: (row) => (
      <>
        <AccountLogo account={row.account} size="xs" />
        <span className="truncate">{row.account.name}</span>
      </>
    ),
  },
  {
    id: "since",
    header: "Stuck for",
    width: "7rem",
    cell: (row) => (
      <span
        className="text-fg-secondary tabular-nums"
        title={`Since ${dateTime(row.since)}`}
      >
        {stuckFor(row.since)}
      </span>
    ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(9rem,1fr)",
    minViewport: 900,
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
    id: "activity",
    header: "Last on Hypedrive",
    width: "9.5rem",
    minViewport: 1100,
    cell: (row) => (
      <span
        className="text-fg-secondary"
        title={row.lastEventAt ? dateTime(row.lastEventAt) : undefined}
      >
        {row.lastEventAt ? relativeTime(row.lastEventAt) : "—"}
      </span>
    ),
  },
  {
    id: "task",
    header: "Task",
    width: "minmax(8rem,0.8fr)",
    cell: (row) => <TaskAction row={row} />,
  },
];

/** Brands stuck between signup and their first approved result, grouped by the step they're stuck on. */
export default function ActivationPage() {
  const viewer = useViewer();
  const members = useMembers();
  const desk = useQuery(api.activation.desk, {});
  const canRun = viewer.role !== "rep";

  const [stall, setStall] = useUrlState("stall", ALL);
  const [stage, setStage] = useUrlState("stage", ALL);
  const defaultOwner = canRun ? ALL : MINE;
  const [owner, setOwner] = useUrlState("owner", defaultOwner);

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
          (stage === ALL || row.stage === stage) &&
          (owner === ALL ||
            row.owner?._id === (owner === MINE ? viewer._id : owner)),
      ),
    [all, stall, stage, owner, viewer._id],
  );

  const groups = useMemo((): RowGroup<Row>[] | undefined => {
    if (!desk || !rows) return undefined;
    return desk.rules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      icon: (
        <span
          role="img"
          aria-label={`${PRIORITY_LABEL[rule.priority]} priority`}
        >
          <PriorityIcon priority={rule.priority} className="size-3" />
        </span>
      ),
      description: firstSentence(rule.playbook),
      rows: rows
        .filter((row) => row.ruleId === rule.id)
        .sort((a, b) => a.since - b.since),
    }));
  }, [desk, rows]);

  const filtered = stall !== ALL || stage !== ALL || owner !== defaultOwner;
  const onlyMine = stall === ALL && stage === ALL && owner === MINE;

  function clearFilters() {
    setStall(ALL);
    setStage(ALL);
    setOwner(defaultOwner);
  }

  function showEveryone() {
    setStall(ALL);
    setStage(ALL);
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
      <FunnelStrip
        desk={desk}
        selected={stage === ALL ? null : stage}
        onSelect={(next) => setStage(next ?? ALL)}
      />
      <PageToolbar>
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
        {rows && all && filtered && (
          <span className="caption-style text-fg-tertiary ml-auto tabular-nums">
            {rows.length} of {all.length}
          </span>
        )}
      </PageToolbar>

      <GroupedTable
        label="Stuck brands"
        columns={COLUMNS}
        groups={groups}
        getId={(row) => row._id}
        getHref={(row) => `/accounts/${row._id}`}
        getLabel={(row) => row.account.name}
        renderCard={(row) => (
          <span className="flex items-center gap-3">
            <AccountLogo account={row.account} size="md" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="lead-style truncate font-medium">
                {row.account.name}
              </span>
              <span className="caption-style text-fg-tertiary truncate">
                {stuckFor(row.since)}
                {row.owner ? ` · ${row.owner.name}` : ""}
                {row.task ? ` · ${TASK_STATUS_LABEL[row.task.status]}` : ""}
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
