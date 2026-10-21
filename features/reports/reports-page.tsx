"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import FilterMenu from "@/components/_common/filter-menu";
import {
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import {
  PERIODS,
  UNASSIGNED,
  type FunnelStepKey,
  type Period,
} from "@/convex/lib/reports";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";
import BarChartIcon from "@/public/assets/icons/bar-chart-10.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import ActivationChart from "./activation-section";
import { count, duration, range } from "./format";
import FunnelChart from "./funnel-chart";
import Kpis, { KpisSkeleton } from "./kpis";
import { PERIOD_LABEL } from "./periods";
import PipelineChart from "./pipeline-chart";
import { Panel, ReportSection } from "./section";
import SourceTable from "./source-table";
import SpeedSection from "./speed-section";
import ExportButton from "./export-button";
import { csvFilename, csvRows } from "./export";

type ReportData = FunctionReturnType<typeof api.reports.overview>;

const ALL = "all";
const MINE = "mine";
const DEFAULT_PERIOD: Period = "30d";

const STEP_LIST: Record<FunnelStepKey, string> = {
  lead: "/leads",
  contacted: "/leads?status=contacted",
  demo: "/leads?kind=demo",
  converted: "/leads?status=converted",
  signed_up: "/accounts?stage=signed_up",
  org_created: "/accounts?stage=org_created",
  funded: "/accounts?stage=funded",
  live: "/accounts?stage=live",
  activated: "/accounts?stage=activated",
};

/** Where the funnel leaks, which channels bring brands that activate, and how fast the team responds. */
export default function ReportsPage() {
  const viewer = useViewer();
  const members = useMembers();
  const params = useSearchParams();
  const [periodParam, setPeriod] = useUrlState("period", DEFAULT_PERIOD);
  const [source, setSource] = useUrlState("source", ALL);
  const [ownerParam, setOwner] = useUrlState("owner", ALL);
  const period = (PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : DEFAULT_PERIOD;
  const owner = ownerParam === MINE ? viewer._id : ownerParam;

  const live = useQuery(api.reports.overview, {
    period,
    source: source === ALL ? undefined : source,
    owner: owner === ALL ? undefined : owner,
  });
  // Keeps the last report on screen while a new period or filter loads.
  const [stale, setStale] = useState<ReportData>();
  if (live !== undefined && live !== stale) setStale(live);
  const report = live ?? stale;
  const loading = live === undefined;

  const filtered = source !== ALL || ownerParam !== ALL;

  function hrefWith(changes: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) query.set(key, value);
    return `/reports?${query}`;
  }

  function clearFilters() {
    setSource(ALL);
    setOwner(ALL);
  }

  function stepHref(key: FunnelStepKey) {
    const href = STEP_LIST[key];
    if (ownerParam !== MINE) return href;
    return `${href}${href.includes("?") ? "&" : "?"}owner=mine`;
  }

  const sourceOptions = [
    { value: ALL, label: "Any" },
    ...(report?.sources ?? []).map((item) => ({
      value: item.key,
      label: item.label,
    })),
  ];
  if (source !== ALL && !sourceOptions.some((item) => item.value === source)) {
    sourceOptions.push({
      value: source,
      label: source.replace(/^(utm|src):/, ""),
    });
  }

  const ownerOptions = [
    { value: ALL, label: "Anyone" },
    { value: MINE, label: "Me" },
    { value: UNASSIGNED, label: "Unassigned" },
    ...(members ?? [])
      .filter((member) => member._id !== viewer._id)
      .map((member) => ({ value: member._id, label: member.name })),
  ];

  return (
    <Page>
      <PageHeader
        title="Reports"
        meta={
          report && (
            <PageStatus tone="info">
              <span className="tabular-nums">
                {range(report.windows.current)}
              </span>
            </PageStatus>
          )
        }
      />
      <PageViews
        param="period"
        label="Period"
        value={period}
        onChange={(next) => setPeriod(next)}
        views={PERIODS.map((id) => ({ id, label: PERIOD_LABEL[id].long }))}
      />
      <PageToolbar>
        <FilterMenu
          label="Source"
          value={source}
          onChange={setSource}
          options={sourceOptions}
        />
        <FilterMenu
          label="Owner"
          value={ownerParam}
          onChange={setOwner}
          options={ownerOptions}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
        {report && (
          <span className="caption-style text-fg-tertiary ml-auto tabular-nums max-md:hidden">
            Compared with {range(report.windows.previous)}
          </span>
        )}
      </PageToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          aria-busy={loading}
          className={cn(
            "duration-base mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 transition-opacity sm:px-6",
            loading && report && "opacity-60",
          )}
        >
          <p className="sr-only" aria-live="polite">
            {report
              ? `${PERIOD_LABEL[period].long}, ${range(report.windows.current)}, compared with ${range(report.windows.previous)}`
              : "Loading report"}
          </p>
          <ReportSection
            id="overview"
            title="Overview"
            description={`${PERIOD_LABEL[period].long}, each figure against the period before.`}
          >
            <Panel className="px-4 py-4 sm:px-5">
              {report ? <Kpis report={report} /> : <KpisSkeleton />}
            </Panel>
          </ReportSection>

          <ReportSection
            id="funnel"
            title="Funnel"
            description="Where leads created in this period stopped. Select a step to open that list."
            aside={
              <ExportButton
                label="funnel"
                filename={csvFilename("funnel", period)}
                disabled={!report}
                rows={() => csvRows.funnel(report!)}
              />
            }
            footnote={
              <>
                Cohort: every lead created in the period, followed to today. A
                lead counts at every step up to the furthest one it has reached,
                so the funnel never grows; a self-serve signup counts as
                contacted and demoed. Platform steps come from Hypedrive events
                and the account stage. Recent cohorts have had less time to
                move, so compare like periods. A step links to today&apos;s list
                for it, not to the cohort.
              </>
            }
          >
            <Panel>
              {!report ? (
                <ChartSkeleton rows={10} />
              ) : report.funnel.steps[0].count === 0 ? (
                <EmptyState
                  className="mx-auto max-w-lg"
                  icon={BarChartIcon}
                  title={
                    filtered
                      ? "No leads match these filters"
                      : "No leads in this period"
                  }
                  description="Leads from the demo form, Cal.com bookings and platform signups are counted here. Each step fills in as reps make contact, book demos and brands go live on Hypedrive."
                  action={
                    filtered ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={clearFilters}
                      >
                        Clear filters
                      </Button>
                    ) : period !== "90d" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPeriod("90d")}
                      >
                        Show last 90 days
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" href="/leads">
                        Open leads
                      </Button>
                    )
                  }
                />
              ) : (
                <FunnelChart
                  funnel={report.funnel}
                  previous={report.previousFunnel}
                  hrefFor={stepHref}
                />
              )}
            </Panel>
            {report && report.direct.accounts > 0 && (
              <p className="lead-style text-fg-secondary border-border border-t px-4 py-3 leading-snug sm:px-5">
                Plus {count(report.direct.accounts)}{" "}
                {report.direct.accounts === 1 ? "account" : "accounts"} added
                directly, not from a lead:{" "}
                <span className="tabular-nums">
                  {count(report.direct.signedUp)} signed up ·{" "}
                  {count(report.direct.activated)} activated
                </span>
              </p>
            )}
          </ReportSection>

          <ReportSection
            id="sources"
            title="By source"
            description="Which channels bring brands that go on to activate. Select a source to narrow the whole report."
            aside={
              <ExportButton
                label="sources"
                filename={csvFilename("sources", period)}
                disabled={!report?.bySource.length}
                rows={() => csvRows.sources(report!)}
              />
            }
            footnote={
              <>
                Grouped by UTM source; without one, by how the lead arrived
                (Cal.com, platform, manual). Form leads with no UTM are Direct /
                unknown. Rates are shares of the source&apos;s leads that
                reached each step. Median speed is creation to first touch.
              </>
            }
          >
            <Panel className="flex flex-col">
              {report ? (
                <SourceTable
                  filtered={filtered}
                  rows={report.bySource}
                  hrefFor={(key) => hrefWith({ source: key })}
                />
              ) : (
                <ChartSkeleton rows={4} />
              )}
            </Panel>
          </ReportSection>

          <ReportSection
            id="speed"
            title="Speed to lead"
            description="How fast someone first works a new inbound lead."
            aside={
              <ExportButton
                label="speed to lead"
                filename={csvFilename("speed-to-lead", period)}
                disabled={!report?.speedByOwner.length}
                rows={() => csvRows.speed(report!)}
              />
            }
            footnote={
              report && (
                <>
                  Time from a lead arriving to its first touch: a call, email or
                  WhatsApp started from the CRM, a logged activity, or moving it
                  to a worked status. Leads added by hand are left out. Within
                  SLA is touched within {duration(report.slaMs)}, out of leads
                  that were touched or whose {duration(report.slaMs)} has run
                  out. p90: 9 in 10 leads were touched at least this fast.
                </>
              )
            }
          >
            {report ? (
              <SpeedSection
                speed={report.speed}
                owners={report.speedByOwner}
                slaMs={report.slaMs}
                hrefFor={(id) => hrefWith({ owner: id })}
              />
            ) : (
              <Panel>
                <ChartSkeleton rows={3} />
              </Panel>
            )}
          </ReportSection>

          <div className="grid items-stretch gap-5 lg:grid-cols-2">
            <ReportSection
              id="activation"
              title="Time to activate"
              description="Median time between platform milestones."
              aside={
                <ExportButton
                  label="time to activate"
                  filename={csvFilename("time-to-activate", period)}
                  disabled={!report?.hasPlatformEvents}
                  rows={() => csvRows.activation(report!)}
                />
              }
              footnote="Measured for brands that completed each step in the period, from the first event of each kind. Waiting counts brands that reached the first stage and not the next, as of now."
            >
              <Panel className="flex-1">
                {!report ? (
                  <ChartSkeleton rows={4} />
                ) : !report.hasPlatformEvents ? (
                  <EmptyState
                    className="mx-auto max-w-lg"
                    icon={ActivityIcon}
                    title="No platform events yet"
                    description="Hypedrive sends signup, GST, top-up, campaign and approval events to the CRM. Once brands move through those steps, the median time for each one shows here."
                  />
                ) : (
                  <ActivationChart activation={report.activation} />
                )}
              </Panel>
            </ReportSection>

            <ReportSection
              id="pipeline"
              title="Pipeline"
              description={
                source !== ALL
                  ? "Open deals now, for every source. Deals don't carry a source."
                  : "Open deals now, and deals closed in the period."
              }
              footnote="Totals are kept per currency and never converted."
              aside={
                <ExportButton
                  label="pipeline"
                  filename={csvFilename("pipeline", period)}
                  disabled={!report}
                  rows={() => csvRows.pipeline(report!)}
                />
              }
            >
              <Panel className="flex-1">
                {!report ? (
                  <ChartSkeleton rows={4} />
                ) : report.pipeline.open.every((stage) => stage.count === 0) &&
                  report.pipeline.won.count === 0 &&
                  report.pipeline.lost.count === 0 ? (
                  <EmptyState
                    className="mx-auto max-w-lg"
                    icon={ClipboardIcon}
                    title="No deals in play"
                    description="Open deals appear here by stage, with won and lost deals for the period. Create a deal from an account to start the pipeline."
                    action={
                      <Button variant="secondary" size="sm" href="/deals">
                        Open deals
                      </Button>
                    }
                  />
                ) : (
                  <PipelineChart
                    pipeline={report.pipeline}
                    previousWon={report.previousWon}
                  />
                )}
              </Panel>
            </ReportSection>
          </div>
        </div>
      </div>
    </Page>
  );
}

function ChartSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-3 w-24 shrink-0" />
          <Skeleton
            className="h-4"
            style={{ width: `${Math.max(12, 90 - index * 8)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
