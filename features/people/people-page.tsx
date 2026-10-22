"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
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
import OptionPicker from "@/components/fields/option-picker";
import { BulkTag, TagsPopover } from "@/components/fields/tags-popover";
import AddToAutomation from "@/features/automations/add-to-automation";
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
import AccountLogo from "@/features/accounts/account-logo";
import {
  LastInteractionCell,
  OwnerCell,
  StageAndTags,
  TrendCell,
  dash,
} from "@/features/accounts/record-cells";
import CsvImportDialog, {
  type ImportConfig,
} from "@/features/accounts/csv-import-dialog";
import type { TimelineTarget } from "@/features/timeline/kinds";
import LogCallDialog from "@/features/timeline/log-call-dialog";
import { ownerOptions } from "@/features/leads/lead-meta";
import { useBulkUpdate } from "@/hooks/use-bulk-update";
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
import { personName } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import UsersIcon from "@/public/assets/icons/users.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";

type PersonRow = FunctionReturnType<typeof api.people.page>["page"][number];

const trendTotal = (row: PersonRow) =>
  row.trend.reduce((sum, value) => sum + value, 0);
type ListArgs = Omit<FunctionArgs<typeof api.people.page>, "paginationOpts">;

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "activity", dir: "desc" };

const VIEWS = [
  { id: "all", label: "All" },
  { id: "mine", label: "My people" },
  { id: "unlinked", label: "No account" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const COLUMNS: Column<PersonRow>[] = [
  {
    id: "name",
    header: "Name",
    width: "minmax(11rem,1.3fr)",
    sortable: true,
    cell: (row) => (
      <>
        <Avatar name={personName(row)} />
        <span className="truncate" title={personName(row)}>
          {personName(row)}
        </span>
      </>
    ),
  },
  {
    id: "title",
    header: "Title",
    width: "minmax(8rem,1fr)",
    minViewport: 768,
    cell: (row) =>
      row.title ? (
        <span className="text-fg-secondary truncate" title={row.title}>
          {row.title}
        </span>
      ) : (
        dash
      ),
  },
  {
    id: "account",
    header: "Account",
    width: "minmax(10rem,1.2fr)",
    cell: (row) =>
      row.account ? (
        <Link
          href={`/records/accounts/${row.account._id}`}
          className="hover:bg-overlay-2 focus-visible:ring-ring -mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 outline-none focus-visible:ring-2"
        >
          <AccountLogo account={row.account} size="xs" />
          <span className="truncate">{row.account.name}</span>
        </Link>
      ) : (
        dash
      ),
  },
  {
    id: "tags",
    header: "Tags",
    width: "minmax(8rem,1fr)",
    minViewport: 1360,
    cell: (row) => (row.tags.length ? <StageAndTags tags={row.tags} /> : dash),
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(9rem,1fr)",
    minViewport: 1024,
    cell: (row) => <OwnerCell owner={row.owner} />,
  },
  {
    id: "trend",
    header: "Activity trend",
    width: "7rem",
    minViewport: 1180,
    cell: (row) => <TrendCell values={row.trend} />,
  },
  {
    id: "lastInteraction",
    header: "Last interaction",
    width: "minmax(9rem,1fr)",
    minViewport: 900,
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

export default function PeoplePage() {
  const viewer = useViewer();
  const members = useMembers();
  const setArchived = useMutation(api.people.setArchived);
  const update = useMutation(api.people.update);
  const bulk = useBulkUpdate(update);
  const importRows = useMutation(api.people.importRows);
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);
  const { exportCsv, pending: exporting } = useCsvExport(["person", "people"]);

  const [viewParam, setView] = useUrlState("view", "all");
  const [search, setSearch] = useUrlState("q", "");
  const [owner, setOwner] = useUrlState("owner", ALL);
  const [activity, setActivity] = useUrlState("activity", ALL);
  const [importing, setImporting] = useState(false);
  const [call, setCall] = useState<{
    target: TimelineTarget;
    name: string;
  } | null>(null);
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const query = useDebouncedValue(search);

  const view: View = VIEWS.some((item) => item.id === viewParam)
    ? (viewParam as View)
    : "all";

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: SORT_OPTIONS.some((option) => option.value === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const args: ListArgs = {
    ownerId: (view === "mine" || owner === MINE
      ? viewer._id
      : owner === ALL
        ? undefined
        : owner) as Id<"members"> | undefined,
    linked: view === "unlinked" ? false : undefined,
    activity: WINDOWS.find((value) => value === activity),
    search: query.trim() || undefined,
    sort: sort.id as ListArgs["sort"],
    dir: sort.dir,
  };
  const { rows, paging } = usePagedList(api.people.page, args);
  const loaded = allRows(rows, paging);
  const counts = useQuery(api.people.counts, args);

  const columns = COLUMNS.map((column): Column<PersonRow> => {
    if (column.id === "tags")
      return {
        ...column,
        cell: (row) => (
          <TagsPopover
            label="Tags"
            value={row.tags}
            onChange={(tags) => void bulk([row._id], () => ({ tags }), "Tags")}
          >
            {row.tags.length ? (
              <StageAndTags tags={row.tags} />
            ) : (
              <span className="text-fg-tertiary text-xs">Add tag</span>
            )}
          </TagsPopover>
        ),
      };
    if (column.id === "owner")
      return {
        ...column,
        cell: (row) => (
          <OptionPicker
            label="Owner"
            value={row.owner?._id ?? null}
            align="start"
            options={ownerOptions(members, row.owner)}
            onChange={(next) =>
              next &&
              void bulk(
                [row._id],
                () => ({ ownerId: next as Id<"members"> }),
                "Owner",
              )
            }
          >
            <OwnerCell owner={row.owner} />
          </OptionPicker>
        ),
      };
    return column;
  });

  const filtered = owner !== ALL || activity !== ALL || search.trim() !== "";
  const selectedIds = [...selected].filter((id) =>
    rows?.some((row) => row._id === id),
  ) as Id<"people">[];

  function clearFilters() {
    setSearch("");
    setOwner(ALL);
    setActivity(ALL);
  }

  async function toggleArchived(row: PersonRow) {
    try {
      await setArchived({ ids: [row._id], archived: true });
      toast(
        `${personName(row)} archived`,
        () => void setArchived({ ids: [row._id], archived: false }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  const importConfig: ImportConfig = {
    noun: ["person", "people"],
    fields: [
      {
        key: "firstName",
        label: "First name",
        required: true,
        aliases: ["first", "given name", "name", "full name", "contact name"],
      },
      {
        key: "lastName",
        label: "Last name",
        aliases: ["last", "surname", "family name"],
      },
      {
        key: "email",
        label: "Email",
        aliases: ["email address", "e mail", "mail"],
      },
      {
        key: "phone",
        label: "Phone",
        aliases: [
          "mobile",
          "phone number",
          "mobile number",
          "whatsapp",
          "contact",
        ],
      },
      {
        key: "title",
        label: "Title",
        aliases: ["job title", "role", "designation", "position"],
      },
      {
        key: "account",
        label: "Account",
        aliases: [
          "company",
          "company name",
          "account name",
          "brand",
          "website",
          "domain",
        ],
      },
      {
        key: "linkedinUrl",
        label: "LinkedIn",
        aliases: ["linkedin url", "linkedin profile"],
      },
      { key: "owner", label: "Owner", aliases: ["owner email", "rep"] },
      { key: "tags", label: "Tags", aliases: ["labels", "tag"] },
    ],
    example: [
      "Priya",
      "Sharma",
      "priya@kesarleaf.in",
      "98765 43210",
      "Founder",
      "kesarleaf.in",
      "",
      viewer.email,
      "Decision maker",
    ],
    run: (rows, dryRun) =>
      importRows({
        dryRun,
        rows: rows.map((row) => ({ ...row, firstName: row.firstName ?? "" })),
      }),
    describe: (row) => [
      [row.firstName, row.lastName].filter(Boolean).join(" "),
      [row.email, row.phone, row.account].filter(Boolean).join(" · "),
    ],
  };

  async function archive() {
    const ids = selectedIds;
    try {
      await setArchived({ ids, archived: true });
      setSelected(new Set());
      toast(
        `Archived ${ids.length} ${ids.length === 1 ? "person" : "people"}`,
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
        title="People"
        meta={
          counts && (
            <PageStatus>
              <span className="tabular-nums">
                {counts.views.all.toLocaleString("en-IN")} people
              </span>
            </PageStatus>
          )
        }
        actions={
          <PageActions
            label="People list actions"
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
        activeFilters={
          [owner, activity].filter((value) => value !== ALL).length
        }
        onClearFilters={clearFilters}
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search people"
          />
        }
        actions={
          <>
            <SavedViewsMenu />
            <ExportButton
              disabled={!rows?.length || exporting}
              onClick={() => void exportCsv({ name: "people", args })}
            />
            <CreateButton onClick={() => setCreate({ type: "person" })}>
              New person
            </CreateButton>
          </>
        }
      >
        <FilterMenu
          label="Sort by"
          value={sort.id}
          options={SORT_OPTIONS}
          onChange={(id) => setSortParam(`${id}:${SORT_DIR[id] ?? "desc"}`)}
        />
        {view !== "mine" && (
          <FilterMenu
            label="Owner"
            value={owner}
            onChange={setOwner}
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
          label="Last activity"
          value={activity}
          onChange={setActivity}
          options={ACTIVITY_OPTIONS}
        />
        {filtered && (
          <Button
            variant="ghost"
            size="xs"
            data-filter-clear
            onClick={clearFilters}
          >
            Clear
          </Button>
        )}
      </PageToolbar>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <DataTable
          label="People"
          columns={columns}
          rows={rows}
          getId={(row) => row._id}
          getHref={(row) => `/records/people/${row._id}`}
          getLabel={(row) => personName(row)}
          sort={sort}
          onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
          selected={selected}
          onSelectedChange={setSelected}
          onPeek={(row) => setPeek({ type: "person", id: row._id })}
          rowMenu={(row) => [
            {
              label: "Log call",
              icon: PhoneCallIcon,
              onSelect: () =>
                setCall({
                  target: { personId: row._id },
                  name: personName(row),
                }),
            },
            {
              label: "Archive",
              icon: TrashIcon,
              tone: "danger",
              onSelect: () => void toggleArchived(row),
            },
          ]}
          paging={paging}
          footer={[
            {
              label: "People in view",
              value: viewCount(counts?.inView, rows?.length, paging),
            },
            {
              label: "With an account",
              value: loaded?.filter((row) => row.account).length ?? dash,
            },
            {
              label: "Active in 14 days",
              value:
                loaded?.filter((row) => trendTotal(row) > 0).length ?? dash,
            },
            {
              label: "Timeline entries, 14 days",
              value:
                loaded?.reduce((sum, row) => sum + trendTotal(row), 0) ?? dash,
            },
          ]}
          renderCard={(row) => (
            <span className="flex items-center gap-3">
              <Avatar name={personName(row)} size="md" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="lead-style truncate font-medium">
                  {personName(row)}
                </span>
                <span className="caption-style text-fg-tertiary flex min-w-0 items-center gap-1.5">
                  {row.account && (
                    <AccountLogo
                      account={row.account}
                      size="xs"
                      className="size-4"
                    />
                  )}
                  <span className="truncate">
                    {[row.title, row.account?.name]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </span>
                </span>
              </span>
              {row.lastInteraction && (
                <span className="caption-style text-fg-secondary shrink-0">
                  <LastInteractionCell last={row.lastInteraction} />
                </span>
              )}
            </span>
          )}
          empty={
            filtered ? (
              <EmptyState
                icon={UsersIcon}
                title="No people match"
                description="Try another search or clear the filters."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : view !== "all" ? (
              <EmptyState
                icon={UsersIcon}
                title={
                  view === "mine"
                    ? "Nobody assigned to you yet"
                    : "Everyone has an account"
                }
                description={
                  view === "mine"
                    ? "People you own show up here."
                    : "People without an account show up here, so you can link them to the brand they work for."
                }
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setView("all")}
                  >
                    Show everyone
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={UsersIcon}
                title="No people yet"
                description="Add the founders, marketplace managers and marketers you talk to, or import them from a CSV."
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
                      onClick={() => setCreate({ type: "person" })}
                    >
                      <PlusIcon aria-hidden className="size-3" />
                      New person
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
          noun={["person", "people"]}
          onClear={() => setSelected(new Set())}
        >
          <OptionPicker
            value={null}
            label="Assign owner"
            align="start"
            onChange={(next) =>
              next &&
              void bulk(
                selectedIds,
                () => ({ ownerId: next as Id<"members"> }),
                "Owner",
              )
            }
            options={ownerOptions(members, null)}
            className="h-control-sm mx-0 px-2.5 text-xs"
          >
            Assign
          </OptionPicker>
          <BulkTag
            onAdd={(tag) => {
              const byId = new Map(rows?.map((row) => [row._id, row.tags]));
              void bulk(
                selectedIds,
                (id) => ({
                  tags: [...new Set([...(byId.get(id) ?? []), tag])],
                }),
                "Tags",
              );
            }}
          />
          <AddToAutomation
            kind="person"
            ids={selectedIds}
            onDone={() => setSelected(new Set())}
          />
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
