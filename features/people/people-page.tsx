"use client";

import { istToday } from "@/lib/domain/day";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import SearchInput from "@/components/data-table/search-input";
import SelectionBar from "@/components/data-table/selection-bar";
import AddToAutomation from "@/features/automations/add-to-automation";
import {
  compareBy,
  type Column,
  type SortState,
} from "@/components/data-table/types";
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
  interactionLabel,
} from "@/features/accounts/record-cells";
import CsvImportDialog, {
  type ImportConfig,
} from "@/features/accounts/csv-import-dialog";
import type { TimelineTarget } from "@/features/timeline/kinds";
import LogCallDialog from "@/features/timeline/log-call-dialog";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { personName } from "@/lib/domain/labels";
import { downloadCsv } from "@/lib/csv";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import UsersIcon from "@/public/assets/icons/users.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";

type Stats = FunctionReturnType<typeof api.people.listStats>[number];
type PersonRow = FunctionReturnType<typeof api.people.list>[number] &
  Omit<Stats, "personId">;

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "lastInteraction", dir: "desc" };
const DAY = 24 * 60 * 60_000;

const VIEWS = [
  { id: "all", label: "All" },
  { id: "mine", label: "My people" },
  { id: "unlinked", label: "No account" },
] as const;
type View = (typeof VIEWS)[number]["id"];

function inView(row: PersonRow, view: View, viewerId: string) {
  if (view === "mine") return row.owner?._id === viewerId;
  if (view === "unlinked") return row.account === null;
  return true;
}

const trendTotal = (row: PersonRow) =>
  row.trend.reduce((sum, value) => sum + value, 0);

const COLUMNS: Column<PersonRow>[] = [
  {
    id: "name",
    header: "Name",
    width: "minmax(11rem,1.3fr)",
    sortValue: (row) => personName(row),
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
    sortValue: (row) => row.title,
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
    sortValue: (row) => row.account?.name ?? null,
    cell: (row) =>
      row.account ? (
        <Link
          href={`/accounts/${row.account._id}`}
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
    sortValue: (row) => row.owner?.name ?? null,
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
    defaultDir: "desc",
    minViewport: 900,
    sortValue: (row) => row.lastInteraction?.at ?? null,
    cell: (row) => <LastInteractionCell last={row.lastInteraction} />,
  },
];

const SORT_OPTIONS = [
  { value: "lastInteraction", label: "Last interaction" },
  { value: "name", label: "Name" },
  { value: "account", label: "Account" },
  { value: "owner", label: "Owner" },
];
const SORT_DIR: Record<string, "asc" | "desc"> = { lastInteraction: "desc" };

const ACTIVITY_OPTIONS = [
  { value: ALL, label: "Any time" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "stale", label: "Over 30 days ago" },
];

function activeWithin(row: PersonRow, window: string, now: number) {
  if (window === ALL) return true;
  const at = row.lastActivityAt;
  if (window === "stale") return !at || now - at > 30 * DAY;
  return at !== null && now - at <= Number(window) * DAY;
}

function exportRows(rows: PersonRow[]) {
  const day = istToday();
  downloadCsv(`people-${day}.csv`, [
    [
      "First name",
      "Last name",
      "Email",
      "Phone",
      "Title",
      "Account",
      "LinkedIn",
      "Owner",
      "Tags",
      "Last interaction",
      "Last activity",
    ],
    ...rows.map((row) => [
      row.firstName,
      row.lastName,
      row.email ?? "",
      row.phone ?? "",
      row.title ?? "",
      row.account?.name ?? "",
      row.linkedinUrl ?? "",
      row.owner?.name ?? "",
      row.tags.join(", "),
      row.lastInteraction
        ? `${new Date(row.lastInteraction.at).toISOString()} ${interactionLabel(row.lastInteraction)}`
        : "",
      row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : "",
    ]),
  ]);
}

function matches(row: PersonRow, query: string) {
  const text = [
    personName(row),
    row.email,
    row.phone,
    row.title,
    row.account?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

export default function PeoplePage() {
  const viewer = useViewer();
  const members = useMembers();
  const people = useQuery(api.people.list, {});
  const stats = useQuery(api.people.listStats, {});
  const setArchived = useMutation(api.people.setArchived);
  const importRows = useMutation(api.people.importRows);
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);

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
  const [now] = useState(() => Date.now());

  const view: View = VIEWS.some((item) => item.id === viewParam)
    ? (viewParam as View)
    : "all";

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId && column.sortValue)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const all = useMemo(() => {
    if (!people || !stats) return undefined;
    const byId = new Map(stats.map((item) => [item.personId, item]));
    return people.map(
      (person): PersonRow => ({
        ...person,
        trend: byId.get(person._id)?.trend ?? [],
        lastInteraction: byId.get(person._id)?.lastInteraction ?? null,
      }),
    );
  }, [people, stats]);

  const counts = useMemo(() => {
    if (!all) return undefined;
    return Object.fromEntries(
      VIEWS.map((item) => [
        item.id,
        all.filter((row) => inView(row, item.id, viewer._id)).length,
      ]),
    ) as Record<View, number>;
  }, [all, viewer._id]);

  const rows = useMemo(() => {
    if (!all) return undefined;
    return all.filter(
      (row) =>
        inView(row, view, viewer._id) &&
        (owner === ALL ||
          (owner === MINE
            ? row.owner?._id === viewer._id
            : row.owner?._id === owner)) &&
        activeWithin(row, activity, now) &&
        (!search.trim() || matches(row, search)),
    );
  }, [all, view, owner, activity, search, viewer._id, now]);

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

  function exportView() {
    if (!rows) return;
    const column = COLUMNS.find((item) => item.id === sort.id);
    const sorted = column?.sortValue
      ? [...rows].sort(compareBy(column, sort.dir))
      : rows;
    exportRows(sorted);
    toast(
      `Exported ${sorted.length} ${sorted.length === 1 ? "person" : "people"}`,
    );
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
              <span className="tabular-nums">{counts.all} people</span>
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
        views={VIEWS.map((item) => ({ ...item, count: counts?.[item.id] }))}
      />
      <PageToolbar
        actions={
          <>
            <ExportButton disabled={!rows?.length} onClick={exportView} />
            <CreateButton onClick={() => setCreate({ type: "person" })}>
              New person
            </CreateButton>
          </>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search people"
        />
        <FilterMenu
          label="Sort by"
          value={
            SORT_OPTIONS.some((option) => option.value === sort.id)
              ? sort.id
              : DEFAULT_SORT.id
          }
          options={SORT_OPTIONS}
          onChange={(id) => setSortParam(`${id}:${SORT_DIR[id] ?? "asc"}`)}
        />
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
          label="People"
          columns={COLUMNS}
          rows={rows}
          getId={(row) => row._id}
          getHref={(row) => `/people/${row._id}`}
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
          footer={[
            { label: "People in view", value: rows?.length ?? 0 },
            {
              label: "With an account",
              value: rows?.filter((row) => row.account).length ?? 0,
            },
            {
              label: "Active in 14 days",
              value: rows?.filter((row) => trendTotal(row) > 0).length ?? 0,
            },
            {
              label: "Timeline entries, 14 days",
              value: rows?.reduce((sum, row) => sum + trendTotal(row), 0) ?? 0,
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
          noun={["person", "people"]}
          onClear={() => setSelected(new Set())}
        >
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
