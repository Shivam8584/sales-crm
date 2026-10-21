"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
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
  PageActions,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { HealthBadge } from "@/features/platform/health-badge";
import LogCallDialog from "@/features/timeline/log-call-dialog";
import type { TimelineTarget } from "@/features/timeline/kinds";
import { useCsvExport } from "@/hooks/use-csv-export";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  allRows,
  isPartial,
  usePagedList,
  viewCount,
} from "@/hooks/use-paged-list";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/domain/enums";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import AccountLogo from "./account-logo";
import CsvImportDialog, { type ImportConfig } from "./csv-import-dialog";
import {
  ActivationCell,
  LastInteractionCell,
  MoneyValue,
  OwnerCell,
  StageAndTags,
  TrendCell,
  activationPercent,
  activationSteps,
  dash,
  rankTotals,
} from "./record-cells";

type PageRow = FunctionReturnType<typeof api.accounts.page>["page"][number];
export type AccountRow = PageRow & { activation: number | null };
type ListArgs = Omit<FunctionArgs<typeof api.accounts.page>, "paginationOpts">;

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "activity", dir: "desc" };

const VIEWS = [
  { id: "all", label: "All" },
  { id: "mine", label: "My accounts" },
  { id: "archived", label: "Archived" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const COLUMNS: Column<AccountRow>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(10.5rem,1.3fr)",
    sortable: true,
    cell: (row) => (
      <>
        <AccountLogo account={row} size="xs" />
        <span className="truncate" title={row.name}>
          {row.name}
        </span>
      </>
    ),
  },
  {
    id: "stage",
    header: "Stage & tags",
    width: "minmax(12.5rem,1.3fr)",
    cell: (row) => <StageAndTags stage={row.stage} tags={row.tags} />,
  },
  {
    id: "health",
    header: "Health",
    width: "5.5rem",
    cell: (row) =>
      row.health ? (
        <HealthBadge score={row.health.score} band={row.health.band} />
      ) : (
        dash
      ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(8.75rem,1fr)",
    minViewport: 900,
    cell: (row) => <OwnerCell owner={row.owner} />,
  },
  {
    id: "deals",
    header: "Open deals",
    width: "6.5rem",
    align: "end",
    minViewport: 1536,
    cell: (row) => (row.openDeals ? row.openDeals : dash),
  },
  {
    id: "pipeline",
    header: "Pipeline value",
    width: "7.5rem",
    align: "end",
    minViewport: 800,
    cell: (row) => <MoneyValue totals={rankTotals(row.pipeline)} />,
  },
  {
    id: "activation",
    header: "Activation",
    width: "7.5rem",
    align: "end",
    minViewport: 1200,
    cell: (row) => <ActivationCell steps={row.activation} />,
  },
  {
    id: "trend",
    header: "Activity trend",
    width: "6.5rem",
    minViewport: 1400,
    cell: (row) => <TrendCell values={row.trend} />,
  },
  {
    id: "lastInteraction",
    header: "Last interaction",
    width: "minmax(9rem,1fr)",
    minViewport: 1000,
    cell: (row) => <LastInteractionCell last={row.lastInteraction} />,
  },
];

const SORT_OPTIONS = [
  { value: "activity", label: "Last activity" },
  { value: "name", label: "Name" },
];
const SORT_DIR: Record<string, "asc" | "desc"> = { name: "asc" };

const ACTIVITY_OPTIONS = [
  { value: ALL, label: "Any time" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "stale", label: "Over 30 days ago" },
];
const WINDOWS = ["7", "30", "90", "stale"] as const;

export default function AccountsPage() {
  const viewer = useViewer();
  const members = useMembers();
  const setOwner = useMutation(api.accounts.setOwner);
  const setArchived = useMutation(api.accounts.setArchived);
  const importRows = useMutation(api.accounts.importRows);
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);
  const { exportCsv, pending: exporting } = useCsvExport([
    "account",
    "accounts",
  ]);

  const [viewParam, setView] = useUrlState("view", "all");
  const [search, setSearch] = useUrlState("q", "");
  const [stage, setStage] = useUrlState("stage", ALL);
  const [owner, setOwnerFilter] = useUrlState("owner", ALL);
  const [activity, setActivity] = useUrlState("activity", ALL);
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [call, setCall] = useState<{
    target: TimelineTarget;
    name: string;
  } | null>(null);
  const query = useDebouncedValue(search);

  const view: View = VIEWS.some((item) => item.id === viewParam)
    ? (viewParam as View)
    : "all";

  async function toggleArchived(row: AccountRow) {
    const archived = !row.archivedAt;
    try {
      await setArchived({ ids: [row._id], archived });
      toast(
        `${row.name} ${archived ? "archived" : "restored"}`,
        () => void setArchived({ ids: [row._id], archived: !archived }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: SORT_OPTIONS.some((option) => option.value === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const args: ListArgs = {
    archived: view === "archived" || undefined,
    ownerId: (view === "mine" || owner === MINE
      ? viewer._id
      : owner === ALL
        ? undefined
        : owner) as Id<"members"> | undefined,
    stage: stage === ALL ? undefined : (stage as LifecycleStage),
    activity: WINDOWS.find((value) => value === activity),
    search: query.trim() || undefined,
    sort: sort.id as ListArgs["sort"],
    dir: sort.dir,
  };
  const { rows: pageRows, paging } = usePagedList(api.accounts.page, args);
  const counts = useQuery(api.accounts.counts, args);
  const rows = pageRows?.map(
    (row): AccountRow => ({
      ...row,
      activation: activationSteps(row.onPlatform, row.stage),
    }),
  );

  const loaded = allRows(rows, paging);
  const onPlatform = loaded?.filter((row) => row.activation !== null);
  const avgActivation = onPlatform?.length
    ? Math.round(
        onPlatform.reduce(
          (sum, row) => sum + activationPercent(row.activation!),
          0,
        ) / onPlatform.length,
      )
    : null;

  const filtered =
    stage !== ALL || owner !== ALL || activity !== ALL || search.trim() !== "";
  const selectedIds = [...selected].filter((id) =>
    rows?.some((row) => row._id === id),
  ) as Id<"accounts">[];

  function clearFilters() {
    setSearch("");
    setStage(ALL);
    setOwnerFilter(ALL);
    setActivity(ALL);
  }

  const importConfig: ImportConfig = {
    noun: ["account", "accounts"],
    fields: [
      {
        key: "name",
        label: "Name",
        required: true,
        aliases: [
          "account",
          "account name",
          "company",
          "company name",
          "brand",
        ],
      },
      {
        key: "domain",
        label: "Website",
        aliases: ["domain", "url", "site", "web"],
      },
      {
        key: "stage",
        label: "Stage",
        aliases: ["lifecycle", "lifecycle stage", "status"],
      },
      {
        key: "owner",
        label: "Owner",
        aliases: ["owner email", "account owner", "rep"],
      },
      {
        key: "gstin",
        label: "GSTIN",
        aliases: ["gst", "gst number", "gst no"],
      },
      { key: "tags", label: "Tags", aliases: ["labels", "tag"] },
    ],
    example: [
      "Kesar Leaf Naturals",
      "kesarleaf.in",
      "Prospect",
      viewer.email,
      "",
      "D2C, Skincare",
    ],
    run: (rows, dryRun) =>
      importRows({
        dryRun,
        rows: rows.map((row) => ({ ...row, name: row.name ?? "" })),
      }),
    describe: (row) => [
      row.name ?? "",
      [row.domain, row.stage].filter(Boolean).join(" · "),
    ],
  };

  async function assign(ownerId: string) {
    try {
      const previous = await setOwner({
        ids: selectedIds,
        ownerId: ownerId as Id<"members">,
      });
      const name =
        members?.find((member) => member._id === ownerId)?.name ?? "teammate";
      setSelected(new Set());
      toast(
        `Assigned ${previous.length} ${previous.length === 1 ? "account" : "accounts"} to ${name}`,
        () => {
          for (const item of previous) {
            void setOwner({ ids: [item.id], ownerId: item.ownerId });
          }
        },
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function archiveSelected() {
    const ids = selectedIds;
    const archived = view !== "archived";
    try {
      await setArchived({ ids, archived });
      setSelected(new Set());
      toast(
        `${archived ? "Archived" : "Restored"} ${ids.length} ${ids.length === 1 ? "account" : "accounts"}`,
        () => void setArchived({ ids, archived: !archived }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  return (
    <Page>
      <PageHeader
        title="Accounts"
        meta={
          counts && (
            <PageStatus>
              <span className="tabular-nums">
                {counts.views.all.toLocaleString("en-IN")} active
              </span>
            </PageStatus>
          )
        }
        actions={
          <PageActions
            label="Account list actions"
            actions={[
              { label: "Import CSV", onSelect: () => setImporting(true) },
            ]}
          />
        }
      />
      <PageViews
        value={view}
        onChange={(next) => {
          setView(next);
          setSelected(new Set());
        }}
        views={VIEWS.map((item) => ({
          ...item,
          count: counts?.views[item.id],
        }))}
      />
      <PageToolbar
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search accounts"
          />
        }
        actions={
          <>
            <SavedViewsMenu />
            <ExportButton
              disabled={!rows?.length || exporting}
              onClick={() => void exportCsv({ name: "accounts", args })}
            />
            <CreateButton onClick={() => setCreate({ type: "account" })}>
              New account
            </CreateButton>
          </>
        }
      >
        {view !== "archived" && (
          <FilterMenu
            label="Sort by"
            value={sort.id}
            options={SORT_OPTIONS}
            onChange={(id) => setSortParam(`${id}:${SORT_DIR[id] ?? "desc"}`)}
          />
        )}
        {view !== "mine" && (
          <FilterMenu
            label="Owner"
            value={owner}
            onChange={setOwnerFilter}
            options={[
              { value: ALL, label: "Anyone" },
              { value: MINE, label: "Me" },
              ...(members ?? [])
                .filter((member) => member._id !== viewer._id)
                .map((member) => ({ value: member._id, label: member.name })),
            ]}
          />
        )}
        <FilterMenu
          label="Stage"
          value={stage}
          onChange={setStage}
          options={[
            { value: ALL, label: "Any" },
            ...LIFECYCLE_STAGES.map((value) => ({
              value,
              label: STAGE_LABEL[value as LifecycleStage],
            })),
          ]}
        />
        <FilterMenu
          label="Last activity"
          value={activity}
          onChange={setActivity}
          options={ACTIVITY_OPTIONS}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </PageToolbar>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label="Accounts"
          columns={COLUMNS}
          rows={rows}
          getId={(row) => row._id}
          getHref={(row) => `/accounts/${row._id}`}
          getLabel={(row) => row.name}
          sort={sort}
          onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
          selected={selected}
          onSelectedChange={setSelected}
          onPeek={(row) => setPeek({ type: "account", id: row._id })}
          rowMenu={(row) => [
            {
              label: "Log call",
              icon: PhoneCallIcon,
              onSelect: () =>
                setCall({ target: { accountId: row._id }, name: row.name }),
            },
            {
              label: row.archivedAt ? "Restore" : "Archive",
              icon: TrashIcon,
              tone: row.archivedAt ? undefined : "danger",
              onSelect: () => void toggleArchived(row),
            },
          ]}
          paging={paging}
          footer={[
            {
              label: "Accounts in view",
              value: viewCount(counts?.inView, rows?.length, paging),
            },
            {
              label: "Pipeline",
              value: loaded ? (
                <MoneyValue
                  totals={rankTotals(loaded.flatMap((row) => row.pipeline))}
                  compact
                />
              ) : (
                dash
              ),
            },
            {
              label: "Avg activation",
              value:
                avgActivation === null ? (
                  dash
                ) : (
                  <>
                    {avgActivation}
                    <span className="text-fg-tertiary">%</span>
                  </>
                ),
            },
            {
              label: "Open deals",
              value: loaded
                ? loaded.reduce((sum, row) => sum + row.openDeals, 0)
                : dash,
            },
          ]}
          renderCard={(row) => <AccountCard row={row} />}
          empty={
            filtered ? (
              <EmptyState
                icon={BuildingIcon}
                title="No accounts match"
                description="Try another search or clear the filters."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : view !== "all" ? (
              <EmptyState
                icon={BuildingIcon}
                title={EMPTY_VIEW[view].title}
                description={EMPTY_VIEW[view].description}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setView("all")}
                  >
                    Show all accounts
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={BuildingIcon}
                title="No accounts yet"
                description="Accounts are the brands you sell to. Add the first one, or import a CSV from your spreadsheet."
                action={
                  <span className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setImporting(true)}
                    >
                      Import CSV
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setCreate({ type: "account" })}
                    >
                      <PlusIcon aria-hidden className="size-3" />
                      New account
                    </Button>
                  </span>
                }
              />
            )
          }
        />
        <SelectionBar
          count={selectedIds.length}
          loaded={isPartial(paging) ? rows?.length : undefined}
          noun={["account", "accounts"]}
          onClear={() => setSelected(new Set())}
        >
          <OptionPicker
            value={null}
            label="Assign owner"
            align="start"
            onChange={(id) => id && void assign(id)}
            options={(members ?? []).map((member) => ({
              value: member._id,
              label: member.name,
              icon: <Avatar name={member.name} />,
            }))}
            className="h-control-sm mx-0 px-2.5 text-xs"
          >
            Assign
          </OptionPicker>
          <AddToAutomation
            kind="account"
            ids={selectedIds}
            onDone={() => setSelected(new Set())}
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void archiveSelected()}
          >
            {view === "archived" ? "Restore" : "Archive"}
          </Button>
        </SelectionBar>
      </div>
      <CsvImportDialog
        open={importing}
        onOpenChange={setImporting}
        config={importConfig}
      />
      <LogCallDialog call={call} onClose={() => setCall(null)} />
    </Page>
  );
}

const EMPTY_VIEW: Record<
  Exclude<View, "all">,
  { title: string; description: string }
> = {
  mine: {
    title: "No accounts of yours yet",
    description:
      "Accounts you own show up here. Assign yourself from the list.",
  },
  archived: {
    title: "Nothing archived",
    description: "Archived accounts stay here, ready to restore.",
  },
};

function AccountCard({ row }: { row: AccountRow }) {
  return (
    <span className="flex flex-col gap-2.5">
      <span className="flex items-center gap-3">
        <AccountLogo account={row} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="lead-style truncate font-medium">{row.name}</span>
          <span className="caption-style text-fg-tertiary truncate">
            {row.owner?.name ?? "No owner"}
            {row.openDeals > 0 &&
              ` · ${row.openDeals} open ${row.openDeals === 1 ? "deal" : "deals"}`}
          </span>
        </span>
        <span className="lead-style shrink-0">
          <MoneyValue totals={rankTotals(row.pipeline)} compact />
        </span>
      </span>
      <span className="caption-style flex items-center justify-between gap-3 pl-11">
        <StageAndTags stage={row.stage} tags={row.tags} max={1} />
        <span className="text-fg-secondary flex min-w-0 items-center gap-3">
          {row.health && (
            <HealthBadge score={row.health.score} band={row.health.band} />
          )}
          <LastInteractionCell last={row.lastInteraction} />
        </span>
      </span>
    </span>
  );
}
