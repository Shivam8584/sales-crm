"use client";

import { dayStart, istToday } from "@/lib/domain/day";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import FilterMenu from "@/components/_common/filter-menu";
import Board, {
  type BoardColumnDef,
  type BoardSort,
} from "@/components/board/board";
import { useBoardPrefs } from "@/components/board/board-prefs";
import { HiddenColumnsToggle } from "@/components/board/hidden-columns";
import DataTable from "@/components/data-table/data-table";
import RowAction from "@/components/data-table/row-action";
import SearchInput from "@/components/data-table/search-input";
import type { Column, SortState } from "@/components/data-table/types";
import {
  CreateButton,
  ExportButton,
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
} from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import Segmented from "@/features/tasks/segmented";
import { useCsvExport } from "@/hooks/use-csv-export";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList, viewCount } from "@/hooks/use-paged-list";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { DEAL_STAGES, type DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import ListIcon from "@/public/assets/icons/list.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import DealCard from "./deal-card";
import DealQuickAdd from "./deal-quick-add";
import { formatDay, formatTotals, today as todayDay } from "./format";
import LostReasonDialog from "./lost-reason-dialog";
import { DEAL_STAGE_BADGE, DealStageTag, isOpenStage } from "./stage";
import { positionBefore, useMoveDeal, type DealRow } from "./use-deal-actions";

const ZERO = formatMoney({ amount: 0, currency: DEFAULT_CURRENCY });
const ALL = "all";
const MINE = "mine";
const SHOW = "show";
const HIDE = "hide";
const BOARD = "board";
const LIST = "list";
const CLOSE_MONTH = "month";
const CLOSE_OVERDUE = "overdue";
const CLOSE_NONE = "none";
const DEFAULT_SORT: SortState = { id: "close", dir: "asc" };
const CLOSED_WINDOW_MS = 30 * 24 * 60 * 60_000;

type ListArgs = Omit<FunctionArgs<typeof api.deals.page>, "paginationOpts">;

type BoardDeal = DealRow & { id: string };
type PendingLost = { deal: DealRow; position: number };

const stageOf = (item: BoardDeal) => item.stage;
const labelOf = (item: BoardDeal) => item.title;

const SORTS: BoardSort<BoardDeal>[] = [
  {
    id: "amount",
    label: "amount",
    compare: (a, b) =>
      a.amount.currency.localeCompare(b.amount.currency) ||
      b.amount.amount - a.amount.amount ||
      a.position - b.position,
  },
  {
    id: "close",
    label: "close date",
    compare: (a, b) =>
      (a.closeDate ?? "9999").localeCompare(b.closeDate ?? "9999") ||
      a.position - b.position,
  },
];

function matches(deal: DealRow, query: string) {
  const text =
    `${deal.title} ${deal.account?.name ?? ""} ${deal.owner?.name ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

function startOfMonth() {
  return dayStart(`${istToday().slice(0, 7)}-01`);
}

function closeMatches(deal: DealRow, filter: string, today: string) {
  if (filter === ALL) return true;
  if (filter === CLOSE_NONE) return deal.closeDate === null;
  if (deal.closeDate === null) return false;
  if (filter === CLOSE_MONTH)
    return deal.closeDate.slice(0, 7) === today.slice(0, 7);
  return isOpenStage(deal.stage) && deal.closeDate < today;
}

/**
 * The pipeline: deals by stage on a board or in a list, with per-currency
 * totals. The board holds every open deal and those closed this month or in
 * the last 30 days; the list pages through all deals on the server.
 */
export default function DealsPage() {
  const router = useRouter();
  const viewer = useViewer();
  const members = useMembers();
  const [closedSince] = useState(() =>
    Math.min(startOfMonth(), Date.now() - CLOSED_WINDOW_MS),
  );
  const deals = useQuery(api.deals.board, { closedSince });
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);
  const moveDeal = useMoveDeal();
  const boardPrefs = useBoardPrefs("deals");

  const [search, setSearch] = useState("");
  const [view, setView] = useUrlState("view", BOARD);
  const [owner, setOwner] = useUrlState("owner", ALL);
  const [account, setAccount] = useUrlState("account", ALL);
  const [close, setClose] = useUrlState("close", ALL);
  const [closed, setClosed] = useUrlState("closed", SHOW);
  const [sortParam, setSortParam] = useUrlState(
    "sort",
    `${DEFAULT_SORT.id}:${DEFAULT_SORT.dir}`,
  );
  const [pending, setPending] = useState<PendingLost | null>(null);
  const { exportCsv, pending: exporting } = useCsvExport(["deal", "deals"]);
  const query = useDebouncedValue(search);
  const [drafting, setDrafting] = useState<DealStage | null>(null);
  const [draftAccount, setDraftAccount] = useState<string | null>(null);
  const today = todayDay();
  const listView = view === LIST;

  const matching = useMemo(() => {
    if (!deals) return undefined;
    return deals.filter(
      (deal) =>
        (owner === ALL ||
          deal.ownerId === (owner === MINE ? viewer._id : owner)) &&
        (account === ALL || deal.accountId === account) &&
        closeMatches(deal, close, today) &&
        (!search.trim() || matches(deal, search)),
    );
  }, [deals, owner, account, close, search, viewer._id, today]);

  const visible = useMemo(
    () =>
      (matching ?? []).filter(
        (deal) => closed === SHOW || isOpenStage(deal.stage),
      ),
    [matching, closed],
  );

  const stages = useMemo(
    () => DEAL_STAGES.filter((stage) => closed === SHOW || isOpenStage(stage)),
    [closed],
  );

  const items = useMemo<BoardDeal[]>(
    () =>
      visible
        .map((deal) =>
          pending && deal._id === pending.deal._id
            ? { ...deal, stage: "lost" as const, position: pending.position }
            : deal,
        )
        .sort((a, b) => a.position - b.position)
        .map((deal) => ({ ...deal, id: deal._id })),
    [visible, pending],
  );

  const columns = useMemo<BoardColumnDef[]>(
    () =>
      stages.map((stage) => ({
        id: stage,
        name: DEAL_STAGE_LABEL[stage],
        icon: DEAL_STAGE_BADGE[stage].icon,
        tone: DEAL_STAGE_BADGE[stage].tone,
        summary: (
          <ColumnTotals deals={items.filter((item) => item.stage === stage)} />
        ),
      })),
    [stages, items],
  );

  const onMove = useCallback(
    (id: string, columnId: string, beforeId: string | null) => {
      const deal = deals?.find((entry) => entry._id === id);
      if (!deal) return;
      const stage = columnId as DealStage;
      const column = (deals ?? []).filter((entry) => entry.stage === stage);
      const position = positionBefore(column, id, beforeId);
      if (stage === "lost" && deal.stage !== "lost") {
        setPending({ deal, position });
        return false;
      }
      void moveDeal(deal, { stage, position });
    },
    [deals, moveDeal],
  );

  function confirmLost(reason: string) {
    if (!pending) return;
    void moveDeal(pending.deal, {
      stage: "lost",
      position: pending.position,
      lostReason: reason,
    });
    setPending(null);
  }

  const renderCard = useCallback(
    (item: BoardDeal) => <DealCard deal={item} today={today} />,
    [today],
  );

  const renderColumnTop = (stage: string) =>
    drafting === stage ? (
      <div className="bg-card shadow-card rounded-2xl p-4">
        <DealQuickAdd
          stage={drafting}
          accountId={draftAccount}
          onAccountChange={setDraftAccount}
          onClose={() => setDrafting(null)}
        />
      </div>
    ) : null;

  function reorder(stage: string, ids: string[], sort: BoardSort<BoardDeal>) {
    const byId = new Map(
      (deals ?? []).map((deal) => [deal._id as string, deal]),
    );
    const ordered = ids.flatMap((id) => byId.get(id) ?? []);
    const previous = ordered.map((deal) => [deal, deal.position] as const);
    ordered.forEach((deal, index) => {
      void moveDeal(deal, { stage: deal.stage, position: index + 1 });
    });
    toast(
      `Sorted ${DEAL_STAGE_LABEL[stage as DealStage]} by ${sort.label}`,
      () => {
        for (const [deal, position] of previous) {
          void moveDeal(deal, { stage: deal.stage, position });
        }
      },
    );
  }

  const openPage = useCallback(
    (id: string) => router.push(`/deals/${id}`),
    [router],
  );
  const peek = useCallback(
    (id: string) => setPeek({ type: "deal", id }),
    [setPeek],
  );

  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const deal of deals ?? []) {
      if (deal.account) seen.set(deal.accountId, deal.account.name);
    }
    return [...seen]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [deals]);

  const filtered =
    owner !== ALL || account !== ALL || close !== ALL || search.trim() !== "";
  function clearFilters() {
    setSearch("");
    setOwner(ALL);
    setAccount(ALL);
    setClose(ALL);
  }

  const [sortId, sortDir] = sortParam.split(":");
  const listArgs: ListArgs = {
    ownerId: (owner === ALL
      ? undefined
      : owner === MINE
        ? viewer._id
        : owner) as Id<"members"> | undefined,
    accountId: account === ALL ? undefined : (account as Id<"accounts">),
    close:
      close === CLOSE_MONTH || close === CLOSE_OVERDUE || close === CLOSE_NONE
        ? close
        : undefined,
    today,
    hideClosed: closed === HIDE || undefined,
    search: query.trim() || undefined,
    sort: (["close", "amount", "title"].includes(sortId)
      ? sortId
      : DEFAULT_SORT.id) as ListArgs["sort"],
    dir: sortDir === "desc" ? "desc" : "asc",
  };

  const newDeal = (
    <Button
      variant="primary"
      size="sm"
      onClick={() => setCreate({ type: "deal" })}
    >
      <PlusIcon aria-hidden className="size-3" />
      New deal
    </Button>
  );

  const emptyState =
    deals && deals.length === 0 ? (
      <EmptyState
        icon={ClipboardIcon}
        title="No deals yet"
        description="Track each opportunity from first call to a live campaign."
        action={newDeal}
      />
    ) : deals && visible.length === 0 && filtered ? (
      <EmptyState
        icon={FilterIcon}
        title="No deals match"
        description="Try another search or clear the filters."
        action={
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : null;

  return (
    <Page>
      <PageHeader
        title="Deals"
        meta={
          deals && (
            <PageStatus>
              <span className="tabular-nums">
                {deals.filter((deal) => isOpenStage(deal.stage)).length} open
              </span>
            </PageStatus>
          )
        }
      />
      <PageToolbar
        actions={
          <>
            <Segmented
              label="View"
              value={listView ? LIST : BOARD}
              onChange={(next) => setView(next)}
              compact
              options={[
                {
                  value: BOARD,
                  label: "Board",
                  icon: <ClipboardIcon aria-hidden className="size-3.5" />,
                },
                {
                  value: LIST,
                  label: "List",
                  icon: <ListIcon aria-hidden className="size-3.5" />,
                },
              ]}
            />
            {!listView && <HiddenColumnsToggle prefs={boardPrefs} />}
            <ExportButton
              disabled={!visible.length || exporting}
              onClick={() =>
                void exportCsv({
                  name: "deals",
                  args: { ...listArgs, search: search.trim() || undefined },
                })
              }
            />
            <CreateButton onClick={() => setCreate({ type: "deal" })}>
              New deal
            </CreateButton>
          </>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search deals"
          className="sm:w-48"
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
          options={[{ value: ALL, label: "Any" }, ...accountOptions]}
        />
        <FilterMenu
          label="Close date"
          value={close}
          onChange={setClose}
          options={[
            { value: ALL, label: "Any" },
            { value: CLOSE_MONTH, label: "This month" },
            { value: CLOSE_OVERDUE, label: "Overdue" },
            { value: CLOSE_NONE, label: "No date" },
          ]}
        />
        <FilterMenu
          label="Won & lost"
          value={closed}
          onChange={setClosed}
          options={[
            { value: SHOW, label: "Shown" },
            { value: HIDE, label: "Hidden" },
          ]}
        />
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </PageToolbar>
      <PipelineSummary deals={matching} />
      <div className="border-border relative flex min-h-0 flex-1 flex-col border-t">
        {listView ? (
          <DealsList
            args={listArgs}
            today={today}
            onSortChange={setSortParam}
            onPeek={peek}
            empty={
              filtered ? (
                <EmptyState
                  icon={FilterIcon}
                  title="No deals match"
                  description="Try another search or clear the filters."
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : closed === HIDE ? (
                <EmptyState
                  icon={ClipboardIcon}
                  title="No open deals"
                  description="Won and lost deals are hidden."
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setClosed(SHOW)}
                    >
                      Show won & lost
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={ClipboardIcon}
                  title="No deals yet"
                  description="Track each opportunity from first call to a live campaign."
                  action={newDeal}
                />
              )
            }
          />
        ) : deals === undefined ? (
          <BoardSkeleton columns={stages.length} />
        ) : (
          <Board
            columns={columns}
            items={items}
            columnOf={stageOf}
            renderCard={renderCard}
            getLabel={labelOf}
            onMove={onMove}
            onOpen={openPage}
            onPeek={peek}
            onAdd={(stage) => setDrafting(stage as DealStage)}
            renderColumnTop={renderColumnTop}
            sorts={SORTS}
            onReorder={reorder}
            prefs={boardPrefs}
            addLabel="New deal"
            emptyLabel="No deals"
            overlay={emptyState && <BoardMessage>{emptyState}</BoardMessage>}
          />
        )}
      </div>
      <LostReasonDialog
        dealTitle={pending?.deal.title ?? null}
        onConfirm={confirmLost}
        onCancel={() => setPending(null)}
      />
    </Page>
  );
}

/** One line per currency, so INR and USD pipelines are never added together. */
function ColumnTotals({ deals }: { deals: DealRow[] }) {
  const total = formatTotals(deals.map((deal) => deal.amount));
  return (
    <span
      className={cn("block truncate", total === "—" && "text-fg-tertiary")}
      title={total === "—" ? undefined : `Total ${total}`}
    >
      {total}
    </span>
  );
}

function DealsList({
  args,
  today,
  onSortChange,
  onPeek,
  empty,
}: {
  args: ListArgs;
  today: string;
  onSortChange: (value: string) => void;
  onPeek: (id: string) => void;
  empty: ReactNode;
}) {
  const { rows, paging } = usePagedList(api.deals.page, args);
  const columns: Column<DealRow>[] = [
    {
      id: "title",
      header: "Deal",
      width: "minmax(14rem,2fr)",
      sortable: true,
      cell: (row) => (
        <span className="truncate font-medium" title={row.title}>
          {row.title}
        </span>
      ),
    },
    {
      id: "account",
      header: "Account",
      width: "minmax(10rem,1.2fr)",
      cell: (row) =>
        row.account ? (
          <span className="flex min-w-0 items-center gap-2">
            <AccountLogo account={row.account} size="xs" />
            <span className="text-fg-secondary truncate">
              {row.account.name}
            </span>
          </span>
        ) : (
          <span className="text-fg-tertiary">—</span>
        ),
    },
    {
      id: "stage",
      header: "Stage",
      width: "8rem",
      cell: (row) => <DealStageTag stage={row.stage} />,
    },
    {
      id: "amount",
      header: "Amount",
      width: "8.5rem",
      align: "end",
      defaultDir: "desc",
      sortable: true,
      cell: (row) => (
        <span
          className={cn(
            "tabular-nums",
            !row.amount.amount && "text-fg-tertiary",
          )}
        >
          {formatMoney(row.amount)}
        </span>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      width: "minmax(8rem,1fr)",
      minViewport: 900,
      cell: (row) =>
        row.owner ? (
          <>
            <Avatar name={row.owner.name} size="xs" />
            <span className="truncate">{row.owner.name}</span>
          </>
        ) : (
          <span className="text-fg-tertiary">—</span>
        ),
    },
    {
      id: "close",
      header: "Close date",
      width: "7.5rem",
      sortable: true,
      cell: (row) => {
        if (!row.closeDate) return <span className="text-fg-tertiary">—</span>;
        const overdue = isOpenStage(row.stage) && row.closeDate < today;
        return overdue ? (
          <Tag size="xs" tone="red" title="Close date has passed">
            <span className="sr-only">Overdue, </span>
            {formatDay(row.closeDate)}
          </Tag>
        ) : (
          <span className="text-fg-secondary tabular-nums">
            {formatDay(row.closeDate)}
          </span>
        );
      },
    },
  ];

  const sort: SortState = {
    id: args.sort ?? DEFAULT_SORT.id,
    dir: args.dir ?? DEFAULT_SORT.dir,
  };

  return (
    <DataTable
      label="Deals"
      columns={columns}
      rows={rows}
      getId={(row) => row._id}
      getHref={(row) => `/deals/${row._id}`}
      getLabel={(row) =>
        `${row.title}${row.account ? `, ${row.account.name}` : ""}`
      }
      sort={sort}
      onSortChange={(next) => onSortChange(`${next.id}:${next.dir}`)}
      onPeek={(row) => onPeek(row._id)}
      paging={paging}
      footer={[
        {
          label: "Deals in view",
          value: viewCount(null, rows?.length, paging),
        },
      ]}
      rowActions={(row) => (
        <RowAction
          label="Peek"
          icon={EyeIcon}
          shortcut="Space"
          onClick={() => onPeek(row._id)}
        />
      )}
      renderCard={(row) => (
        <span className="flex items-start gap-3">
          {row.account && <AccountLogo account={row.account} size="md" />}
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="lead-style truncate font-medium">{row.title}</span>
            <span className="caption-style text-fg-tertiary truncate">
              {row.account?.name ?? "No account"}
              {row.closeDate && ` · Closes ${formatDay(row.closeDate)}`}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="lead-style font-medium tabular-nums">
              {formatMoney(row.amount)}
            </span>
            <DealStageTag stage={row.stage} />
          </span>
        </span>
      )}
      empty={empty}
    />
  );
}

function PipelineSummary({ deals }: { deals: DealRow[] | undefined }) {
  const stats = useMemo(() => {
    if (!deals) return null;
    const monthStart = startOfMonth();
    const open = deals.filter((deal) => isOpenStage(deal.stage));
    const won = deals.filter(
      (deal) => deal.stage === "won" && (deal.closedAt ?? 0) >= monthStart,
    );
    return {
      open: formatTotals(
        open.map((deal) => deal.amount),
        ZERO,
      ),
      won: formatTotals(
        won.map((deal) => deal.amount),
        ZERO,
      ),
      count: String(open.length),
    };
  }, [deals]);

  const items = [
    { label: "Open pipeline", value: stats?.open, hint: "monthly take" },
    { label: "Won this month", value: stats?.won, hint: "monthly take" },
    { label: "Open deals", value: stats?.count },
  ];

  return (
    <dl
      aria-label="Pipeline summary"
      className="flex shrink-0 flex-wrap gap-x-6 gap-y-3 px-4 py-3 sm:gap-x-10"
    >
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1">
          <dt className="caption-style text-fg-tertiary truncate">
            {item.label}
            {item.hint && (
              <span className="text-fg-disabled max-sm:hidden">
                {" "}
                · {item.hint}
              </span>
            )}
          </dt>
          <dd className="lead-style font-medium tabular-nums">
            {item.value ?? <Skeleton className="my-1 h-3 w-14" />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BoardMessage({ children }: { children: ReactNode }) {
  return (
    <div className="z-sticky-header bg-background/70 absolute inset-0 flex items-start justify-center px-4 pt-[12vh] backdrop-blur-[2px]">
      <div className="bg-card shadow-raised w-full max-w-sm rounded-xl">
        {children}
      </div>
    </div>
  );
}

function BoardSkeleton({ columns }: { columns: number }) {
  return (
    <div aria-busy className="flex min-h-0 flex-1 overflow-hidden">
      {Array.from({ length: columns }, (_, column) => (
        <div
          key={column}
          className="border-border flex w-[85vw] max-w-85 shrink-0 flex-col gap-3 border-r px-4 pt-4 sm:w-80 lg:w-auto lg:max-w-none lg:min-w-80 lg:flex-1"
        >
          <div className="flex flex-col gap-2 pb-5">
            <div className="flex h-5 items-center gap-2">
              <Skeleton className="size-3.5 rounded-[4px]" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="ml-5.5 h-3 w-12" />
          </div>
          {Array.from({ length: 3 - (column % 2) }, (_, card) => (
            <div key={card} className="bg-card shadow-card rounded-2xl">
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <div className="border-border flex gap-2 border-t px-4 py-3">
                <Skeleton className="h-7 w-14 rounded-full" />
                <Skeleton className="h-7 w-18 rounded-full" />
                <Skeleton className="h-7 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
