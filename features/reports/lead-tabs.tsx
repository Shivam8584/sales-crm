"use client";

import type { FunctionReturnType } from "convex/server";
import { useSearchParams } from "next/navigation";
import type { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import type { FunnelStepKey, Period } from "@/convex/lib/reports";
import { STAGE_PROBABILITY_BPS } from "@/lib/domain/forecast";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import BarChartIcon from "@/public/assets/icons/bar-chart-10.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import ActivationChart from "./activation-section";
import ExportButton from "./export-button";
import { csvFilename, csvRows } from "./export";
import { count } from "./format";
import FunnelChart from "./funnel-chart";
import Kpis, { KpisSkeleton } from "./kpis";
import { PERIOD_LABEL } from "./periods";
import PipelineChart from "./pipeline-chart";
import { ChartSkeleton, Panel, Reloading, ReportSection } from "./section";
import SourceTable from "./source-table";

type ReportData = FunctionReturnType<typeof api.reports.overview>;

type LeadTabProps = {
  report: ReportData | undefined;
  loading: boolean;
  period: Period;
  ownerParam: string;
  filtered: boolean;
  clearFilters: () => void;
  setPeriod: (period: Period) => void;
};

const STAGE_ODDS = Object.entries(STAGE_PROBABILITY_BPS)
  .map(
    ([stage, bps]) =>
      `${DEAL_STAGE_LABEL[stage as keyof typeof STAGE_PROBABILITY_BPS]} ${bps / 100}%`,
  )
  .join(", ");

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

function NoLeads({
  filtered,
  period,
  clearFilters,
  setPeriod,
}: Pick<LeadTabProps, "filtered" | "period" | "clearFilters" | "setPeriod">) {
  return (
    <EmptyState
      className="mx-auto max-w-lg"
      icon={BarChartIcon}
      title={
        filtered ? "No leads match these filters" : "No leads in this period"
      }
      description="Leads from the demo form, Cal.com bookings and platform signups are counted here. Each step fills in as reps make contact, book demos and brands go live on Hypedrive."
      action={
        filtered ? (
          <Button variant="secondary" size="sm" onClick={clearFilters}>
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
  );
}

/** Headline figures, open pipeline and time to activate. */
export function OverviewTab({ report, loading, period }: LeadTabProps) {
  return (
    <Reloading loading={loading && Boolean(report)}>
      <ReportSection
        id="overview"
        title="Overview"
        description={`${PERIOD_LABEL[period].long}, each figure against the period before.`}
      >
        <Panel className="px-4 py-4 sm:px-5">
          {report ? <Kpis report={report} /> : <KpisSkeleton />}
        </Panel>
      </ReportSection>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <ReportSection
          id="pipeline"
          title="Pipeline"
          description="Open deals now, and deals closed in the period."
          footnote={`Weighted counts each open deal at its stage's chance of closing: ${STAGE_ODDS}. Totals are kept per currency and never converted. Deals don't carry a source, so the source filter doesn't apply here.`}
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

        <ReportSection
          id="activation"
          title="Time to activate"
          description="Median time between platform milestones."
          footnote="Measured for brands that completed each step in the period, from the first event of each kind. Waiting counts brands that reached the first stage and not the next, as of now."
          aside={
            <ExportButton
              label="time to activate"
              filename={csvFilename("time-to-activate", period)}
              disabled={!report?.hasPlatformEvents}
              rows={() => csvRows.activation(report!.activation)}
            />
          }
        >
          <Panel className="flex-1">
            {!report ? (
              <ChartSkeleton rows={4} />
            ) : !report.hasPlatformEvents ? (
              <EmptyState
                className="mx-auto max-w-lg"
                icon={ActivityIcon}
                title="No platform events yet"
                description="Hypedrive sends signup, organisation, funding, campaign and approval events to the CRM. Once brands move through those steps, the median time for each one shows here."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    href="/settings/integrations"
                  >
                    Check the platform connection
                  </Button>
                }
              />
            ) : (
              <ActivationChart activation={report.activation} />
            )}
          </Panel>
        </ReportSection>
      </div>
    </Reloading>
  );
}

/** Where leads created in the period stopped, and which sources they came from. */
export function FunnelTab(props: LeadTabProps) {
  const { report, loading, period, ownerParam, filtered } = props;
  const params = useSearchParams();
  const sourceHref = (key: string) => {
    const query = new URLSearchParams(params.toString());
    query.set("source", key);
    return `/reports?${query}`;
  };
  const hrefFor = (key: FunnelStepKey) => {
    const href = STEP_LIST[key];
    if (ownerParam === "all") return href;
    return `${href}${href.includes("?") ? "&" : "?"}owner=${ownerParam}`;
  };
  return (
    <Reloading loading={loading && Boolean(report)}>
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
            Cohort: every lead created in the period, followed to today. A lead
            counts at every step up to the furthest one it has reached, so the
            funnel never grows; a self-serve signup counts as contacted and
            demoed. Platform steps come from Hypedrive events and the account
            stage. Recent cohorts have had less time to move, so compare like
            periods. A step links to today&apos;s list for it, not to the
            cohort.
          </>
        }
      >
        <Panel>
          {!report ? (
            <ChartSkeleton rows={10} />
          ) : report.funnel.steps[0].count === 0 ? (
            <NoLeads {...props} />
          ) : (
            <FunnelChart
              funnel={report.funnel}
              previous={report.previousFunnel}
              hrefFor={hrefFor}
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
        description="Which channels bring brands that go on to activate. Select a source to filter the funnel."
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
            unknown. Rates are shares of the source&apos;s leads created in the
            period that reached each step by today. Median speed is creation to
            first touch, for inbound leads.
          </>
        }
      >
        <Panel className="flex flex-col">
          {report ? (
            <SourceTable
              filtered={filtered}
              rows={report.bySource}
              hrefFor={sourceHref}
            />
          ) : (
            <ChartSkeleton rows={4} />
          )}
        </Panel>
      </ReportSection>
    </Reloading>
  );
}
