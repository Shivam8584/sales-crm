"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import type { Column } from "@/components/data-table/types";
import { DealStageTag } from "@/features/deals/stage";
import { formatDay } from "@/features/deals/format";
import { OPEN_DEAL_STAGES, STAGE_PROBABILITY_BPS } from "@/lib/domain/forecast";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/domain/money";
import { useUrlState } from "@/hooks/use-url-state";
import ExportButton from "./export-button";
import { csvFilename, forecastCsv } from "./export";
import { count } from "./format";
import { ChartSkeleton, MetricTile, Reloading, ReportSection } from "./section";
import { useLatest } from "./use-report";
import { routes } from "@/lib/routes";

type Data = FunctionReturnType<typeof api.forecast.report>;
type Forecast = Data["currencies"][number];
type Stage = Forecast["stages"][number];
type Slipped = Data["slipped"][number];

const NO_SORT = { id: "stage", dir: "asc" } as const;

const ODDS = OPEN_DEAL_STAGES.map(
  (stage) =>
    `${DEAL_STAGE_LABEL[stage]} ${STAGE_PROBABILITY_BPS[stage] / 100}%`,
).join(", ");

const deals = (n: number) => `${count(n)} ${n === 1 ? "deal" : "deals"}`;

function stageColumns(money: (value: number) => string): Column<Stage>[] {
  return [
    {
      id: "stage",
      header: "Stage",
      width: "minmax(8rem,1.4fr)",
      cell: (row) => <DealStageTag stage={row.stage} />,
    },
    {
      id: "deals",
      header: "Deals",
      width: "minmax(4.5rem,0.6fr)",
      align: "end",
      cell: (row) => count(row.count),
    },
    {
      id: "chance",
      header: "Chance",
      width: "minmax(5rem,0.7fr)",
      align: "end",
      minViewport: 700,
      cell: (row) => `${STAGE_PROBABILITY_BPS[row.stage] / 100}%`,
    },
    {
      id: "value",
      header: "Value",
      width: "minmax(6rem,1fr)",
      align: "end",
      cell: (row) => money(row.amount),
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

function slippedColumns(): Column<Slipped>[] {
  return [
    {
      id: "deal",
      header: "Deal",
      width: "minmax(14rem,2fr)",
      cell: (row) => (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate" title={row.title}>
            {row.title}
          </span>
          <span className="text-fg-tertiary truncate">{row.accountName}</span>
        </span>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      width: "minmax(8rem,1fr)",
      minViewport: 900,
      cell: (row) => <span className="truncate">{row.ownerName}</span>,
    },
    {
      id: "stage",
      header: "Stage",
      width: "minmax(7rem,1fr)",
      cell: (row) => <DealStageTag stage={row.stage} />,
    },
    {
      id: "amount",
      header: "Amount",
      width: "minmax(6rem,1fr)",
      align: "end",
      cell: (row) => formatMoney(row.amount, { compact: true }),
    },
    {
      id: "close",
      header: "Close date",
      width: "minmax(6.5rem,1fr)",
      align: "end",
      minViewport: 700,
      cell: (row) => formatDay(row.closeDate),
    },
    {
      id: "late",
      header: "Late by",
      width: "minmax(5.5rem,0.8fr)",
      align: "end",
      cell: (row) => (
        <span className="text-danger">
          {count(row.daysLate)} {row.daysLate === 1 ? "day" : "days"}
        </span>
      ),
    },
  ];
}

/** Open pipeline by stage, commit against best case, slipped deals and where the month lands. */
export default function ForecastTab({
  owner,
  ownerParam,
}: {
  owner: string | undefined;
  ownerParam: string;
}) {
  const { data, loading } = useLatest(useQuery(api.forecast.report, { owner }));
  const [currencyParam, setCurrency] = useUrlState("currency", "");
  const selected =
    data?.currencies.find((item) => item.currency === currencyParam) ??
    data?.currencies[0];
  const currency = selected?.currency ?? DEFAULT_CURRENCY;
  const money = (value: number) =>
    formatMoney({ amount: value, currency }, { compact: true });
  const inDeals = `${routes.deals}?view=list&closed=hide${ownerParam === "all" ? "" : `&owner=${ownerParam}`}`;

  const goal = currency === DEFAULT_CURRENCY ? (data?.target ?? null) : null;
  const slipped =
    data?.slipped.filter((deal) => deal.amount.currency === currency) ?? [];

  return (
    <Reloading loading={loading && Boolean(data)}>
      <ReportSection
        id="forecast"
        title="Forecast"
        description="Open deals and where this month is likely to land, as of today."
        aside={
          <span className="flex items-center gap-2">
            {data && data.currencies.length > 1 && selected && (
              <FilterMenu
                label="Currency"
                value={selected.currency}
                onChange={setCurrency}
                options={data.currencies.map((item) => ({
                  value: item.currency,
                  label: item.currency,
                }))}
              />
            )}
            <ExportButton
              label="forecast"
              filename={csvFilename("forecast", "today")}
              disabled={!data?.currencies.length}
              rows={() => forecastCsv(data!)}
            />
          </span>
        }
        footnote={`Commit: open deals at Proposal or later closing from today to the end of this month. Best case: every open deal closing this month or next. Weighted: amount × the stage's chance to close (${ODDS}), a working assumption rather than a measured win rate. Expected landing: won this month plus weighted commit. Slipped deals are open with a close date before today and sit outside commit and best case. Amounts stay in their own currency.`}
      >
        {!data ? (
          <ChartSkeleton rows={2} />
        ) : !selected ? (
          <EmptyState
            className="mx-auto max-w-lg"
            title="No open deals"
            description="Open deals with an amount and a close date make up the forecast."
            action={
              <Button variant="secondary" size="sm" href={routes.deals}>
                Open deals
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
            <MetricTile
              label="Won this month"
              value={money(selected.wonSoFar)}
            />
            <MetricTile
              label="Commit"
              value={money(selected.commit.amount)}
              detail={`${deals(selected.commit.count)} · ${money(selected.commit.weighted)} weighted`}
            />
            <MetricTile
              label="Expected landing"
              value={money(selected.landing)}
              detail={
                goal
                  ? `${Math.round((selected.landing / goal) * 100)}% of the ${money(goal)} goal`
                  : "Won plus weighted commit"
              }
            />
            <MetricTile
              label="Best case"
              value={money(selected.bestCase.amount)}
              detail={deals(selected.bestCase.count)}
            />
          </div>
        )}
      </ReportSection>

      {selected && (
        <ReportSection
          id="open-pipeline"
          title="Open pipeline"
          description="Every open deal by stage, whatever its close date."
        >
          <div className="flex flex-col">
            <DataTable
              label="Open pipeline by stage"
              keyboard={false}
              actionColumn={false}
              stickyFirstColumn={false}
              columns={stageColumns(money)}
              rows={selected.stages}
              getId={(row) => row.stage}
              getHref={() => inDeals}
              getLabel={(row) => `Open ${DEAL_STAGE_LABEL[row.stage]} deals`}
              sort={NO_SORT}
              onSortChange={() => {}}
              footer={[
                {
                  label: "Open deals",
                  value: count(
                    selected.stages.reduce((sum, row) => sum + row.count, 0),
                  ),
                },
                {
                  label: "Value",
                  value: money(
                    selected.stages.reduce((sum, row) => sum + row.amount, 0),
                  ),
                },
                {
                  label: "Weighted",
                  value: money(
                    selected.stages.reduce((sum, row) => sum + row.weighted, 0),
                  ),
                },
              ]}
              renderCard={(row) => (
                <span className="flex items-center justify-between gap-3">
                  <DealStageTag stage={row.stage} />
                  <span className="caption-style text-fg-secondary tabular-nums">
                    {deals(row.count)} · {money(row.amount)} ·{" "}
                    {money(row.weighted)} weighted
                  </span>
                </span>
              )}
              empty={null}
            />
          </div>
        </ReportSection>
      )}

      {selected && selected.slipped.count > 0 && (
        <ReportSection
          id="slipped"
          title="Slipped deals"
          description="Open deals past their close date, most overdue first. Move the date or close them out."
          aside={
            <Button variant="ghost" size="xs" href={`${inDeals}&close=overdue`}>
              All slipped
            </Button>
          }
        >
          <div className="flex flex-col">
            <DataTable
              label="Slipped deals"
              keyboard={false}
              actionColumn={false}
              columns={slippedColumns()}
              rows={slipped}
              getId={(row) => row._id}
              getHref={(row) => routes.deal(row._id)}
              getLabel={(row) => `Open ${row.title}`}
              sort={{ id: "late", dir: "desc" }}
              onSortChange={() => {}}
              footer={[
                { label: "Slipped", value: count(selected.slipped.count) },
                { label: "Value", value: money(selected.slipped.amount) },
              ]}
              renderCard={(row) => (
                <span className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="lead-style truncate">{row.title}</span>
                    <span className="caption-style text-danger shrink-0 tabular-nums">
                      {count(row.daysLate)}d late
                    </span>
                  </span>
                  <span className="caption-style text-fg-tertiary flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                    <span>{row.accountName}</span>
                    <span>{DEAL_STAGE_LABEL[row.stage]}</span>
                    <span>{formatMoney(row.amount, { compact: true })}</span>
                  </span>
                </span>
              )}
              empty={null}
            />
          </div>
        </ReportSection>
      )}
    </Reloading>
  );
}
