"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import SegmentBar from "@/components/_common/segment-bar";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import { UNASSIGNED, type Period } from "@/convex/lib/reports";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";
import ExportButton from "./export-button";
import { csvFilename, teamCsv } from "./export";
import {
  change,
  count,
  duration,
  percent,
  rate,
  signed,
  totals,
  trend,
} from "./format";
import {
  ChartSkeleton,
  Delta,
  MetricTile,
  Panel,
  Reloading,
  ReportSection,
} from "./section";
import { KpisSkeleton } from "./kpis";
import { useLatest } from "./use-report";

type TeamData = FunctionReturnType<typeof api.reports.team>;
export type TeamRow = TeamData["rows"][number];

const DEFAULT_SORT: SortState = { id: "leads", dir: "desc" };

const pts = (current: number | null, previous: number | null) =>
  current === null || previous === null
    ? "—"
    : signed(Math.round((current - previous) * 100), " pts");

function RepCell({ row }: { row: TeamRow }) {
  return row.ownerName ? (
    <>
      <Avatar name={row.ownerName} />
      <span className="truncate" title={row.ownerName}>
        {row.ownerName}
      </span>
    </>
  ) : (
    <span className="text-fg-tertiary truncate font-normal">Unassigned</span>
  );
}

/** A figure with its change against the previous period. */
function Compared({
  current,
  previous,
  danger,
}: {
  current: number;
  previous: number;
  danger?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5 tabular-nums">
      <span className={cn(danger && current > 0 && "text-danger")}>
        {count(current)}
      </span>
      <span
        className="caption-style text-fg-tertiary w-[3.5ch] text-left"
        title={`Previous period: ${count(previous)}`}
      >
        <span className="sr-only">, previous period {count(previous)}, </span>
        {change(current, previous)}
      </span>
    </span>
  );
}

function ActivationCell({ row }: { row: TeamRow }) {
  const value = rate(row.activatedAccounts, row.platformAccounts);
  if (row.platformAccounts === 0) {
    return <span className="text-fg-tertiary">—</span>;
  }
  return (
    <span
      className="flex items-center gap-1.5 tabular-nums"
      title={`${count(row.activatedAccounts)} of ${count(row.platformAccounts)} accounts on the platform are activated`}
    >
      <SegmentBar
        percent={(value ?? 0) * 100}
        segments={10}
        className="w-11 shrink-0"
      />
      <span className="min-w-[3ch] text-right">
        {count(row.activatedAccounts)}/{count(row.platformAccounts)}
      </span>
    </span>
  );
}

