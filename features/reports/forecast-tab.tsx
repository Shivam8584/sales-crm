"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Tag from "@/components/_ui/tag";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import type { Column, SortState } from "@/components/data-table/types";
import { DealStageTag } from "@/features/deals/stage";
import {
  OPEN_DEAL_STAGES,
  STAGE_PROBABILITY_BPS,
  type OpenDealStage,
} from "@/lib/domain/forecast";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";
import type { Currency } from "@/lib/domain/money";
import { useUrlState } from "@/hooks/use-url-state";
import { formatDay } from "@/features/deals/format";
import { cn } from "@/lib/utils";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";
import ExportButton from "./export-button";
import { csvFilename, forecastCsv, slippedCsv } from "./export";
import { amount, count, monthLabel } from "./format";
import {
  ChartSkeleton,
  MetricTile,
  Panel,
  Reloading,
  ReportSection,
} from "./section";
import { KpisSkeleton } from "./kpis";
import { useLatest } from "./use-report";

type ForecastData = FunctionReturnType<typeof api.reports.forecast>;
type CurrencyForecast = ForecastData["currencies"][number];
type Bucket = CurrencyForecast["buckets"][number];
type Slipped = ForecastData["slipped"][number];

/** Stage colours match the deal stage tags. */
export const STAGE_FILL: Record<OpenDealStage, string> = {
  discovery: "bg-(--tag-blue-text)",
  demo: "bg-(--tag-purple-text)",
  proposal: "bg-(--tag-amber-text)",
  onboarding: "bg-(--tag-teal-text)",
};

const SPECIAL_LABEL: Record<string, string> = {
  slipped: "Slipped",
  later: "Later",
  none: "No close date",
};

export const bucketLabel = (key: string) =>
  SPECIAL_LABEL[key] ?? monthLabel(key);

const probability = (stage: OpenDealStage) =>
  `${STAGE_PROBABILITY_BPS[stage] / 100}%`;

function withOwner(href: string, ownerParam: string) {
  if (ownerParam === "all") return href;
  return `${href}${href.includes("?") ? "&" : "?"}owner=${ownerParam}`;
}

function bucketHref(key: string, today: string, ownerParam: string) {
  const close =
    key === "slipped"
      ? "close=overdue"
      : key === "none"
        ? "close=none"
        : key === today.slice(0, 7)
          ? "close=month"
          : "close=all";
  return withOwner(`/deals?view=list&closed=hide&${close}`, ownerParam);
}

