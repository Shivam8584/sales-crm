"use client";

import Avatar from "@/components/_ui/avatar";
import EmptyState from "@/components/_ui/empty-state";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import type { SpeedStats } from "@/convex/lib/reports";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";
import ClockIcon from "@/public/assets/icons/clock.svg";
import { count, duration, percent } from "./format";
import { Panel } from "./section";

export type OwnerRow = SpeedStats & {
  ownerId: string;
  ownerName: string | null;
};

const DEFAULT_SORT: SortState = { id: "median", dir: "asc" };

function ownerCell(row: OwnerRow) {
  return row.ownerName ? (
    <>
      <Avatar name={row.ownerName} />
      <span className="truncate">{row.ownerName}</span>
    </>
  ) : (
    <span className="text-fg-tertiary truncate font-normal">Unassigned</span>
  );
}

function columns(slaLabel: string): Column<OwnerRow>[] {
  return [
    {
      id: "owner",
      header: "Owner",
      width: "minmax(11rem,1.6fr)",
      sortValue: (row) => row.ownerName ?? "",
      cell: ownerCell,
    },
    {
      id: "leads",
      header: "Leads",
      width: "5rem",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.leads,
      cell: (row) => count(row.leads),
    },
    {
      id: "median",
      header: "Median",
      width: "minmax(5.5rem,1fr)",
      align: "end",
      sortValue: (row) => row.medianMs,
      cell: (row) => duration(row.medianMs),
    },
    {
      id: "p90",
      header: "p90",
      width: "minmax(5.5rem,1fr)",
      align: "end",
      sortValue: (row) => row.p90Ms,
      cell: (row) => duration(row.p90Ms),
    },
    {
      id: "within",
      header: `Within ${slaLabel}`,
      width: "minmax(7rem,1fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.withinRate,
      cell: (row) => percent(row.withinRate),
    },
    {
      id: "breached",
      header: "Breached",
      width: "minmax(6rem,1fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.breached,
      cell: (row) => (
        <span className={cn(row.breached > 0 && "text-danger")}>
          {count(row.breached)}
        </span>
      ),
    },
  ];
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="bg-background flex min-w-0 flex-col gap-2 px-4 py-3.5">
      <dt className="caption-style text-fg-tertiary truncate">{label}</dt>
      <dd
        className={cn(
          "text-lg leading-none font-semibold tabular-nums",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Speed-to-lead headline numbers and the same numbers per owner. */
export default function SpeedSection({
  speed,
  owners,
  slaMs,
  hrefFor,
}: {
  speed: SpeedStats;
  owners: OwnerRow[];
  slaMs: number;
  hrefFor: (owner: string) => string;
}) {
  const slaLabel = duration(slaMs);
  const cols = columns(slaLabel);
  const [sortParam, setSortParam] = useUrlState(
    "osort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: cols.some((column) => column.id === sortId) ? sortId : DEFAULT_SORT.id,
    dir: sortDir === "desc" ? "desc" : "asc",
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel className="overflow-hidden">
        <dl className="bg-border grid grid-cols-2 gap-px sm:grid-cols-4">
          <Stat label="Median" value={duration(speed.medianMs)} />
          <Stat label="p90" value={duration(speed.p90Ms)} />
          <Stat
            label={`Within ${slaLabel} SLA`}
            value={
              speed.withinRate === null
                ? "—"
                : `${percent(speed.withinRate)} (${count(speed.within)}/${count(speed.due)})`
            }
          />
          <Stat
            label="Breached"
            value={count(speed.breached)}
            tone={speed.breached > 0 ? "danger" : undefined}
          />
        </dl>
      </Panel>
      <Panel className="flex flex-col overflow-hidden">
        <DataTable
          label="Speed to lead by owner"
          keyboard={false}
          columns={cols}
          rows={owners}
          getId={(row) => row.ownerId}
          getHref={(row) => hrefFor(row.ownerId)}
          getLabel={(row) => `Show only ${row.ownerName ?? "unassigned"} leads`}
          sort={sort}
          onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
          renderCard={(row) => (
            <span className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3">
                <span className="lead-style flex min-w-0 items-center gap-2 font-medium">
                  {ownerCell(row)}
                </span>
                <span className="caption-style text-fg-secondary shrink-0 tabular-nums">
                  {count(row.leads)} {row.leads === 1 ? "lead" : "leads"}
                </span>
              </span>
              <span className="caption-style text-fg-tertiary flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                <span>Median {duration(row.medianMs)}</span>
                <span>p90 {duration(row.p90Ms)}</span>
                <span>
                  Within {slaLabel} {percent(row.withinRate)}
                </span>
                <span className={cn(row.breached > 0 && "text-danger")}>
                  {count(row.breached)} breached
                </span>
              </span>
            </span>
          )}
          empty={
            <EmptyState
              className="mx-auto max-w-lg"
              icon={ClockIcon}
              title="No inbound leads in this period"
              description="Speed to lead is measured on form, Cal.com and signup leads. Leads added by hand are left out."
            />
          }
        />
      </Panel>
    </div>
  );
}
