"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import EmptyState from "@/components/_ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/_ui/tabs";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import SearchInput from "@/components/data-table/search-input";
import RowAction from "@/components/data-table/row-action";
import SelectionBar from "@/components/data-table/selection-bar";
import OptionPicker from "@/components/fields/option-picker";
import type { Column, SortState } from "@/components/data-table/types";
import { Page, PageHeader, PageToolbar } from "@/components/shell/page";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import {
  LEAD_KINDS,
  LEAD_STATUSES,
  type DisqualifyReason,
  type LeadStatus,
} from "@/lib/domain/enums";
import { LEAD_KIND_LABEL, LEAD_STATUS_LABEL } from "@/lib/domain/labels";
import { useUiStore } from "@/stores/ui-store";
import EyeIcon from "@/public/assets/icons/eye.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import { ChannelTag, DemoTag, compactSpan, ownerOptions } from "./lead-meta";
import LeadStatusMenu from "./lead-status-menu";
import SlaIndicator, { slaState, useNow } from "./sla";
import { useBulkLeadActions, useLeadActions } from "./use-lead-actions";

type LeadsData = FunctionReturnType<typeof api.leads.list>;
export type LeadRow = LeadsData["leads"][number];

const ANY = "any";
const MINE = "mine";
const UNASSIGNED = "unassigned";
const DEFAULT_SORT: SortState = { id: "sla", dir: "asc" };

