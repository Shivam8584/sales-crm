"use client";

import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import EmptyState from "@/components/_ui/empty-state";
import SegmentBar from "@/components/_common/segment-bar";
import type { SourceRow } from "@/convex/lib/reports";
import { useUrlState } from "@/hooks/use-url-state";
import { count, duration, percent, rate } from "./format";

const DEFAULT_SORT: SortState = { id: "leads", dir: "desc" };

function share(part: number, whole: number) {
  const value = rate(part, whole);
  return (
    <span
      className="flex items-center gap-1.5 tabular-nums"
      title={`${count(part)} of ${count(whole)} leads`}
    >
      <SegmentBar
        percent={(value ?? 0) * 100}
        segments={10}
        className="w-11 shrink-0"
      />
      <span className="w-[4ch] text-right">{percent(value)}</span>
    </span>
  );
}

function rateColumn(
  id: string,
  header: string,
  pick: (row: SourceRow) => number,
): Column<SourceRow> {
  return {
    id,
    header,
    width: "minmax(7.5rem,1fr)",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => rate(pick(row), row.leads),
    cell: (row) => share(pick(row), row.leads),
  };
}

const COLUMNS: Column<SourceRow>[] = [
  {
    id: "source",
    header: "Source",
    width: "minmax(11rem,1.6fr)",
    sortValue: (row) => row.label,
    cell: (row) => <span className="truncate">{row.label}</span>,
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
  rateColumn("contacted", "Contacted", (row) => row.contacted),
  rateColumn("demo", "Demo", (row) => row.demo),
  rateColumn("converted", "Converted", (row) => row.converted),
  rateColumn("activated", "Activated", (row) => row.activated),
  {
    id: "speed",
    header: "Median speed",
    width: "minmax(7rem,1fr)",
    align: "end",
    sortValue: (row) => row.medianSpeedMs,
    cell: (row) => (
      <span className={row.medianSpeedMs === null ? "text-fg-tertiary" : ""}>
        {duration(row.medianSpeedMs)}
      </span>
    ),
  },
];

/** Conversion by acquisition source; a row narrows the whole report to that source. */
export default function SourceTable({
  rows,
  filtered,
  hrefFor,
}: {
  rows: SourceRow[];
  filtered: boolean;
  hrefFor: (key: string) => string;
}) {
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const sum = (pick: (row: SourceRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const leads = sum((row) => row.leads);

  return (
    <DataTable
      label="Conversion by source"
      footer={[
        { label: rows.length === 1 ? "Source" : "Sources", value: rows.length },
        { label: "Leads", value: count(leads) },
        {
          label: "Converted",
          value: percent(
            rate(
              sum((row) => row.converted),
              leads,
            ),
          ),
        },
        {
          label: "Activated",
          value: percent(
            rate(
              sum((row) => row.activated),
              leads,
            ),
          ),
        },
      ]}
      keyboard={false}
      actionColumn={false}
      columns={COLUMNS}
      rows={rows}
      getId={(row) => row.key}
      getHref={(row) => hrefFor(row.key)}
      getLabel={(row) => `Show only ${row.label}`}
      sort={sort}
      onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
      renderCard={(row) => (
        <span className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-3">
            <span className="lead-style truncate">{row.label}</span>
            <span className="caption-style text-fg-secondary shrink-0 tabular-nums">
              {count(row.leads)} {row.leads === 1 ? "lead" : "leads"}
            </span>
          </span>
          <span className="caption-style text-fg-tertiary flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
            <span>Contacted {percent(rate(row.contacted, row.leads))}</span>
            <span>Demo {percent(rate(row.demo, row.leads))}</span>
            <span>Converted {percent(rate(row.converted, row.leads))}</span>
            <span>Activated {percent(rate(row.activated, row.leads))}</span>
            <span>Speed {duration(row.medianSpeedMs)}</span>
          </span>
        </span>
      )}
      empty={
        <EmptyState
          className="mx-auto max-w-lg"
          title={
            filtered
              ? "No leads match these filters"
              : "No leads in this period"
          }
          description="Sources appear once leads arrive."
        />
      }
    />
  );
}
