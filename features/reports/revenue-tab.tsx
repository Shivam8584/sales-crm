"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import type { Period } from "@/convex/lib/reports";
import { useUrlState } from "@/hooks/use-url-state";
import { bpsLabel, PROPOSAL_CURRENCY } from "@/lib/domain/pricing";
import { cn } from "@/lib/utils";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import NoteIcon from "@/public/assets/icons/note.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";
import ExportButton from "./export-button";
import { csvFilename, revenueCsv } from "./export";
import { amount, count, monthLabel, percent, signed, trend } from "./format";
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

type RevenueData = FunctionReturnType<typeof api.reports.revenue>;
type Policy = RevenueData["policy"];
type AccountRow = RevenueData["byAccount"][number];
type RepRow = RevenueData["byRep"][number];

const inr = (value: number) => amount(value, PROPOSAL_CURRENCY);

type Band = { label: string; text: string };

function marginBand(rate: number | null, policy: Policy): Band | null {
  if (rate === null) return null;
  if (rate * 10_000 < policy.marginFloorBps) {
    return { label: "Below floor", text: "text-danger" };
  }
  if (rate * 10_000 < policy.approvalBps) {
    return { label: "Needs approval", text: "text-warning" };
  }
  return { label: "Within policy", text: "text-success" };
}

function MarginCell({ rate, policy }: { rate: number | null; policy: Policy }) {
  const band = marginBand(rate, policy);
  return (
    <span className={cn("tabular-nums", band?.text)} title={band?.label}>
      {percent(rate)}
    </span>
  );
}

function sortFrom(param: string, ids: string[], fallback: SortState) {
  const [id, dir] = param.split(":");
  return {
    id: ids.includes(id) ? id : fallback.id,
    dir: dir === "asc" ? "asc" : "desc",
  } satisfies SortState;
}

function figureColumns<T extends AccountRow | RepRow>(
  policy: Policy,
): Column<T>[] {
  return [
    {
      id: "proposals",
      header: "Proposals",
      width: "minmax(5.5rem,0.8fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.count,
      cell: (row) => count(row.count),
    },
    {
      id: "billed",
      header: "Billed",
      width: "minmax(6rem,1fr)",
      align: "end",
      defaultDir: "desc",
      minViewport: 700,
      sortValue: (row) => row.brandCharge,
      cell: (row) => inr(row.brandCharge),
    },
    {
      id: "take",
      header: "Take",
      width: "minmax(6rem,1fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.take,
      cell: (row) => <span className="font-medium">{inr(row.take)}</span>,
    },
    {
      id: "margin",
      header: "Margin",
      width: "minmax(5rem,0.8fr)",
      align: "end",
      defaultDir: "desc",
      sortValue: (row) => row.marginRate,
      cell: (row) => <MarginCell rate={row.marginRate} policy={policy} />,
    },
    {
      id: "below",
      header: "Below floor",
      width: "minmax(6rem,0.8fr)",
      align: "end",
      defaultDir: "desc",
      minViewport: 900,
      sortValue: (row) => row.belowFloor,
      cell: (row) => (
        <span className={cn(row.belowFloor > 0 && "text-danger")}>
          {count(row.belowFloor)}
        </span>
      ),
    },
  ];
}

const DEFAULT_SORT: SortState = { id: "take", dir: "desc" };

