"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Tooltip from "@/components/_ui/tooltip";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import RowAction from "@/components/data-table/row-action";
import SearchInput from "@/components/data-table/search-input";
import SelectionBar from "@/components/data-table/selection-bar";
import OptionPicker from "@/components/fields/option-picker";
import {
  compareBy,
  type Column,
  type SortState,
} from "@/components/data-table/types";
import {
  Page,
  PageActions,
  PageHeader,
  PageToolbar,
} from "@/components/shell/page";
import { formatTotals } from "@/features/deals/format";
import LogCallDialog from "@/features/timeline/log-call-dialog";
import type { TimelineTarget } from "@/features/timeline/kinds";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { downloadCsv } from "@/lib/csv";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/domain/enums";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { CURRENCIES, formatMoney, type Money } from "@/lib/domain/money";
import { ACTIVATION_STAGES } from "@/lib/domain/platform";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import AccountLogo from "./account-logo";
import CsvImportDialog, { type ImportConfig } from "./csv-import-dialog";
import { StageTag } from "./stage";

type Stats = FunctionReturnType<typeof api.accounts.listStats>[number];

export type AccountRow = FunctionReturnType<
  typeof api.accounts.list
>[number] & {
  openDeals: number;
  pipeline: Money[];
  gstVerified: boolean;
};

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "activity", dir: "desc" };
const dash = <span className="text-fg-tertiary">—</span>;

/** Steps done on the activation path, or null when not on the platform. */
function platformProgress(row: Pick<AccountRow, "linked" | "stage">) {
  if (!row.linked) return null;
  if (row.stage === "expanding") return ACTIVATION_STAGES.length;
  return (
    (ACTIVATION_STAGES as readonly string[]).indexOf(row.stage) + 1 || null
  );
}

function pipelineValue(pipeline: Money[]) {
  return pipeline.find((money) => money.currency === "INR")?.amount ?? 0;
}

function PlatformCell({ row }: { row: AccountRow }) {
  if (!row.linked) return dash;
  const done = platformProgress(row);
  const total = ACTIVATION_STAGES.length;
  return (
    <Tooltip
      content={done ? `${done} of ${total} activation steps` : "On Hypedrive"}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="flex gap-0.5">
          {ACTIVATION_STAGES.map((stage, index) => (
            <span
              key={stage}
              className={cn(
                "h-2.5 w-1 rounded-full",
                done && index < done ? "bg-success" : "bg-line-strong",
              )}
            />
          ))}
        </span>
        <span className="text-fg-secondary truncate text-sm">
          {done ? STAGE_LABEL[ACTIVATION_STAGES[done - 1]] : "Linked"}
        </span>
      </span>
    </Tooltip>
  );
}

