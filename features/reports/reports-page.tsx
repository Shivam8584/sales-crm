"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import FilterMenu from "@/components/_common/filter-menu";
import {
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { PERIODS, UNASSIGNED, type Period } from "@/convex/lib/reports";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import ActivationTab from "./activation-tab";
import ForecastTab from "./forecast-tab";
import { range } from "./format";
import { FunnelTab, OverviewTab, SourcesTab } from "./lead-tabs";
import { PERIOD_LABEL } from "./periods";
import RevenueTab from "./revenue-tab";
import TeamTab from "./team-tab";
import { useLatest } from "./use-report";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "funnel", label: "Funnel" },
  { id: "sources", label: "Sources" },
  { id: "team", label: "Team" },
  { id: "forecast", label: "Forecast" },
  { id: "activation", label: "Activation" },
  { id: "revenue", label: "Revenue" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const LEAD_TABS: readonly Tab[] = ["overview", "funnel", "sources"];
const OWNER_TABS: readonly Tab[] = [...LEAD_TABS, "forecast", "revenue"];

const ALL = "all";
const MINE = "mine";
const DEFAULT_PERIOD: Period = "30d";

/** Funnel, sources, team, forecast, activation and revenue reports, one tab each. */
export default function ReportsPage() {
  const viewer = useViewer();
  const members = useMembers();
  const [tabParam, setTab] = useUrlState("tab", "overview");
  const [periodParam, setPeriod] = useUrlState("period", DEFAULT_PERIOD);
  const [source, setSource] = useUrlState("source", ALL);
  const [ownerParam, setOwner] = useUrlState("owner", ALL);

  const tab: Tab = TABS.some((item) => item.id === tabParam)
    ? (tabParam as Tab)
    : "overview";
  const period = (PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : DEFAULT_PERIOD;
  const leadTab = LEAD_TABS.includes(tab);
  const usesOwner = OWNER_TABS.includes(tab);
  const usesPeriod = tab !== "forecast";
  const ownerShown = !leadTab && ownerParam === UNASSIGNED ? ALL : ownerParam;
  const ownerValue = ownerShown === MINE ? viewer._id : ownerShown;
  const owner = !usesOwner || ownerValue === ALL ? undefined : ownerValue;

  const live = useQuery(
    api.reports.overview,
    leadTab
      ? { period, source: source === ALL ? undefined : source, owner }
      : "skip",
  );
  const overview = useLatest(live);
  const report = overview.data;

  const filtered =
    (leadTab && source !== ALL) || (usesOwner && ownerShown !== ALL);

  function clearFilters() {
    setSource(ALL);
    setOwner(ALL);
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
    ...(leadTab ? [{ value: UNASSIGNED, label: "Unassigned" }] : []),
    ...(members ?? [])
      .filter((member) => member._id !== viewer._id)
      .map((member) => ({ value: member._id, label: member.name })),
  ];

  const filters = {
    period,
    owner,
    ownerParam: ownerShown,
    filtered,
    clearFilters,
    setPeriod: (next: Period) => setPeriod(next),
  };

  return (
    <Page>
      <PageHeader
        title="Reports"
        meta={
          usesPeriod && (
            <PageStatus tone="info">
              <span className="tabular-nums">{PERIOD_LABEL[period].long}</span>
            </PageStatus>
          )
        }
      />
      <PageViews
        param="tab"
        label="Reports"
        value={tab}
        onChange={setTab}
        views={TABS.map((item) => ({ id: item.id, label: item.label }))}
      />
      <PageToolbar>
        {usesPeriod && (
          <FilterMenu
            label="Period"
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((id) => ({
              value: id,
              label: PERIOD_LABEL[id].long,
            }))}
          />
        )}
        {leadTab && (
          <FilterMenu
            label="Source"
            value={source}
            onChange={setSource}
            options={sourceOptions}
          />
        )}
        {usesOwner && (
          <FilterMenu
            label="Owner"
            value={ownerShown}
            onChange={setOwner}
            options={ownerOptions}
          />
        )}
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
        {tab === "forecast" ? (
          <span className="caption-style text-fg-tertiary ml-auto max-md:hidden">
            Open deals as of today
          </span>
        ) : (
          report &&
          leadTab && (
            <span className="caption-style text-fg-tertiary ml-auto tabular-nums max-md:hidden">
              {range(report.windows.current)} · compared with{" "}
              {range(report.windows.previous)}
            </span>
          )
        )}
      </PageToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
          {tab === "overview" && (
            <OverviewTab
              report={report}
              loading={overview.loading}
              {...filters}
            />
          )}
          {tab === "funnel" && (
            <FunnelTab
              report={report}
              loading={overview.loading}
              {...filters}
            />
          )}
          {tab === "sources" && (
            <SourcesTab
              report={report}
              loading={overview.loading}
              {...filters}
            />
          )}
          {tab === "team" && <TeamTab period={period} />}
          {tab === "forecast" && (
            <ForecastTab owner={owner} ownerParam={ownerShown} />
          )}
          {tab === "activation" && <ActivationTab period={period} />}
          {tab === "revenue" && <RevenueTab period={period} owner={owner} />}
        </div>
      </div>
    </Page>
  );
}
