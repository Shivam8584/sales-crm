"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import SearchInput from "@/components/data-table/search-input";
import SelectionBar from "@/components/data-table/selection-bar";
import OptionPicker from "@/components/fields/option-picker";
import type { Column, SortState } from "@/components/data-table/types";
import { Page, PageHeader, PageToolbar } from "@/components/shell/page";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/domain/enums";
import { STAGE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import AccountLogo from "./account-logo";
import { StageTag } from "./stage";

export type AccountRow = FunctionReturnType<typeof api.accounts.list>[number];

const ALL = "all";
const MINE = "mine";
const DEFAULT_SORT: SortState = { id: "activity", dir: "desc" };

const COLUMNS: Column<AccountRow>[] = [
  {
    id: "name",
    header: "Account",
    width: "minmax(14rem,2fr)",
    sortValue: (row) => row.name,
    cell: (row) => (
      <>
        <AccountLogo account={row} size="xs" />
        <span className="truncate">{row.name}</span>
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
    width: "minmax(10rem,1fr)",
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
    id: "people",
    header: "People",
    width: "6rem",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => row.peopleCount,
    cell: (row) => (
      <span className={row.peopleCount ? undefined : "text-fg-tertiary"}>
        {row.peopleCount}
      </span>
    ),
  },
  {
    id: "domain",
    header: "Website",
    width: "minmax(9rem,1fr)",
    minViewport: 1100,
    sortValue: (row) => row.domain,
    cell: (row) =>
      row.domain ? (
        <span className="text-fg-secondary truncate">{row.domain}</span>
      ) : (
        <span className="text-fg-tertiary">—</span>
      ),
  },
  {
    id: "activity",
    header: "Last activity",
    width: "9rem",
    align: "end",
    defaultDir: "desc",
    sortValue: (row) => row.lastActivityAt,
    cell: (row) => (
      <span className="text-fg-secondary">
        {row.lastActivityAt ? relativeTime(row.lastActivityAt) : "—"}
      </span>
    ),
  },
];

function matches(row: AccountRow, query: string) {
  const text = `${row.name} ${row.domain ?? ""} ${row.tags.join(" ")} ${row.owner?.name ?? ""}`;
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.toLowerCase().includes(word));
}

export default function AccountsPage() {
  const viewer = useViewer();
  const members = useMembers();
  const accounts = useQuery(api.accounts.list, {});
  const setOwner = useMutation(api.accounts.setOwner);
  const setArchived = useMutation(api.accounts.setArchived);
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);

  const [search, setSearch] = useState("");
  const [stage, setStage] = useUrlState("stage", ALL);
  const [owner, setOwnerFilter] = useUrlState("owner", ALL);
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
    if (!accounts) return undefined;
    return accounts.filter(
      (row) =>
        (stage === ALL || row.stage === stage) &&
        (owner === ALL ||
          (owner === MINE
            ? row.owner?._id === viewer._id
            : row.owner?._id === owner)) &&
        (!search.trim() || matches(row, search)),
    );
  }, [accounts, stage, owner, search, viewer._id]);

  const filtered = stage !== ALL || owner !== ALL || search.trim() !== "";
  const selectedIds = [...selected].filter((id) =>
    rows?.some((row) => row._id === id),
  ) as Id<"accounts">[];

  function clearFilters() {
    setSearch("");
    setStage(ALL);
    setOwnerFilter(ALL);
  }

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
      toast(readError(error).message);
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
      toast(readError(error).message);
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
          renderCard={(row) => (
            <span className="flex items-center gap-3">
              <AccountLogo account={row} size="md" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="lead-style truncate font-medium">
                  {row.name}
                </span>
                <span className="caption-style text-fg-tertiary truncate">
                  {row.owner?.name ?? "No owner"} ·{" "}
                  {row.lastActivityAt
                    ? relativeTime(row.lastActivityAt)
                    : "No activity"}
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
                description="Accounts are the brands you sell to. Add the first one to start tracking it."
                action={
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
    </Page>
  );
}