function StageLegend() {
  return (
    <ul
      aria-label="Stages and their win probability"
      className="caption-style text-fg-secondary flex flex-wrap gap-x-4 gap-y-1.5"
    >
      {OPEN_DEAL_STAGES.map((stage) => (
        <li key={stage} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2 rounded-xs", STAGE_FILL[stage])}
          />
          {DEAL_STAGE_LABEL[stage]}
          <span className="text-fg-tertiary tabular-nums">
            {probability(stage)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Horizontal stacked bars: one per close month, split by stage. */
function ForecastChart({
  data,
  today,
  ownerParam,
}: {
  data: CurrencyForecast;
  today: string;
  ownerParam: string;
}) {
  const shown = data.buckets.filter(
    (bucket) => bucket.count > 0 || !(bucket.key in SPECIAL_LABEL),
  );
  const most = Math.max(1, ...shown.map((bucket) => bucket.total));
  const money = (value: number) =>
    value === 0 ? (
      <span className="text-fg-tertiary">
        —<span className="sr-only">none</span>
      </span>
    ) : (
      amount(value, data.currency)
    );
  const plain = (value: number) => amount(value, data.currency);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
      <StageLegend />
      <div
        aria-hidden
        className="caption-style text-fg-tertiary hidden grid-cols-[7.5rem_minmax(0,1fr)_5rem_5rem_5rem] gap-x-4 sm:grid"
      >
        <span>Close month</span>
        <span>Open value by stage</span>
        <span className="text-right">Best case</span>
        <span className="text-right">Commit</span>
        <span className="text-right">Weighted</span>
      </div>
      <ul
        className="flex flex-col gap-3 sm:gap-1"
        aria-label="Open pipeline by close month"
      >
        {shown.map((bucket) => (
          <li
            key={bucket.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-1 sm:grid-cols-[7.5rem_minmax(0,1fr)_5rem_5rem_5rem]"
          >
            <Link
              href={bucketHref(bucket.key, today, ownerParam)}
              className={cn(
                "lead-style hover:text-foreground decoration-fg-tertiary/60 hover:decoration-fg-secondary focus-visible:ring-ring truncate rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2",
                bucket.key === "slipped" && bucket.count > 0 && "text-danger",
              )}
            >
              {bucketLabel(bucket.key)}
              <span className="sr-only">
                , {count(bucket.count)} {bucket.count === 1 ? "deal" : "deals"}
                {bucket.stages
                  .filter((slice) => slice.count > 0)
                  .map(
                    (slice) =>
                      `, ${DEAL_STAGE_LABEL[slice.stage]} ${plain(slice.amount)}`,
                  )
                  .join("")}
              </span>
            </Link>
            <span className="lead-style text-right font-medium tabular-nums sm:hidden">
              {money(bucket.total)}
            </span>
            <span
              aria-hidden
              className="bg-overlay-3 col-span-2 flex h-3.5 items-center overflow-hidden rounded-xs px-0.5 sm:col-span-1"
            >
              <span
                className="flex h-2.5 gap-0.5"
                style={{ width: `${(bucket.total / most) * 100}%` }}
              >
                {bucket.stages
                  .filter((slice) => slice.amount > 0)
                  .map((slice) => (
                    <span
                      key={slice.stage}
                      title={`${DEAL_STAGE_LABEL[slice.stage]}: ${plain(slice.amount)} · ${count(slice.count)} ${slice.count === 1 ? "deal" : "deals"}`}
                      className={cn(
                        "h-full min-w-0.5 rounded-xs",
                        STAGE_FILL[slice.stage],
                      )}
                      style={{ flexGrow: slice.amount, flexBasis: 0 }}
                    />
                  ))}
              </span>
            </span>
            <span className="lead-style hidden text-right font-medium tabular-nums sm:block">
              {money(bucket.total)}
            </span>
            <span className="lead-style text-fg-secondary hidden tabular-nums sm:contents">
              <span className="sm:text-right">
                <span className="sr-only">Commit </span>
                {money(bucket.commit)}
              </span>
              <span className="sm:text-right">
                <span className="sr-only">Weighted </span>
                {money(bucket.weighted)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function bucketColumns(currency: Currency): Column<Bucket>[] {
  const money = (value: number) => amount(value, currency);
  return [
    {
      id: "month",
      header: "Close month",
      width: "minmax(9rem,1.3fr)",
      cell: (row) => (
        <span
          className={cn(
            "truncate",
            row.key === "slipped" && row.count > 0 && "text-danger",
          )}
        >
          {bucketLabel(row.key)}
        </span>
      ),
    },
    {
      id: "deals",
      header: "Deals",
      width: "4.5rem",
      align: "end",
      cell: (row) => count(row.count),
    },
    ...OPEN_DEAL_STAGES.map(
      (stage): Column<Bucket> => ({
        id: stage,
        header: DEAL_STAGE_LABEL[stage],
        width: "minmax(6rem,1fr)",
        align: "end",
        minViewport: 1200,
        cell: (row) => {
          const value = row.stages.find((slice) => slice.stage === stage)!;
          return (
            <span className={cn(value.amount === 0 && "text-fg-tertiary")}>
              {value.amount === 0 ? "—" : money(value.amount)}
            </span>
          );
        },
      }),
    ),
    {
      id: "total",
      header: "Best case",
      width: "minmax(6rem,1fr)",
      align: "end",
      cell: (row) => money(row.total),
    },
    {
      id: "commit",
      header: "Commit",
      width: "minmax(6rem,1fr)",
      align: "end",
      cell: (row) => money(row.commit),
    },
    {
      id: "weighted",
      header: "Weighted",
      width: "minmax(6rem,1fr)",
      align: "end",
      cell: (row) => money(row.weighted),
    },
  ];
}

const SLIPPED_SORT: SortState = { id: "late", dir: "desc" };

const SLIPPED_COLUMNS: Column<Slipped>[] = [
  {
    id: "deal",
    header: "Deal",
    width: "minmax(14rem,2fr)",
    sortValue: (row) => row.title,
    cell: (row) => (
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate" title={row.title}>
          {row.title}
        </span>
        <span className="text-fg-tertiary truncate" title={row.accountName}>
          {row.accountName}
        </span>
      </span>
    ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(9rem,1fr)",
    minViewport: 900,
    sortValue: (row) => row.ownerName ?? "",
    cell: (row) => (
      <>
        <Avatar name={row.ownerName ?? "?"} size="xs" />
        <span className="truncate">{row.ownerName}</span>
      </>
    ),
  },
  {
    id: "stage",
    header: "Stage",
    width: "minmax(8rem,1fr)",
    sortValue: (row) => OPEN_DEAL_STAGES.indexOf(row.stage),
    cell: (row) => (
      <span className="flex items-center gap-1">
        <DealStageTag stage={row.stage} />
        {row.commit && (
          <Tag tone="green" size="xs">
            Commit
          </Tag>
        )}
      </span>
    ),
  },
  {
    id: "amount",
    header: "Amount",
    width: "minmax(6rem,1fr)",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => row.amount.amount,
    cell: (row) => amount(row.amount.amount, row.amount.currency),
  },
  {
    id: "close",
    header: "Close date",
    width: "minmax(7rem,1fr)",
    align: "end",
    sortValue: (row) => row.closeDate,
    cell: (row) => formatDay(row.closeDate),
  },
  {
    id: "late",
    header: "Late by",
    width: "minmax(5.5rem,0.8fr)",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => row.daysLate,
    cell: (row) => (
      <span className="text-danger">
        {count(row.daysLate)} {row.daysLate === 1 ? "day" : "days"}
      </span>
    ),
  },
];

/** Open pipeline by close month, commit vs best case, weighted, and slipped deals. */
export default function ForecastTab({
  owner,
  ownerParam,
}: {
  owner: string | undefined;
  ownerParam: string;
}) {
  const { data, loading } = useLatest(
    useQuery(api.reports.forecast, { owner }),
  );
  const [currencyParam, setCurrency] = useUrlState("currency", "");
  const [sortParam, setSortParam] = useUrlState(
    "ssort",
    `${SLIPPED_SORT.id}:${SLIPPED_SORT.dir}`,
  );
  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: SLIPPED_COLUMNS.some((column) => column.id === sortId)
      ? sortId
      : SLIPPED_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const selected =
    data?.currencies.find((item) => item.currency === currencyParam) ??
    data?.currencies[0];
  const slipped =
    data && selected
      ? data.slipped.filter(
          (deal) => deal.amount.currency === selected.currency,
        )
      : [];
  const slippedTotal = slipped.reduce(
    (sum, deal) => sum + deal.amount.amount,
    0,
  );
  const money = (value: number) =>
    selected ? amount(value, selected.currency) : "—";

  return (
    <Reloading loading={loading && Boolean(data)}>
      <ReportSection
        id="forecast"
        title="Forecast"
        description="Open deals by expected close, as of today."
        aside={
          data &&
          data.currencies.length > 1 &&
          selected && (
            <FilterMenu
              label="Currency"
              value={selected.currency}
              onChange={setCurrency}
              options={data.currencies.map((item) => ({
                value: item.currency,
                label: item.currency,
              }))}
            />
          )
        }
      >
        <Panel className="px-4 py-4 sm:px-5">
          {!data ? (
            <KpisSkeleton />
          ) : !selected ? (
            <EmptyState
              className="mx-auto max-w-lg"
              icon={ClipboardIcon}
              title="No open deals"
              description="Open deals with an amount and a close date make up the forecast. Create a deal from an account to start one."
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
                label="Best case"
                value={money(selected.bestCase)}
                detail={`${count(selected.count)} open ${selected.count === 1 ? "deal" : "deals"}`}
              />
              <MetricTile
                icon={CheckCircleIcon}
                label="Commit"
                value={money(selected.commit)}
                detail={`${count(selected.commitCount)} ${selected.commitCount === 1 ? "deal" : "deals"} · proposal sent`}
              />
              <MetricTile
                icon={TargetIcon}
                label="Weighted"
                value={money(selected.weighted)}
                detail="By stage probability"
              />
              <MetricTile
                icon={AlertIcon}
                label="Slipped"
                value={count(slipped.length)}
                detail={
                  slipped.length > 0
                    ? `${money(slippedTotal)} past its close date`
                    : "None past close date"
                }
                tone={slipped.length > 0 ? "danger" : undefined}
              />
            </div>
          )}
        </Panel>
      </ReportSection>

      {(!data || selected) && (
        <ReportSection
          id="by-month"
          title="By close month"
          description="Open value per month, split by stage. Select a month to open those deals."
          aside={
            <ExportButton
              label="forecast"
              filename={csvFilename("forecast", "today")}
              disabled={!data}
              rows={() => forecastCsv(data!)}
            />
          }
          footnote={
            <>
              Best case: every open deal at full value. Commit: open deals whose
              current proposal is sent or accepted. Weighted: each deal&apos;s
              amount × its stage&apos;s chance to close (
              {OPEN_DEAL_STAGES.map(
                (stage, index) =>
                  `${index ? ", " : ""}${DEAL_STAGE_LABEL[stage]} ${probability(stage)}`,
              )}
              ), a working assumption rather than a measured win rate. Slipped:
              open deals whose close date has passed. Later: beyond the months
              shown. Amounts stay in their own currency.
            </>
          }
        >
          <Panel>
            {!data || !selected ? (
              <ChartSkeleton rows={6} />
            ) : (
              <ForecastChart
                data={selected}
                today={data.today}
                ownerParam={ownerParam}
              />
            )}
          </Panel>
          {data && selected && (
            <Panel className="flex flex-col">
              <DataTable
                label="Forecast by close month"
                keyboard={false}
                actionColumn={false}
                stickyFirstColumn={false}
                columns={bucketColumns(selected.currency)}
                rows={selected.buckets.filter((bucket) => bucket.count > 0)}
                getId={(row) => row.key}
                getHref={(row) => bucketHref(row.key, data.today, ownerParam)}
                getLabel={(row) => `Open deals for ${bucketLabel(row.key)}`}
                sort={{ id: "month", dir: "asc" }}
                onSortChange={() => {}}
                footer={[
                  { label: "Open deals", value: count(selected.count) },
                  { label: "Best case", value: money(selected.bestCase) },
                  { label: "Commit", value: money(selected.commit) },
                  { label: "Weighted", value: money(selected.weighted) },
                ]}
                renderCard={(row) => (
                  <span className="flex flex-col gap-1.5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="lead-style truncate font-medium">
                        {bucketLabel(row.key)}
                      </span>
                      <span className="caption-style text-fg-secondary shrink-0 tabular-nums">
                        {count(row.count)} {row.count === 1 ? "deal" : "deals"}
                      </span>
                    </span>
                    <span className="caption-style text-fg-tertiary flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                      <span>Best case {money(row.total)}</span>
                      <span>Commit {money(row.commit)}</span>
                      <span>Weighted {money(row.weighted)}</span>
                    </span>
                  </span>
                )}
                empty={null}
              />
            </Panel>
          )}
        </ReportSection>
      )}

      {slipped.length > 0 && (
        <ReportSection
          id="slipped"
          title="Slipped deals"
          description="Open deals past their close date. Move the date or close them out."
          aside={
            <ExportButton
              label="slipped deals"
              filename={csvFilename("slipped-deals", "today")}
              rows={() => slippedCsv(slipped)}
            />
          }
        >
          <Panel className="flex flex-col">
            <DataTable
              label="Slipped deals"
              keyboard={false}
              actionColumn={false}
              columns={SLIPPED_COLUMNS}
              rows={slipped}
              getId={(row) => row._id}
              getHref={(row) => `/deals/${row._id}`}
              getLabel={(row) => `Open ${row.title}`}
              sort={sort}
              onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
              footer={[
                { label: "Slipped", value: count(slipped.length) },
                { label: "Value", value: money(slippedTotal) },
              ]}
              renderCard={(row) => (
                <span className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="lead-style truncate font-medium">
                      {row.title}
                    </span>
                    <span className="caption-style text-danger shrink-0 tabular-nums">
                      {count(row.daysLate)}d late
                    </span>
                  </span>
                  <span className="caption-style text-fg-tertiary flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                    <span>{row.accountName}</span>
                    <span>{DEAL_STAGE_LABEL[row.stage]}</span>
                    <span>
                      {amount(row.amount.amount, row.amount.currency)}
                    </span>
                    <span>{row.ownerName}</span>
                  </span>
                </span>
              )}
              empty={null}
            />
          </Panel>
        </ReportSection>
      )}
    </Reloading>
  );
}
