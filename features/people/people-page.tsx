"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import RowAction from "@/components/data-table/row-action";
import SearchInput from "@/components/data-table/search-input";
import SelectionBar from "@/components/data-table/selection-bar";
import Tooltip from "@/components/_ui/tooltip";
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
import AccountLogo from "@/features/accounts/account-logo";
import CsvImportDialog, {
  type ImportConfig,
} from "@/features/accounts/csv-import-dialog";
import type { TimelineTarget } from "@/features/timeline/kinds";
import LogCallDialog from "@/features/timeline/log-call-dialog";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { personName } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import { downloadCsv } from "@/lib/csv";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import UsersIcon from "@/public/assets/icons/users.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import PhoneCallIcon from "@/public/assets/icons/phone-call.svg";

type PersonRow = FunctionReturnType<typeof api.people.list>[number];

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "activity", dir: "desc" };

const dash = <span className="text-fg-tertiary">—</span>;

const COLUMNS: Column<PersonRow>[] = [
  {
    id: "name",
    header: "Name",
    width: "minmax(12rem,1.3fr)",
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
    id: "account",
    header: "Account",
    width: "minmax(10rem,1.3fr)",
    sortValue: (row) => row.account?.name ?? null,
    cell: (row) =>
      row.account ? (
        <Link
          href={`/accounts/${row.account._id}`}
          className="hover:bg-overlay-2 -mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1"
        >
          <AccountLogo account={row.account} size="xs" />
          <span className="truncate">{row.account.name}</span>
        </Link>
      ) : (
        dash
      ),
  },
  {
    id: "title",
    header: "Title",
    width: "minmax(9rem,1fr)",
    minViewport: 768,
    sortValue: (row) => row.title,
    cell: (row) =>
      row.title ? (
        <span className="text-fg-secondary truncate">{row.title}</span>
      ) : (
        dash
      ),
  },
  {
    id: "email",
    header: "Email",
    width: "minmax(12rem,1.3fr)",
    minViewport: 1024,
    sortValue: (row) => row.email,
    cell: (row) =>
      row.email ? (
        <a
          href={`mailto:${row.email}`}
          className="text-fg-secondary hover:text-foreground truncate"
        >
          {row.email}
        </a>
      ) : (
        dash
      ),
  },
  {
    id: "phone",
    header: "Phone",
    width: "9.5rem",
    minViewport: 1280,
    cell: (row) =>
      row.phone ? (
        <a
          href={`tel:${row.phone}`}
          className="text-fg-secondary hover:text-foreground tabular-nums"
        >
          {formatPhone(row.phone)}
        </a>
      ) : (
        dash
      ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "minmax(9.5rem,1fr)",
    minViewport: 1100,
    sortValue: (row) => row.owner?.name ?? null,
    cell: (row) =>
      row.owner ? (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={row.owner.name} />
          <span className="truncate">{row.owner.name}</span>
        </span>
      ) : (
        dash
      ),
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

function exportRows(rows: PersonRow[]) {
  const day = new Date().toISOString().slice(0, 10);
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
  const router = useRouter();
  const viewer = useViewer();
  const members = useMembers();
  const people = useQuery(api.people.list, {});
  const setArchived = useMutation(api.people.setArchived);
  const importRows = useMutation(api.people.importRows);
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);

  const [search, setSearch] = useUrlState("q", "");
  const [owner, setOwner] = useUrlState("owner", ALL);
  const [account, setAccount] = useUrlState("account", ALL);
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

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId)
      ? sortId
      : DEFAULT_SORT.id,
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const rows = useMemo(() => {
    if (!people) return undefined;
    return people.filter(
      (row) =>
        (owner === ALL ||
          (owner === MINE
            ? row.owner?._id === viewer._id
            : row.owner?._id === owner)) &&
        (account === ALL || (account === "none") === (row.account === null)) &&
        (!search.trim() || matches(row, search)),
    );
  }, [people, owner, account, search, viewer._id]);

  const filtered = owner !== ALL || account !== ALL || search.trim() !== "";
  const selectedIds = [...selected].filter((id) =>
    rows?.some((row) => row._id === id),
  ) as Id<"people">[];

  function clearFilters() {
    setSearch("");
    setOwner(ALL);
    setAccount(ALL);
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
          people && (
            <span className="caption-style text-fg-tertiary tabular-nums">
              {people.length}
            </span>
          )
        }
        actions={
          <PageActions
            label="People list actions"
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
                onClick={() => setCreate({ type: "person" })}
              >
                <PlusIcon aria-hidden className="size-3" />
                New person
              </Button>
            }
          />
        }
      />
      <PageToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search people"
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
          label="Account"
          value={account}
          onChange={setAccount}
          options={[
            { value: ALL, label: "Any" },
            { value: "some", label: "Has an account" },
            { value: "none", label: "No account" },
          ]}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
        {rows && filtered && (
          <span className="caption-style text-fg-tertiary ml-auto tabular-nums">
            {rows.length} of {people?.length}
          </span>
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
          rowActions={(row) => (
            <>
              <RowAction
                label="Log call"
                icon={PhoneCallIcon}
                onClick={() =>
                  setCall({
                    target: { personId: row._id },
                    name: personName(row),
                  })
                }
              />
              <RowAction
                label="Peek"
                shortcut="Space"
                icon={EyeIcon}
                onClick={() => setPeek({ type: "person", id: row._id })}
              />
              <RowAction
                label="Open"
                shortcut="↵"
                icon={ArrowRightIcon}
                onClick={() => router.push(`/people/${row._id}`)}
              />
            </>
          )}
          renderCard={(row) => (
            <span className="flex items-center gap-3">
              <Avatar name={personName(row)} size="md" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="lead-style truncate font-medium">
                  {personName(row)}
                </span>
                <span className="caption-style text-fg-tertiary truncate">
                  {[row.title, row.account?.name].filter(Boolean).join(" · ") ||
                    "No details yet"}
                </span>
              </span>
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