const COLUMNS: Column<AccountRow>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(14rem,2fr)",
    sortValue: (row) => row.name,
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
    header: "Stage",
    width: "minmax(8rem,1fr)",
    sortValue: (row) => LIFECYCLE_STAGES.indexOf(row.stage),
    cell: (row) => <StageTag stage={row.stage} />,
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(9rem,1fr)",
    sortValue: (row) => row.owner?.name ?? null,
    cell: (row) =>
      row.owner ? (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={row.owner.name} />
          <span className="truncate">{row.owner.name}</span>
        </span>
      ) : (
        <span className="text-fg-tertiary">No owner</span>
      ),
  },
  {
    id: "deals",
    header: "Open deals",
    width: "6.5rem",
    align: "end",
    defaultDir: "desc",
    minViewport: 900,
    sortValue: (row) => row.openDeals,
    cell: (row) => (row.openDeals ? <span>{row.openDeals}</span> : dash),
  },
  {
    id: "pipeline",
    header: "Pipeline",
    width: "minmax(7rem,0.8fr)",
    align: "end",
    defaultDir: "desc",
    minViewport: 900,
    sortValue: (row) => pipelineValue(row.pipeline),
    cell: (row) => {
      const total = formatTotals(row.pipeline, "");
      if (!total) return dash;
      return (
        <Tooltip
          content={row.pipeline
            .filter((money) => money.amount > 0)
            .sort(
              (a, b) =>
                CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency),
            )
            .map((money) => formatMoney(money))
            .join(" · ")}
        >
          <span className="truncate">{total}</span>
        </Tooltip>
      );
    },
  },
  {
    id: "platform",
    header: "Platform",
    width: "minmax(9rem,1fr)",
    minViewport: 1180,
    sortValue: (row) => (row.linked ? (platformProgress(row) ?? 0) : null),
    defaultDir: "desc",
    cell: (row) => <PlatformCell row={row} />,
  },
  {
    id: "gst",
    header: "GST",
    width: "4.5rem",
    minViewport: 1180,
    sortValue: (row) => (row.gstVerified ? 2 : row.gstin ? 1 : null),
    defaultDir: "desc",
    cell: (row) =>
      row.gstVerified ? (
        <Tooltip content={`Verified · ${row.gstin}`}>
          <span
            role="img"
            aria-label="GSTIN verified"
            className="bg-success/15 text-success flex size-5 items-center justify-center rounded-full"
          >
            <svg viewBox="0 0 12 12" fill="none" className="size-3">
              <path
                d="M3 6.25 5 8.25 9 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </Tooltip>
      ) : row.gstin ? (
        <Tooltip content={`Not verified yet · ${row.gstin}`}>
          <span
            role="img"
            aria-label="GSTIN not verified"
            className="border-line-strong flex size-5 items-center justify-center rounded-full border border-dashed"
          />
        </Tooltip>
      ) : (
        dash
      ),
  },
  {
    id: "people",
    header: "People",
    width: "5rem",
    align: "end",
    defaultDir: "desc",
    minViewport: 1360,
    sortValue: (row) => row.peopleCount,
    cell: (row) => (row.peopleCount ? <span>{row.peopleCount}</span> : dash),
  },
  {
    id: "activity",
    header: "Last activity",
    width: "8.5rem",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => row.lastActivityAt,
    cell: (row) =>
      row.lastActivityAt ? (
        <Tooltip content={dateTime(row.lastActivityAt)}>
          <span className="text-fg-secondary">
            {relativeTime(row.lastActivityAt)}
          </span>
        </Tooltip>
      ) : (
        dash
      ),
  },
];

