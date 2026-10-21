"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import SearchInput from "@/components/data-table/search-input";
import SavedViewsMenu from "@/features/views/saved-views-menu";
import SelectionBar from "@/components/data-table/selection-bar";
import AddToAutomation from "@/features/automations/add-to-automation";
import OptionPicker from "@/components/fields/option-picker";
import type { Column, SortState } from "@/components/data-table/types";
import {
  CreateButton,
  ExportButton,
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { useCsvExport } from "@/hooks/use-csv-export";
import { dash } from "@/features/accounts/record-cells";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  allRows,
  isPartial,
  usePagedList,
  viewCount,
} from "@/hooks/use-paged-list";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import {
  LEAD_KINDS,
  LEAD_STATUSES,
  type DisqualifyReason,
  type LeadKind,
  type LeadStatus,
} from "@/lib/domain/enums";
import { LEAD_KIND_LABEL, LEAD_STATUS_LABEL } from "@/lib/domain/labels";
import { LEAD_SOURCE_LABEL } from "@/lib/domain/leads";
import { useUiStore } from "@/stores/ui-store";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import XIcon from "@/public/assets/icons/x.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import DisqualifyDialog from "./disqualify-dialog";
import {
  DemoCell,
  OwnerCell,
  SourceTag,
  compactSpan,
  ownerOptions,
} from "./lead-meta";
import LeadStatusMenu from "./lead-status-menu";
import { SlaCell, slaState, useNow } from "./sla";
import { useBulkLeadActions, useLeadActions } from "./use-lead-actions";

type LeadRow = FunctionReturnType<typeof api.leads.page>["page"][number];
type ListArgs = Omit<FunctionArgs<typeof api.leads.page>, "paginationOpts">;

const ANY = "any";
const MINE = "mine";
const UNASSIGNED = "unassigned";
const DEFAULT_SORT: SortState = { id: "sla", dir: "asc" };
const SOURCES = Object.entries(LEAD_SOURCE_LABEL).map(([value, label]) => ({
  value,
  label,
}));

const SORT_OPTIONS = [
  { value: "sla", label: "SLA urgency" },
  { value: "age", label: "Newest" },
  { value: "demo", label: "Demo date" },
  { value: "lead", label: "Name" },
];
const SORT_DIR: Record<string, "asc" | "desc"> = { demo: "desc" };

