"use client";

import { useMemo } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
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
import {
  HEALTH_BANDS,
  HEALTH_BAND_LABEL,
  type HealthBand,
} from "@/lib/domain/health";
import { formatMoney } from "@/lib/domain/money";
import { ACTIVATION_STEP_LABEL } from "@/lib/domain/platform";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { routes } from "@/lib/routes";

export type HealthRow = FunctionReturnType<
  typeof api.activation.health
>[number];

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "score", dir: "asc" };

const WALLET_TONE = {
  ok: undefined,
  low: "text-warning",
  negative: "text-danger",
} as const;

function Weakest({ row }: { row: HealthRow }) {
  const [first] = row.weakest;
  if (!first) {
    return <span className="text-fg-tertiary truncate">Nothing to fix</span>;
  }
  return (
    <Tooltip
      content={row.weakest
        .map((factor) => `${factor.label}: ${factor.detail}`)
        .join(" · ")}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            first.tone === "bad" ? "bg-danger" : "bg-warning",
          )}
        />
        <span className="text-fg-secondary shrink-0">{first.label}</span>
        <span className="text-fg-tertiary truncate">{first.detail}</span>
      </span>
    </Tooltip>
  );
}

const COLUMNS: Column<HealthRow>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(11rem,1.3fr)",
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
    id: "score",
    header: "Health",
    width: "8.5rem",
    sortValue: (row) => row.score,
    cell: (row) => <HealthBadge score={row.score} band={row.band} showBand />,
  },
  {
    id: "weakest",
    header: "Weakest factor",
    width: "minmax(13rem,1.6fr)",
    cell: (row) => <Weakest row={row} />,
  },
  {
    id: "balance",
    header: "Balance",
    width: "7.5rem",
    align: "end",
    minViewport: 1000,
    defaultDir: "desc",
    sortValue: (row) => row.balance?.amount ?? null,
    cell: (row) =>
      row.balance ? (
        <span className={cn("tabular-nums", WALLET_TONE[row.wallet])}>
          {formatMoney(row.balance)}
        </span>
      ) : row.wallet !== "ok" ? (
        <span className={WALLET_TONE[row.wallet]}>
          {row.wallet === "low" ? "Low" : "Negative"}
        </span>
      ) : (
        dash
      ),
  },
  {
    id: "live",
    header: "Live",
    width: "4.5rem",
    align: "end",
    minViewport: 1000,
    defaultDir: "desc",
    sortValue: (row) => row.live,
    cell: (row) => (
      <span
        className={cn("tabular-nums", row.live === 0 && "text-fg-tertiary")}
      >
        {row.live}
      </span>
    ),
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
    id: "synced",
    header: "Synced",
    width: "8.5rem",
    minViewport: 1280,
    defaultDir: "desc",
    sortValue: (row) => row.fetchedAt,
    cell: (row) =>
      row.fetchedAt ? (
        <span
          className="text-fg-secondary truncate"
          title={dateTime(row.fetchedAt)}
        >
          {relativeTime(row.fetchedAt)}
        </span>
      ) : (
        <span className="text-fg-tertiary truncate">Events only</span>
      ),
  },
];

/** Every linked brand's health score, riskiest first. */
export default function HealthView({
  rows,
}: {
  rows: HealthRow[] | undefined;
}) {
  const viewer = useViewer();
  const members = useMembers();
  const setPeek = useUiStore((state) => state.setPeek);
  const defaultOwner = viewer.role === "rep" ? MINE : ALL;
  const [band, setBand] = useUrlState("band", ALL);
  const [owner, setOwner] = useUrlState("owner", defaultOwner);
  const [sortParam, setSortParam] = useUrlState(
    "hsort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId && column.sortValue)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "desc" ? "desc" : "asc",
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
    () => scoped?.filter((row) => band === ALL || row.band === band),
    [scoped, band],
  );
  const counts = useMemo(() => {
    const result = new Map<HealthBand, number>();
    for (const row of scoped ?? []) {
      result.set(row.band, (result.get(row.band) ?? 0) + 1);
    }
    return result;
  }, [scoped]);
  const average = visible?.length
    ? Math.round(
        visible.reduce((sum, row) => sum + row.score, 0) / visible.length,
      )
    : null;
  const filtered = band !== ALL || owner !== defaultOwner;

  return (
    <>
      <PageToolbar>
        <FilterMenu
          label="Band"
          value={band}
          onChange={setBand}
          options={[
            { value: ALL, label: "Any" },
            ...HEALTH_BANDS.map((item) => ({
              value: item,
              label: `${HEALTH_BAND_LABEL[item]} (${counts.get(item) ?? 0})`,
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
              setBand(ALL);
              setOwner(defaultOwner);
            }}
          >
            Clear
          </Button>
        )}
      </PageToolbar>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label="Account health"
          columns={COLUMNS}
          rows={visible}
          getId={(row) => row._id}
          getHref={(row) => routes.account(row._id)}
          getLabel={(row) => row.account.name}
          sort={sort}
          onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
          onPeek={(row) => setPeek({ type: "account", id: row._id })}
          footer={[
            { label: "Brands", value: visible?.length ?? 0 },
            {
              label: "Average score",
              value: average === null ? dash : average,
            },
            {
              label: "At risk",
              value: (
                <span className={cn(counts.get("at_risk") && "text-danger")}>
                  {counts.get("at_risk") ?? 0}
                </span>
              ),
            },
            {
              label: "With expansion signals",
              value:
                scoped?.filter((row) => row.signals.length > 0).length ?? 0,
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
                    {row.stage
                      ? ACTIVATION_STEP_LABEL[row.stage]
                      : "On Hypedrive"}
                    {row.owner ? ` · ${row.owner.name}` : ""}
                  </span>
                </span>
                <HealthBadge score={row.score} band={row.band} />
              </span>
              <span className="caption-style flex min-w-0 items-center justify-between gap-3 pl-11">
                <Weakest row={row} />
                <span className="text-fg-secondary">
                  {HEALTH_BAND_LABEL[row.band]}
                </span>
              </span>
            </span>
          )}
          empty={
            rows && rows.length > 0 ? (
              <EmptyState
                title="No brands match"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setBand(ALL);
                      setOwner(ALL);
                    }}
                  >
                    Show every brand
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No brands on Hypedrive yet"
                description="Health shows up once a brand creates its organisation."
                action={
                  <Button variant="secondary" size="sm" href={routes.accounts}>
                    View accounts
                  </Button>
                }
              />
            )
          }
        />
      </div>
    </>
  );
}