function matches(row: AccountRow, query: string) {
  const text =
    `${row.name} ${row.domain ?? ""} ${row.gstin ?? ""} ${row.tags.join(" ")} ${row.owner?.name ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

function exportRows(rows: AccountRow[]) {
  const day = new Date().toISOString().slice(0, 10);
  downloadCsv(`accounts-${day}.csv`, [
    [
      "Name",
      "Website",
      "Stage",
      "Owner",
      "People",
      "Open deals",
      "Pipeline",
      "On platform",
      "GSTIN",
      "GST verified",
      "Tags",
      "Last activity",
    ],
    ...rows.map((row) => [
      row.name,
      row.domain ?? "",
      STAGE_LABEL[row.stage],
      row.owner?.name ?? "",
      row.peopleCount,
      row.openDeals,
      row.pipeline
        .filter((money) => money.amount > 0)
        .map((money) => formatMoney(money))
        .join(" + "),
      row.linked ? "Yes" : "No",
      row.gstin ?? "",
      row.gstVerified ? "Yes" : "No",
      row.tags.join(", "),
      row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : "",
    ]),
  ]);
}

export default function AccountsPage() {
  const router = useRouter();
  const viewer = useViewer();
  const members = useMembers();
  const accounts = useQuery(api.accounts.list, {});
  const stats = useQuery(api.accounts.listStats, {});
  const setOwner = useMutation(api.accounts.setOwner);
  const setArchived = useMutation(api.accounts.setArchived);
  const importRows = useMutation(api.accounts.importRows);
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);

  const [search, setSearch] = useUrlState("q", "");
  const [stage, setStage] = useUrlState("stage", ALL);
  const [owner, setOwnerFilter] = useUrlState("owner", ALL);
  const [platform, setPlatform] = useUrlState("platform", ALL);
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

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const all = useMemo(() => {
    if (!accounts) return undefined;
    const byId = new Map<string, Stats>(
      (stats ?? []).map((item) => [item.accountId, item]),
    );
    return accounts.map((account): AccountRow => {
      const item = byId.get(account._id);
      return {
        ...account,
        openDeals: item?.openDeals ?? 0,
        pipeline: item?.pipeline ?? [],
        gstVerified: item?.gstVerified ?? false,
      };
    });
  }, [accounts, stats]);

  const rows = useMemo(() => {
    if (!all) return undefined;
    return all.filter(
      (row) =>
        (stage === ALL || row.stage === stage) &&
        (owner === ALL ||
          (owner === MINE
            ? row.owner?._id === viewer._id
            : row.owner?._id === owner)) &&
        (platform === ALL ||
          (platform === "linked" ? row.linked : !row.linked)) &&
        (!search.trim() || matches(row, search)),
    );
  }, [all, stage, owner, platform, search, viewer._id]);

  const filtered =
    stage !== ALL || owner !== ALL || platform !== ALL || search.trim() !== "";
  const selectedIds = [...selected].filter((id) =>
    rows?.some((row) => row._id === id),
  ) as Id<"accounts">[];

  function clearFilters() {
    setSearch("");
    setStage(ALL);
    setOwnerFilter(ALL);
    setPlatform(ALL);
  }

  function exportView() {
    if (!rows) return;
    const column = COLUMNS.find((item) => item.id === sort.id);
    const sorted = column?.sortValue
      ? [...rows].sort(compareBy(column, sort.dir))
      : rows;
    exportRows(sorted);
    toast(
      `Exported ${sorted.length} ${sorted.length === 1 ? "account" : "accounts"}`,
    );
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

  async function archive() {
    const ids = selectedIds;
    try {
      await setArchived({ ids, archived: true });
      setSelected(new Set());
      toast(
        `Archived ${ids.length} ${ids.length === 1 ? "account" : "accounts"}`,
        () => {
          void setArchived({ ids, archived: false });
        },
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
          accounts && (
            <span className="caption-style text-fg-tertiary tabular-nums">
              {accounts.length}
            </span>
          )
        }
        actions={
          <PageActions
            label="Account list actions"
            actions={[
              { label: "Import CSV", onSelect: () => setImporting(true) },
              {
                label: filtered ? "Export this view" : "Export CSV",
                disabled: !rows?.length,
                onSelect: exportView,
              },
            ]}
            primary={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreate({ type: "account" })}
              >
                <PlusIcon aria-hidden className="size-3" />
                New account
              </Button>
            }
          />
        }
      />
      <PageToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search accounts"
        />
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
        <FilterMenu
          label="Platform"
          value={platform}
          onChange={setPlatform}
          options={[
            { value: ALL, label: "Any" },
            { value: "linked", label: "On Hypedrive" },
            { value: "unlinked", label: "Not on Hypedrive" },
          ]}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
        {rows && filtered && (
          <span className="caption-style text-fg-tertiary ml-auto tabular-nums">
            {rows.length} of {accounts?.length}
          </span>
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
          rowActions={(row) => (
            <>
              <RowAction
                label="Log call"
                icon={PhoneCallIcon}
                onClick={() =>
                  setCall({ target: { accountId: row._id }, name: row.name })
                }
              />
              <RowAction
                label="Peek"
                shortcut="Space"
                icon={EyeIcon}
                onClick={() => setPeek({ type: "account", id: row._id })}
              />
              <RowAction
                label="Open"
                shortcut="↵"
                icon={ArrowRightIcon}
                onClick={() => router.push(`/accounts/${row._id}`)}
              />
            </>
          )}
          renderCard={(row) => (
            <span className="flex items-center gap-3">
              <AccountLogo account={row} size="md" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="lead-style truncate font-medium">
                  {row.name}
                </span>
                <span className="caption-style text-fg-tertiary truncate">
                  {[
                    row.owner?.name ?? "No owner",
                    row.openDeals
                      ? `${row.openDeals} open · ${formatTotals(row.pipeline, "")}`
                      : null,
                    row.lastActivityAt
                      ? relativeTime(row.lastActivityAt)
                      : "No activity",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <StageTag stage={row.stage} />
            </span>
          )}
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
          <Button variant="ghost" size="xs" onClick={() => void archive()}>
            Archive
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