/** Take per month, as a bar per month with the blended margin beside it. */
function MonthlyChart({ data }: { data: RevenueData }) {
  const most = Math.max(1, ...data.monthly.map((month) => month.take));
  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
      <div
        aria-hidden
        className="caption-style text-fg-tertiary grid grid-cols-[4.5rem_minmax(0,1fr)_5rem_3.5rem] gap-x-4 sm:grid-cols-[6rem_minmax(0,1fr)_6rem_5rem_5rem]"
      >
        <span>Month</span>
        <span />
        <span className="text-right">Take</span>
        <span className="text-right">Margin</span>
        <span className="text-right max-sm:hidden">Proposals</span>
      </div>
      <ol className="flex flex-col gap-2" aria-label="Take by month">
        {data.monthly.map((month) => (
          <li
            key={month.month}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_5rem_3.5rem] items-center gap-x-4 sm:grid-cols-[6rem_minmax(0,1fr)_6rem_5rem_5rem]"
          >
            <span className="lead-style truncate">
              {monthLabel(month.month)}
            </span>
            <span
              aria-hidden
              className="bg-overlay-3 flex h-3.5 items-center overflow-hidden rounded-xs px-0.5"
            >
              <span
                className="bg-success h-2.5 rounded-xs"
                style={{ width: `${(month.take / most) * 100}%` }}
              />
            </span>
            <span
              className={cn(
                "lead-style text-right font-medium tabular-nums",
                month.count === 0 && "text-fg-tertiary font-normal",
              )}
            >
              {month.count === 0 ? "—" : inr(month.take)}
            </span>
            <span className="lead-style text-right">
              <span className="sr-only">blended margin </span>
              <MarginCell rate={month.marginRate} policy={data.policy} />
            </span>
            <span
              className={cn(
                "lead-style text-fg-secondary text-right tabular-nums max-sm:hidden",
                month.count === 0 && "text-fg-tertiary",
              )}
            >
              {count(month.count)}
              <span className="sr-only"> proposals</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Accepted proposals' take and margin against the pricing policy. */
export default function RevenueTab({
  period,
  owner,
}: {
  period: Period;
  owner: string | undefined;
}) {
  const { data, loading } = useLatest(
    useQuery(api.reports.revenue, { period, owner }),
  );
  const [accountSortParam, setAccountSort] = useUrlState(
    "asort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [repSortParam, setRepSort] = useUrlState(
    "rsort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );

  const policy = data?.policy;
  const accountColumns: Column<AccountRow>[] = policy
    ? [
        {
          id: "account",
          header: "Account",
          width: "minmax(12rem,2fr)",
          sortValue: (row) => row.name,
          cell: (row) => (
            <span className="truncate" title={row.name}>
              {row.name}
            </span>
          ),
        },
        ...figureColumns<AccountRow>(policy),
      ]
    : [];
  const repColumns: Column<RepRow>[] = policy
    ? [
        {
          id: "rep",
          header: "Rep",
          width: "minmax(11rem,2fr)",
          sortValue: (row) => row.name ?? "",
          cell: (row) => (
            <>
              <Avatar name={row.name ?? "?"} />
              <span className="truncate">{row.name}</span>
            </>
          ),
        },
        ...figureColumns<RepRow>(policy),
      ]
    : [];

  const current = data?.current;
  const band =
    data && current ? marginBand(current.marginRate, data.policy) : null;
  const empty =
    data &&
    data.current.count === 0 &&
    data.previous.count === 0 &&
    data.monthly.every((month) => month.count === 0);
  const rateChange =
    current?.marginRate != null && data?.previous.marginRate != null
      ? signed(
          Math.round((current.marginRate - data.previous.marginRate) * 100),
          " pts",
        )
      : "—";

  const totalsFooter = data
    ? [
        { label: "Proposals", value: count(data.current.count) },
        { label: "Billed", value: inr(data.current.brandCharge) },
        { label: "Take", value: inr(data.current.take) },
        { label: "Margin", value: percent(data.current.marginRate) },
      ]
    : undefined;

  const card = (name: string | null, row: AccountRow | RepRow) => (
    <span className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="lead-style truncate font-medium">{name}</span>
        <span className="lead-style shrink-0 font-medium tabular-nums">
          {inr(row.take)}
        </span>
      </span>
      <span className="caption-style text-fg-tertiary flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
        <span>
          {count(row.count)} {row.count === 1 ? "proposal" : "proposals"}
        </span>
        <span>Billed {inr(row.brandCharge)}</span>
        <span>Margin {percent(row.marginRate)}</span>
      </span>
    </span>
  );

  return (
    <Reloading loading={loading && Boolean(data)}>
      <ReportSection
        id="revenue"
        title="Revenue"
        description="Accepted proposals in the period, against the period before."
        footnote={
          data && (
            <>
              Take: what Hypedrive keeps from an accepted proposal (order and
              bonus fees plus margin, after coupons and commissions), estimated
              at full slots. Billed: the all-in brand price before GST. Blended
              margin: total margin ÷ total billed. Each proposal is priced under
              the policy it was sent with; the floor (
              {bpsLabel(data.policy.marginFloorBps)}) and approval threshold (
              {bpsLabel(data.policy.approvalBps)}) shown are today&apos;s, from
              Settings → Workspace. Months and periods follow the date the
              proposal was accepted.
            </>
          )
        }
      >
        <Panel className="px-4 py-4 sm:px-5">
          {!data || !current ? (
            <KpisSkeleton />
          ) : empty ? (
            <EmptyState
              className="mx-auto max-w-lg"
              icon={WalletIcon}
              title="No accepted proposals yet"
              description="When a brand accepts a proposal from the deal desk, its take and margin show here by month, account and rep."
              action={
                <Button variant="secondary" size="sm" href="/deals">
                  Open deals
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <MetricTile
                icon={WalletIcon}
                label="Take"
                value={inr(current.take)}
                delta={
                  <Delta
                    value={
                      current.take === data.previous.take
                        ? "±0"
                        : `${current.take > data.previous.take ? "+" : "−"}${inr(Math.abs(current.take - data.previous.take))}`
                    }
                    trend={trend(current.take, data.previous.take)}
                  />
                }
              />
              <MetricTile
                icon={NoteIcon}
                label="Billed"
                value={inr(current.brandCharge)}
                detail={`${count(current.count)} accepted ${current.count === 1 ? "proposal" : "proposals"}`}
              />
              <MetricTile
                icon={TargetIcon}
                label="Blended margin"
                value={
                  <span className={band?.text}>
                    {percent(current.marginRate)}
                  </span>
                }
                detail={
                  band
                    ? `${band.label} · floor ${bpsLabel(data.policy.marginFloorBps)}`
                    : "Nothing billed yet"
                }
                delta={
                  <Delta
                    value={rateChange}
                    trend={trend(current.marginRate, data.previous.marginRate)}
                  />
                }
              />
              <MetricTile
                icon={AlertIcon}
                label="Under the floor"
                value={count(current.belowFloor)}
                detail={`${count(current.belowApproval)} under ${bpsLabel(data.policy.approvalBps)} · ${count(current.approved)} approved`}
                tone={current.belowFloor > 0 ? "danger" : undefined}
              />
            </div>
          )}
        </Panel>
      </ReportSection>

      {!empty && (
        <ReportSection
          id="monthly"
          title="Take by month"
          description="Last six months, by the month each proposal was accepted. The period filter doesn't apply."
          aside={
            <ExportButton
              label="monthly take"
              filename={csvFilename("take-by-month", period)}
              disabled={!data}
              rows={() => revenueCsv.monthly(data!)}
            />
          }
        >
          <Panel>
            {!data ? <ChartSkeleton rows={6} /> : <MonthlyChart data={data} />}
          </Panel>
        </ReportSection>
      )}

      {data && !empty && (
        <>
          <ReportSection
            id="by-account"
            title="By account"
            description="Accepted in the period. Select an account to open its deals."
            aside={
              <ExportButton
                label="take by account"
                filename={csvFilename("take-by-account", period)}
                disabled={data.byAccount.length === 0}
                rows={() => revenueCsv.byAccount(data)}
              />
            }
          >
            <Panel className="flex flex-col">
              <DataTable
                label="Take by account"
                keyboard={false}
                actionColumn={false}
                columns={accountColumns}
                rows={data.byAccount}
                getId={(row) => row.key}
                getHref={(row) => `/accounts/${row.key}?tab=deals`}
                getLabel={(row) => `Open ${row.name}`}
                sort={sortFrom(
                  accountSortParam,
                  accountColumns.map((column) => column.id),
                  DEFAULT_SORT,
                )}
                onSortChange={(next) =>
                  setAccountSort(`${next.id}:${next.dir}`)
                }
                footer={totalsFooter}
                renderCard={(row) => card(row.name, row)}
                empty={
                  <EmptyState
                    className="mx-auto max-w-lg"
                    icon={WalletIcon}
                    title="Nothing accepted in this period"
                    description="Pick a longer period to see take by account."
                  />
                }
              />
            </Panel>
          </ReportSection>

          <ReportSection
            id="by-rep"
            title="By rep"
            description="Accepted in the period, by deal owner. Select a rep to open their deals."
            aside={
              <ExportButton
                label="take by rep"
                filename={csvFilename("take-by-rep", period)}
                disabled={data.byRep.length === 0}
                rows={() => revenueCsv.byRep(data)}
              />
            }
          >
            <Panel className="flex flex-col">
              <DataTable
                label="Take by rep"
                keyboard={false}
                actionColumn={false}
                columns={repColumns}
                rows={data.byRep}
                getId={(row) => row.key}
                getHref={(row) => `/deals?owner=${row.key}`}
                getLabel={(row) => `Open ${row.name ?? "their"} deals`}
                sort={sortFrom(
                  repSortParam,
                  repColumns.map((column) => column.id),
                  DEFAULT_SORT,
                )}
                onSortChange={(next) => setRepSort(`${next.id}:${next.dir}`)}
                footer={totalsFooter}
                renderCard={(row) => card(row.name, row)}
                empty={
                  <EmptyState
                    className="mx-auto max-w-lg"
                    icon={WalletIcon}
                    title="Nothing accepted in this period"
                    description="Pick a longer period to see take by rep."
                  />
                }
              />
            </Panel>
          </ReportSection>
        </>
      )}
    </Reloading>
  );
}