function columns(slaLabel: string): Column<TeamRow>[] {
  const compared = (
    id: string,
    header: string,
    pick: (period: TeamRow["current"]) => number,
    extra: Partial<Column<TeamRow>> = {},
  ): Column<TeamRow> => ({
    id,
    header,
    width: "minmax(5.5rem,1fr)",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => pick(row.current),
    cell: (row) => (
      <Compared current={pick(row.current)} previous={pick(row.previous)} />
    ),
    ...extra,
  });
  return [
    {
      id: "rep",
      header: "Rep",
      width: "minmax(11rem,1.5fr)",
      sortValue: (row) => row.ownerName ?? "",
      cell: (row) => <RepCell row={row} />,
    },
    compared("leads", "Leads", (period) => period.leads),
    {
      id: "median",
      header: "Speed",
      width: "minmax(7.25rem,1fr)",
      align: "end",
      sortValue: (row) => row.current.speed.medianMs,
      cell: (row) => duration(row.current.speed.medianMs),
    },
    {
      id: "p90",
      header: "p90",
      width: "minmax(4.5rem,0.8fr)",
      align: "end",
      minViewport: 1600,
      sortValue: (row) => row.current.speed.p90Ms,
      cell: (row) => duration(row.current.speed.p90Ms),
    },
    {
      id: "within",
      header: `Within ${slaLabel}`,
      width: "minmax(6.25rem,1fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.current.speed.withinRate,
      cell: (row) => (
        <span
          title={`${count(row.current.speed.within)} of ${count(row.current.speed.due)} inbound leads`}
        >
          {percent(row.current.speed.withinRate)}
        </span>
      ),
    },
    compared("tasks", "Tasks done", (period) => period.tasksDone, {
      width: "minmax(6.5rem,1fr)",
    }),
    {
      id: "overdue",
      header: "Overdue",
      width: "minmax(5.5rem,1fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.overdue,
      cell: (row) => (
        <span className={cn(row.overdue > 0 && "text-danger")}>
          {count(row.overdue)}
        </span>
      ),
    },
    {
      id: "calls",
      header: "Calls · meetings",
      width: "minmax(8.5rem,1fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.current.calls + row.current.meetings,
      cell: (row) => (
        <span
          className="tabular-nums"
          title={`Previous period: ${count(row.previous.calls)} calls · ${count(row.previous.meetings)} meetings`}
        >
          {count(row.current.calls)}
          <span className="text-fg-tertiary"> · </span>
          {count(row.current.meetings)}
          <span className="sr-only"> meetings</span>
        </span>
      ),
    },
    {
      id: "won",
      header: "Won",
      width: "minmax(6.5rem,1.2fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.current.won,
      cell: (row) => (
        <span
          className="flex min-w-0 items-baseline gap-1.5 tabular-nums"
          title={`Previous period: ${count(row.previous.won)} won`}
        >
          <span>{count(row.current.won)}</span>
          {row.current.wonValue.length > 0 && (
            <span className="caption-style text-fg-tertiary truncate">
              {totals(row.current.wonValue)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "activation",
      header: "Activated",
      width: "minmax(6.5rem,1fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => rate(row.activatedAccounts, row.platformAccounts),
      cell: (row) => <ActivationCell row={row} />,
    },
  ];
}

const repQuery = (row: TeamRow) =>
  row.ownerId === UNASSIGNED ? "unassigned" : row.ownerId;

/** Per-rep leaderboard for the period, each figure against the period before. */
export default function TeamTab({ period }: { period: Period }) {
  const router = useRouter();
  const { data, loading } = useLatest(useQuery(api.reports.team, { period }));
  const [sortParam, setSortParam] = useUrlState(
    "tsort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const slaLabel = data ? duration(data.slaMs) : "SLA";
  const cols = columns(slaLabel);
  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: cols.some((column) => column.id === sortId) ? sortId : DEFAULT_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };
  const team = data?.team;

  return (
    <Reloading loading={loading && Boolean(data)}>
      <ReportSection
        id="team"
        title="Team"
        description="The whole team for the period, against the period before."
      >
        <Panel className="px-4 py-4 sm:px-5">
          {!team ? (
            <KpisSkeleton />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <MetricTile
                icon={UserPlusIcon}
                label="Leads handled"
                value={count(team.current.leads)}
                delta={
                  <Delta
                    value={change(team.current.leads, team.previous.leads)}
                    trend={trend(team.current.leads, team.previous.leads)}
                  />
                }
              />
              <MetricTile
                icon={ClockIcon}
                label="Speed to lead"
                value={duration(team.current.speed.medianMs)}
                detail={`Median · p90 ${duration(team.current.speed.p90Ms)}`}
              />
              <MetricTile
                icon={ClockIcon}
                label={`Within ${slaLabel}`}
                value={percent(team.current.speed.withinRate)}
                detail={`${count(team.current.speed.within)} of ${count(team.current.speed.due)} leads`}
                delta={
                  <Delta
                    value={pts(
                      team.current.speed.withinRate,
                      team.previous.speed.withinRate,
                    )}
                    trend={trend(
                      team.current.speed.withinRate,
                      team.previous.speed.withinRate,
                    )}
                  />
                }
              />
              <MetricTile
                icon={CheckSquareIcon}
                label="Tasks done"
                value={count(team.current.tasksDone)}
                detail={`${count(team.overdue)} overdue now`}
                delta={
                  <Delta
                    value={change(
                      team.current.tasksDone,
                      team.previous.tasksDone,
                    )}
                    trend={trend(
                      team.current.tasksDone,
                      team.previous.tasksDone,
                    )}
                  />
                }
              />
              <MetricTile
                icon={PhoneCallIcon}
                label="Calls · meetings"
                value={`${count(team.current.calls)} · ${count(team.current.meetings)}`}
                delta={
                  <Delta
                    value={change(
                      team.current.calls + team.current.meetings,
                      team.previous.calls + team.previous.meetings,
                    )}
                    trend={trend(
                      team.current.calls + team.current.meetings,
                      team.previous.calls + team.previous.meetings,
                    )}
                  />
                }
              />
              <MetricTile
                icon={WalletIcon}
                label="Deals won"
                value={count(team.current.won)}
                detail={totals(team.current.wonValue, "No value yet")}
                delta={
                  <Delta
                    value={change(team.current.won, team.previous.won)}
                    trend={trend(team.current.won, team.previous.won)}
                  />
                }
              />
            </div>
          )}
        </Panel>
      </ReportSection>

      <ReportSection
        id="leaderboard"
        title="Leaderboard"
        description="Select a rep to open their leads; the … menu opens their tasks, deals and accounts."
        aside={
          <ExportButton
            label="team leaderboard"
            filename={csvFilename("team", period)}
            disabled={!data?.rows.length}
            rows={() => teamCsv(data!)}
          />
        }
        footnote={
          <>
            Leads: leads they own that arrived in the period. Speed: median time
            from arrival to first touch, for inbound leads (not ones added by
            hand); within SLA is out of leads touched or past their {slaLabel}{" "}
            window. Tasks done: completed in the period; overdue: open and due
            before today. Calls and meetings: logged by the rep in the period;
            automated messages don&apos;t count. Won: deals they own closed won
            in the period, with their value per currency (an accepted proposal
            sets it to the take). Activated: accounts they own on the platform
            that reached Activated, as of now. Small figures are the change
            against the previous period.
          </>
        }
      >
        <Panel className="flex flex-col">
          {!data ? (
            <ChartSkeleton rows={4} />
          ) : (
            <DataTable
              label="Rep leaderboard"
              keyboard={false}
              columns={cols}
              rows={data.rows}
              getId={(row) => row.ownerId}
              getHref={(row) => `/leads?owner=${repQuery(row)}`}
              getLabel={(row) => `Open ${row.ownerName ?? "unassigned"} leads`}
              sort={sort}
              onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
              rowMenu={(row) =>
                row.ownerId === UNASSIGNED
                  ? []
                  : [
                      {
                        label: "Open overdue tasks",
                        icon: CheckSquareIcon,
                        onSelect: () =>
                          router.push(
                            `/tasks?scope=all&assignee=${row.ownerId}&overdue=1`,
                          ),
                      },
                      {
                        label: "Open deals",
                        icon: WalletIcon,
                        onSelect: () =>
                          router.push(`/deals?owner=${row.ownerId}`),
                      },
                      {
                        label: "Open accounts",
                        icon: UsersIcon,
                        onSelect: () =>
                          router.push(`/accounts?owner=${row.ownerId}`),
                      },
                      {
                        label: "Show their funnel",
                        icon: ActivityIcon,
                        onSelect: () =>
                          router.push(
                            `/reports?tab=funnel&period=${period}&owner=${row.ownerId}`,
                          ),
                      },
                    ]
              }
              footer={[
                {
                  label: "Leads",
                  value: count(data.team.current.leads),
                },
                {
                  label: `Within ${slaLabel}`,
                  value: percent(data.team.current.speed.withinRate),
                },
                {
                  label: "Tasks done",
                  value: count(data.team.current.tasksDone),
                },
                {
                  label: "Overdue",
                  value: (
                    <span
                      className={cn(data.team.overdue > 0 && "text-danger")}
                    >
                      {count(data.team.overdue)}
                    </span>
                  ),
                },
                {
                  label: "Calls · meetings",
                  value: `${count(data.team.current.calls)} · ${count(data.team.current.meetings)}`,
                },
                { label: "Won", value: count(data.team.current.won) },
              ]}
              renderCard={(row) => (
                <span className="flex flex-col gap-2">
                  <span className="flex items-center justify-between gap-3">
                    <span className="lead-style flex min-w-0 items-center gap-2 font-medium">
                      <RepCell row={row} />
                    </span>
                    <span className="caption-style text-fg-secondary shrink-0 tabular-nums">
                      {count(row.current.leads)}{" "}
                      {row.current.leads === 1 ? "lead" : "leads"}
                    </span>
                  </span>
                  <span className="caption-style text-fg-tertiary flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                    <span>Median {duration(row.current.speed.medianMs)}</span>
                    <span>
                      Within {slaLabel} {percent(row.current.speed.withinRate)}
                    </span>
                    <span>
                      {count(row.current.tasksDone)}{" "}
                      {row.current.tasksDone === 1 ? "task" : "tasks"} done
                    </span>
                    <span className={cn(row.overdue > 0 && "text-danger")}>
                      {count(row.overdue)} overdue
                    </span>
                    <span>
                      {count(row.current.calls)}{" "}
                      {row.current.calls === 1 ? "call" : "calls"} ·{" "}
                      {count(row.current.meetings)}{" "}
                      {row.current.meetings === 1 ? "meeting" : "meetings"}
                    </span>
                    <span>
                      {count(row.current.won)} won
                      {row.current.wonValue.length > 0 &&
                        ` · ${totals(row.current.wonValue)}`}
                    </span>
                    <span>
                      Activated {count(row.activatedAccounts)}/
                      {count(row.platformAccounts)}
                    </span>
                  </span>
                </span>
              )}
              empty={
                <EmptyState
                  className="mx-auto max-w-lg"
                  icon={UsersIcon}
                  title="No teammates yet"
                  description="Invite reps to see their leads, speed to lead, tasks, calls and deals side by side."
                  action={
                    <Button variant="secondary" size="sm" href="/settings/team">
                      Invite teammates
                    </Button>
                  }
                />
              }
            />
          )}
        </Panel>
      </ReportSection>
    </Reloading>
  );
}
