"use client";

import { useMemo } from "react";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Tooltip from "@/components/_ui/tooltip";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import { PageToolbar } from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import { OwnerCell, dash } from "@/features/accounts/record-cells";
import { HealthBadge } from "@/features/platform/health-badge";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { EXPANSION_SIGNALS, EXPANSION_SIGNAL_LABEL } from "@/lib/domain/health";
import { dateTime, relativeTime } from "@/lib/time";
import { useUiStore } from "@/stores/ui-store";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import type { HealthRow } from "./health-view";
import { routes } from "@/lib/routes";

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "signals", dir: "desc" };

function Signals({ row, max = 2 }: { row: HealthRow; max?: number }) {
  const shown = row.signals.slice(0, max);
  const rest = row.signals.slice(max);
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      {shown.map((signal) => (
        <Tooltip key={signal.id} content={signal.detail}>
          <span className="truncate">{signal.label}</span>
        </Tooltip>
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.map((signal) => signal.label).join(", ")}>
          <span className="text-fg-tertiary shrink-0">+{rest.length}</span>
        </Tooltip>
      )}
    </span>
  );
}

const COLUMNS: Column<HealthRow>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(11rem,1.2fr)",
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
    id: "signals",
    header: "Signals",
    width: "minmax(12rem,1.4fr)",
    defaultDir: "desc",
    sortValue: (row) => row.signals.length,
    cell: (row) => <Signals row={row} />,
  },
  {
    id: "detail",
    header: "Why now",
    width: "minmax(14rem,1.8fr)",
    minViewport: 900,
    cell: (row) => (
      <span
        className="text-fg-secondary truncate"
        title={row.signals.map((signal) => signal.detail).join(" · ")}
      >
        {row.signals[0]?.detail}
      </span>
    ),
  },
  {
    id: "score",
    header: "Health",
    width: "5.5rem",
    defaultDir: "desc",
    minViewport: 1000,
    sortValue: (row) => row.score,
    cell: (row) => <HealthBadge score={row.score} band={row.band} />,
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(8.75rem,0.9fr)",
    minViewport: 1100,
    sortValue: (row) => row.owner?.name ?? null,
    cell: (row) => <OwnerCell owner={row.owner} />,
  },
  {
    id: "activity",
    header: "Last active",
    width: "7.5rem",
    defaultDir: "desc",
    minViewport: 1280,
    sortValue: (row) => row.lastActivityAt,
    cell: (row) =>
      row.lastActivityAt ? (
        <span
          className="text-fg-secondary"
          title={dateTime(row.lastActivityAt)}
        >
          {relativeTime(row.lastActivityAt)}
        </span>
      ) : (
        dash
      ),
  },
];

/** Brands showing they're ready to buy more: sold out, repeat top-ups, a new marketplace, renewal, a growing team. */
export default function ExpansionView({
  rows,
}: {
  rows: HealthRow[] | undefined;
}) {
  const viewer = useViewer();
  const members = useMembers();
  const setPeek = useUiStore((state) => state.setPeek);
  const setCreate = useUiStore((state) => state.setCreate);
  const defaultOwner = viewer.role === "rep" ? MINE : ALL;
  const [signal, setSignal] = useUrlState("signal", ALL);
  const [owner, setOwner] = useUrlState("owner", defaultOwner);
  const [sortParam, setSortParam] = useUrlState(
    "esort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId && column.sortValue)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const scoped = useMemo(
    () =>
      rows?.filter(
        (row) =>
          owner === ALL ||
          row.owner?._id === (owner === MINE ? viewer._id : owner),
      ),
    [rows, owner, viewer._id],
  );
  const visible = useMemo(
    () =>
      scoped?.filter(
        (row) =>
          signal === ALL || row.signals.some((item) => item.id === signal),
      ),
    [scoped, signal],
  );
  const count = (id: string) =>
    scoped?.filter((row) => row.signals.some((item) => item.id === id))
      .length ?? 0;
  const filtered = signal !== ALL || owner !== defaultOwner;

  return (
    <>
      <PageToolbar>
        <FilterMenu
          label="Signal"
          value={signal}
          onChange={setSignal}
          options={[
            { value: ALL, label: "Any" },
            ...EXPANSION_SIGNALS.map((id) => ({
              value: id,
              label: `${EXPANSION_SIGNAL_LABEL[id]} (${count(id)})`,
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
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setSignal(ALL);
              setOwner(defaultOwner);
            }}
          >
            Clear
          </Button>
        )}
      </PageToolbar>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label="Expansion radar"
          columns={COLUMNS}
          rows={visible}
          getId={(row) => row._id}
          getHref={(row) => routes.account(row._id)}
          getLabel={(row) => row.account.name}
          sort={sort}
          onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
          onPeek={(row) => setPeek({ type: "account", id: row._id })}
          rowMenu={(row) => [
            {
              label: "New expansion deal",
              icon: TargetIcon,
              onSelect: () => setCreate({ type: "deal", accountId: row._id }),
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
                    {row.signals[0]?.detail}
                  </span>
                </span>
                <HealthBadge score={row.score} band={row.band} />
              </span>
              <span className="pl-11">
                <Signals row={row} max={3} />
              </span>
            </span>
          )}
          empty={
            <EmptyState
              title={
                rows && rows.length > 0
                  ? "No brands match"
                  : "No expansion signals yet"
              }
              description={
                rows && rows.length > 0
                  ? undefined
                  : "Brands show up here when a campaign sells out, they top up again, list on a new marketplace or grow their team."
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  href={`${routes.activation}?view=health`}
                >
                  View health
                </Button>
              }
            />
          }
        />
      </div>
    </>
  );
}
