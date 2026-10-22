"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import FilterMenu from "@/components/_common/filter-menu";
import {
  Page,
  PageHeader,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { PERIODS, UNASSIGNED, type Period } from "@/convex/lib/reports";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { range } from "./format";
import ForecastTab from "./forecast-tab";
import { FunnelTab, OverviewTab } from "./lead-tabs";
import { PERIOD_LABEL } from "./periods";
import TeamTab from "./team-tab";
import { useLatest } from "./use-report";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "funnel", label: "Funnel & sources" },
  { id: "forecast", label: "Forecast" },
  { id: "team", label: "Team" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const ALL = "all";
const MINE = "mine";
const DEFAULT_PERIOD: Period = "30d";

/** Overview, funnel and sources, and the team leaderboard. */
export default function ReportsPage() {
  const viewer = useViewer();
  const members = useMembers();
  const [tabParam, setTab] = useUrlState("tab", "overview");
  const [periodParam, setPeriod] = useUrlState("period", DEFAULT_PERIOD);
  const [source, setSource] = useUrlState("source", ALL);
  const [ownerParam, setOwner] = useUrlState("owner", ALL);

  const tab: Tab =
    tabParam === "sources"
      ? "funnel"
      : TABS.some((item) => item.id === tabParam)
        ? (tabParam as Tab)
        : "overview";
  const period = (PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : DEFAULT_PERIOD;
  const leadTab = tab === "overview" || tab === "funnel";
  const ownerTab = tab !== "team";
  const ownerValue = ownerParam === MINE ? viewer._id : ownerParam;
  const owner = !ownerTab || ownerValue === ALL ? undefined : ownerValue;

  const live = useQuery(
    api.reports.overview,
    leadTab
      ? { period, source: source === ALL ? undefined : source, owner }
      : "skip",
  );
  const overview = useLatest(live);
  const report = overview.data;

  const filtered =
    (leadTab && source !== ALL) || (ownerTab && ownerParam !== ALL);

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
    { value: UNASSIGNED, label: "Unassigned" },
    ...(members ?? [])
      .filter((member) => member._id !== viewer._id)
      .map((member) => ({ value: member._id, label: member.name })),
  ];

  const filters = {
    period,
    owner,
    ownerParam,
    filtered,
    clearFilters,
    setPeriod: (next: Period) => setPeriod(next),
  };

  return (
    <Page>
      <PageHeader title="Reports" />
      <PageViews
        param="tab"
        label="Reports"
        value={tab}
        onChange={setTab}
        views={TABS.map((item) => ({ id: item.id, label: item.label }))}
      />
      <PageToolbar>
        {tab !== "forecast" && (
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
        {ownerTab && (
          <FilterMenu
            label="Owner"
            value={ownerParam}
            onChange={setOwner}
            options={ownerOptions}
          />
        )}
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
        {report && leadTab && (
          <span className="caption-style text-fg-tertiary ml-auto tabular-nums max-md:hidden">
            {range(report.windows.current)} · compared with{" "}
            {range(report.windows.previous)}
          </span>
        )}
      </PageToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-12 px-(--page-x) pt-2 pb-16">
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
          {tab === "forecast" && (
            <ForecastTab owner={owner} ownerParam={ownerParam} />
          )}
          {tab === "team" && <TeamTab period={period} />}
        </div>
      </div>
    </Page>
  );
}