function matches(row: LeadRow, query: string) {
  const text =
    `${row.name} ${row.companyName} ${row.email ?? ""} ${row.phone ?? ""} ${row.channel} ${row.utm.campaign ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

/** The inbound lead inbox: triage by status, watch the SLA, peek or open a lead. */
export default function LeadsPage() {
  const viewer = useViewer();
  const members = useMembers();
  const data = useQuery(api.leads.list);
  const { assign } = useLeadActions();
  const bulk = useBulkLeadActions();
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);
  const now = useNow(true, 30_000);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatusTab] = useUrlState("status", "new");
  const [owner, setOwner] = useUrlState("owner", ANY);
  const [channel, setChannel] = useUrlState("source", ANY);
  const [kind, setKind] = useUrlState("kind", ANY);
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );

  const slaMs = data?.slaMs ?? 0;

  const columns: Column<LeadRow>[] = [
    {
      id: "lead",
      header: "Lead",
      width: "minmax(15rem,2fr)",
      sortValue: (row) => row.name,
      cell: (row) => (
        <>
          <Avatar name={row.name} size="sm" />
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate font-medium">{row.name}</span>
            <span
              className="text-fg-tertiary truncate font-normal"
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
      width: "minmax(8rem,1fr)",
      sortValue: (row) => row.channel,
      cell: (row) => <ChannelTag channel={row.channel} />,
    },
    {
      id: "owner",
      header: "Owner",
      width: "minmax(9rem,1fr)",
      sortValue: (row) => row.owner?.name ?? null,
      cell: (row) => (
        <OptionPicker
          value={row.owner?._id ?? null}
          label={`Owner of ${row.name}`}
          placeholder="Unassigned"
          searchPlaceholder="Search teammates…"
          clearLabel="Unassign"
          options={ownerOptions(members, row.owner)}
          onChange={(value) => void assign(row, value)}
          className="mx-0 -ml-1.5"
        />
      ),
    },
    {
      id: "sla",
      header: "First touch",
      width: "minmax(9.5rem,1fr)",
      sortValue: (row) => {
        const state = slaState(row, slaMs, now);
        if (state.kind === "pending") return state.remainingMs;
        if (state.kind === "breached") return -state.overMs;
        return null;
      },
      cell: (row) => <SlaIndicator lead={row} slaMs={slaMs} />,
    },
    {
      id: "demo",
      header: "Demo",
      width: "8rem",
      minViewport: 1100,
      sortValue: (row) => row.demoAt,
      cell: (row) =>
        row.demoAt ? (
          <DemoTag at={row.demoAt} />
        ) : (
          <span className="text-fg-tertiary">—</span>
        ),
    },
    {
      id: "age",
      header: "Received",
      width: "6.5rem",
      align: "end",
      defaultDir: "asc",
      sortValue: (row) => now - row._creationTime,
      cell: (row) => (
        <span
          className="text-fg-secondary whitespace-nowrap tabular-nums"
          title={new Date(row._creationTime).toLocaleString("en-IN")}
        >
          {compactSpan(now - row._creationTime)} ago
        </span>
      ),
    },
  ];

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: columns.some((column) => column.id === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "desc" ? "desc" : "asc",
  };

  const leads = data?.leads;
  const filtered = useMemo(() => {
    if (!leads) return undefined;
    return leads.filter(
      (row) =>
        (owner === ANY ||
          (owner === UNASSIGNED
            ? !row.owner
            : owner === MINE
              ? row.owner?._id === viewer._id
              : row.owner?._id === owner)) &&
        (channel === ANY || row.channel === channel) &&
        (kind === ANY || row.kind === kind) &&
        (!search.trim() || matches(row, search)),
    );
  }, [leads, owner, channel, kind, search, viewer._id]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(
      LEAD_STATUSES.map((value) => [value, 0]),
    ) as Record<LeadStatus, number>;
    for (const row of filtered ?? []) result[row.status]++;
    return result;
  }, [filtered]);

  const rows = filtered?.filter((row) => row.status === status);
  const breached = useMemo(
    () =>
      (leads ?? []).filter(
        (row) => slaState(row, slaMs, now).kind === "breached",
      ).length,
    [leads, slaMs, now],
  );
  const selectedIds = (rows ?? [])
    .filter((row) => selected.has(row._id))
    .map((row) => row._id);

  function bulkStatus(next: LeadStatus, reason?: DisqualifyReason) {
    const ids = selectedIds;
    setSelected(new Set());
    void bulk.setStatus(ids, next, reason);
  }
  const channels = useMemo(
    () => [...new Set((leads ?? []).map((row) => row.channel))].sort(),
    [leads],
  );
  const hasFilters =
    owner !== ANY || channel !== ANY || kind !== ANY || search.trim() !== "";

  function clearFilters() {
    setSearch("");
    setOwner(ANY);
    setChannel(ANY);
    setKind(ANY);
  }

  return (
    <Page>
      <PageHeader
        title="Leads"
        meta={
          leads && (
            <>
              <span className="caption-style text-fg-tertiary tabular-nums">
                {leads.length}
              </span>
              {breached > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusTab("new");
                    setSortParam("sla:asc");
                  }}
                  className="caption-style text-danger hover:bg-overlay-1 focus-visible:ring-ring flex items-center gap-1.5 rounded-full px-2 py-0.5 tabular-nums outline-none focus-visible:ring-2"
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-current"
                  />
                  {breached} past SLA
                </button>
              )}
            </>
          )
        }
        actions={
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
      <Tabs
        value={status}
        onValueChange={(next) => {
          setStatusTab(next);
          setSelected(new Set());
        }}
      >
        <TabsList
          aria-label="Lead status"
          className="border-border scrollbar-none gap-5 overflow-x-auto border-b px-4"
        >
          {LEAD_STATUSES.map((value) => (
            <TabsTrigger key={value} value={value} className="shrink-0 py-3">
              <span className="flex items-center gap-1.5">
                {LEAD_STATUS_LABEL[value]}
                {data && (
                  <CountBadge
                    className={
                      value === "new" && counts.new > 0
                        ? "text-foreground"
                        : undefined
                    }
                  >
                    {counts[value]}
                  </CountBadge>
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <PageToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search leads"
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
          options={[
            { value: ANY, label: "Any" },
            ...channels.map((value) => ({ value, label: value })),
          ]}
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
          label={`${LEAD_STATUS_LABEL[status as LeadStatus] ?? "New"} leads`}
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
          rowActions={(row) => (
            <>
              {row.owner?._id !== viewer._id && (
                <RowAction
                  label="Assign to me"
                  icon={UserPlusIcon}
                  onClick={() => void assign(row, viewer._id)}
                />
              )}
              <RowAction
                label="Peek"
                icon={EyeIcon}
                shortcut="Space"
                onClick={() => setPeek({ type: "lead", id: row._id })}
              />
            </>
          )}
          renderCard={(row) => (
            <span className="flex items-start gap-3">
              <Avatar name={row.name} size="md" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="lead-style truncate font-medium">
                  {row.name}
                  <span className="text-fg-tertiary font-normal">
                    {" "}
                    · {row.companyName}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <SlaIndicator lead={row} slaMs={slaMs} />
                  <span className="caption-style text-fg-tertiary truncate">
                    {row.owner?.name ?? "Unassigned"} · {row.channel}
                  </span>
                </span>
              </span>
              <span className="caption-style text-fg-tertiary pt-0.5 tabular-nums">
                {compactSpan(now - row._creationTime)}
              </span>
            </span>
          )}
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
                    : `No ${LEAD_STATUS_LABEL[status as LeadStatus]?.toLowerCase() ?? ""} leads`
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
          noun={["lead", "leads"]}
          onClear={() => setSelected(new Set())}
        >
          <OptionPicker
            value={null}
            label="Assign selected leads"
            align="start"
            clearLabel="Unassign"
            searchPlaceholder="Search teammates…"
            onChange={(id) => void bulk.assign(selectedIds, id)}
            options={ownerOptions(members, null)}
            className="h-control-sm mx-0 px-2.5 text-xs"
          >
            Assign
          </OptionPicker>
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
    </Page>
  );
}