function isClosed(row: LeadRow) {
  return row.status === "disqualified" || row.status === "converted";
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The inbound lead inbox: triage by status, watch the SLA, peek or open a lead. */
export default function LeadsPage() {
  const viewer = useViewer();
  const members = useMembers();
  const { assign, setStatus } = useLeadActions();
  const bulk = useBulkLeadActions();
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);
  const now = useNow(true, 30_000);
  const { exportCsv, pending: exporting } = useCsvExport(["lead", "leads"]);

  const [search, setSearch] = useUrlState("q", "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disqualifying, setDisqualifying] = useState<LeadRow | null>(null);
  const [statusParam, setStatusView] = useUrlState("status", "new");
  const [owner, setOwner] = useUrlState("owner", ANY);
  const [channel, setChannel] = useUrlState("source", ANY);
  const [kind, setKind] = useUrlState("kind", ANY);
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );

  const status: LeadStatus = (LEAD_STATUSES as readonly string[]).includes(
    statusParam,
  )
    ? (statusParam as LeadStatus)
    : "new";
  const query = useDebouncedValue(search);
  const ownerId =
    owner === ANY
      ? undefined
      : owner === UNASSIGNED
        ? null
        : ((owner === MINE ? viewer._id : owner) as Id<"members">);
  const filters = {
    ownerId,
    kind: LEAD_KINDS.find((value) => value === kind) as LeadKind | undefined,
    source: channel === ANY ? undefined : channel,
    search: query.trim() || undefined,
  };
  const counts = useQuery(api.leads.counts, filters);
  const slaMs = counts?.slaMs ?? 0;

  const columns: Column<LeadRow>[] = [
    {
      id: "lead",
      header: "Lead",
      width: "minmax(14rem,1.8fr)",
      sortable: true,
      cell: (row) => (
        <>
          <Avatar name={row.name} />
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate" title={row.name}>
              {row.name}
            </span>
            <span
              className="text-fg-tertiary truncate"
              title={`${row.companyName} · ${LEAD_KIND_LABEL[row.kind]}`}
            >
              {row.companyName}
            </span>
          </span>
        </>
      ),
    },
    {
      id: "source",
      header: "Source",
      width: "minmax(9rem,1fr)",
      minViewport: 900,
      cell: (row) => <SourceTag utm={row.utm} channel={row.channel} />,
    },
    {
      id: "owner",
      header: "Owner",
      width: "minmax(8.75rem,1fr)",
      minViewport: 1000,
      cell: (row) => (
        <OptionPicker
          label="Owner"
          value={row.owner?._id ?? null}
          align="start"
          clearLabel="Unassign"
          options={ownerOptions(members, row.owner)}
          onChange={(next) => void assign(row, next)}
        >
          <OwnerCell owner={row.owner} />
        </OptionPicker>
      ),
    },
    {
      id: "sla",
      header: "SLA",
      width: "minmax(9.5rem,1fr)",
      sortable: true,
      cell: (row) => <SlaCell lead={row} slaMs={slaMs} />,
    },
    {
      id: "demo",
      header: "Demo",
      width: "minmax(8.5rem,0.9fr)",
      minViewport: 1100,
      defaultDir: "desc",
      sortable: true,
      cell: (row) => <DemoCell at={row.demoAt} now={now} />,
    },
    {
      id: "age",
      header: "Age",
      width: "5.5rem",
      align: "end",
      defaultDir: "asc",
      sortable: true,
      cell: (row) => (
        <span
          className="whitespace-nowrap tabular-nums"
          title={`Received ${new Date(row._creationTime).toLocaleString("en-IN")}`}
        >
          {compactSpan(now - row._creationTime)}
        </span>
      ),
    },
  ];

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: SORT_OPTIONS.some((option) => option.value === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "desc" ? "desc" : "asc",
  };

  const args: ListArgs = {
    status,
    ...filters,
    sort: sort.id as ListArgs["sort"],
    dir: sort.dir,
  };
  const { rows, paging } = usePagedList(api.leads.page, args);
  const loaded = allRows(rows, paging);
  const stats = useMemo(() => {
    if (!loaded) return null;
    let within = 0;
    let judged = 0;
    const speeds: number[] = [];
    for (const row of loaded) {
      const state = slaState(row, slaMs, now);
      if (state.kind === "replied") {
        speeds.push(state.tookMs);
        judged++;
        if (!state.late) within++;
      } else if (state.kind === "breached") {
        judged++;
      }
    }
    return {
      untouched: loaded.filter((row) => !row.firstTouchedAt && !isClosed(row))
        .length,
      median: median(speeds),
      within: judged ? Math.round((within / judged) * 100) : null,
    };
  }, [loaded, slaMs, now]);
  const statusCounts = counts?.statuses;

  const selectedIds = (rows ?? [])
    .filter((row) => selected.has(row._id))
    .map((row) => row._id);

  function bulkStatus(next: LeadStatus, reason?: DisqualifyReason) {
    const ids = selectedIds;
    setSelected(new Set());
    void bulk.setStatus(ids, next, reason);
  }

  const hasFilters =
    owner !== ANY || channel !== ANY || kind !== ANY || search.trim() !== "";

  function clearFilters() {
    setSearch("");
    setOwner(ANY);
    setChannel(ANY);
    setKind(ANY);
  }

  const breachedLabel = counts
    ? `${counts.breached}${counts.breachedCapped ? "+" : ""}`
    : "";

  return (
    <Page>
      <PageHeader
        title="Leads"
        meta={
          counts && (
            <>
              <PageStatus tone="neutral">
                <span className="tabular-nums">
                  {counts.open.toLocaleString("en-IN")} open
                </span>
              </PageStatus>
              {counts.breached > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusView("new");
                    setSortParam("sla:asc");
                  }}
                  aria-label={`${breachedLabel} past SLA. Show them first`}
                  className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
                >
                  <PageStatus tone="danger">
                    <span className="tabular-nums">
                      {breachedLabel} past SLA
                    </span>
                  </PageStatus>
                </button>
              )}
            </>
          )
        }
      />
      <PageViews
        label="Lead status"
        value={status}
        onChange={(next) => {
          setStatusView(next);
          setSelected(new Set());
        }}
        views={LEAD_STATUSES.map((value) =>
          statusCounts === null
            ? { id: value, label: LEAD_STATUS_LABEL[value] }
            : {
                id: value,
                label: LEAD_STATUS_LABEL[value],
                count: statusCounts?.[value],
              },
        )}
      />
      <PageToolbar
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search leads"
          />
        }
        actions={
          <>
            <SavedViewsMenu />
            <ExportButton
              disabled={!rows?.length || exporting}
              onClick={() => void exportCsv({ name: "leads", args })}
            />
            <CreateButton onClick={() => setCreate({ type: "lead" })}>
              New lead
            </CreateButton>
          </>
        }
      >
        <FilterMenu
          label="Sort by"
          value={sort.id}
          options={SORT_OPTIONS}
          onChange={(id) => setSortParam(`${id}:${SORT_DIR[id] ?? "asc"}`)}
        />
        <FilterMenu
          label="Owner"
          value={owner}
          onChange={setOwner}
          options={[
            { value: ANY, label: "Anyone" },
            { value: UNASSIGNED, label: "Unassigned" },
            { value: MINE, label: "Me" },
            ...(members ?? [])
              .filter((member) => member._id !== viewer._id)
              .map((member) => ({ value: member._id, label: member.name })),
          ]}
        />
        <FilterMenu
          label="Source"
          value={channel}
          onChange={setChannel}
          options={[{ value: ANY, label: "Any" }, ...SOURCES]}
        />
        <FilterMenu
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: ANY, label: "Any" },
            ...LEAD_KINDS.map((value) => ({
              value,
              label: LEAD_KIND_LABEL[value],
            })),
          ]}
        />
        {hasFilters && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </PageToolbar>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label={`${LEAD_STATUS_LABEL[status]} leads`}
          columns={columns}
          rows={rows}
          getId={(row) => row._id}
          getHref={(row) => `/leads/${row._id}`}
          getLabel={(row) => `${row.name}, ${row.companyName}`}
          sort={sort}
          onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
          selected={selected}
          onSelectedChange={setSelected}
          onPeek={(row) => setPeek({ type: "lead", id: row._id })}
          rowMenu={(row) => [
            row.owner?._id !== viewer._id && {
              label: "Assign to me",
              icon: UserPlusIcon,
              onSelect: () => void assign(row, viewer._id),
            },
            !isClosed(row) && {
              label: "Disqualify…",
              icon: XIcon,
              tone: "danger",
              onSelect: () => setDisqualifying(row),
            },
          ]}
          paging={paging}
          footer={[
            {
              label: "Leads in view",
              value: viewCount(statusCounts?.[status], rows?.length, paging),
            },
            { label: "Untouched", value: stats ? stats.untouched : dash },
            {
              label: "Median speed to lead",
              value: stats?.median == null ? dash : compactSpan(stats.median),
            },
            {
              label: "Within SLA",
              value:
                stats?.within == null ? (
                  dash
                ) : (
                  <>
                    {stats.within}
                    <span className="text-fg-tertiary">%</span>
                  </>
                ),
            },
          ]}
          renderCard={(row) => <LeadCard row={row} slaMs={slaMs} now={now} />}
          empty={
            hasFilters ? (
              <EmptyState
                icon={TargetIcon}
                title="No leads match"
                description="Try another search or clear the filters."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={TargetIcon}
                title={
                  status === "new"
                    ? "Inbox zero"
                    : `No ${LEAD_STATUS_LABEL[status].toLowerCase()} leads`
                }
                description={
                  status === "new"
                    ? "Demo requests from the website land here and are assigned automatically."
                    : "Leads move here as you work them."
                }
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCreate({ type: "lead" })}
                  >
                    <PlusIcon aria-hidden className="size-3" />
                    New lead
                  </Button>
                }
              />
            )
          }
        />
        <SelectionBar
          count={selectedIds.length}
          loaded={isPartial(paging) ? rows?.length : undefined}
          noun={["lead", "leads"]}
          onClear={() => setSelected(new Set())}
        >
          <OptionPicker
            value={null}
            label="Assign selected leads"
            align="start"
            clearLabel="Unassign"
            searchPlaceholder="Search teammates…"
            onChange={(id) => {
              const ids = selectedIds;
              setSelected(new Set());
              void bulk.assign(ids, id);
            }}
            options={ownerOptions(members, null)}
            className="h-control-sm mx-0 px-2.5 text-xs"
          >
            Assign
          </OptionPicker>
          <AddToAutomation
            kind="lead"
            ids={selectedIds}
            onDone={() => setSelected(new Set())}
          />
          {status !== "converted" && (
            <>
              <LeadStatusMenu status={null} side="top" onChange={bulkStatus}>
                <Button variant="ghost" size="xs" className="text-foreground">
                  Status
                </Button>
              </LeadStatusMenu>
              {status !== "disqualified" && (
                <LeadStatusMenu
                  status={null}
                  side="top"
                  disqualifyOnly
                  onChange={bulkStatus}
                >
                  <Button variant="ghost" size="xs" className="text-foreground">
                    Disqualify
                  </Button>
                </LeadStatusMenu>
              )}
            </>
          )}
        </SelectionBar>
      </div>
      <DisqualifyDialog
        lead={disqualifying}
        onClose={() => setDisqualifying(null)}
        onPick={(reason) =>
          disqualifying && void setStatus(disqualifying, "disqualified", reason)
        }
      />
    </Page>
  );
}

function LeadCard({
  row,
  slaMs,
  now,
}: {
  row: LeadRow;
  slaMs: number;
  now: number;
}) {
  return (
    <span className="flex flex-col gap-2.5">
      <span className="flex items-center gap-3">
        <Avatar name={row.name} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="lead-style truncate font-medium">{row.name}</span>
          <span className="caption-style text-fg-tertiary truncate">
            {row.companyName} · {row.owner?.name ?? "Unassigned"}
          </span>
        </span>
        <span className="caption-style text-fg-tertiary shrink-0 tabular-nums">
          {compactSpan(now - row._creationTime)}
        </span>
      </span>
      <span className="caption-style flex items-center justify-between gap-3 pl-10">
        <SourceTag utm={row.utm} channel={row.channel} />
        <span className="text-fg-secondary min-w-0 shrink-0">
          <SlaCell lead={row} slaMs={slaMs} />
        </span>
      </span>
    </span>
  );
}
