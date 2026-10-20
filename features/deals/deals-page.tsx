"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import FilterMenu from "@/components/_common/filter-menu";
import Board, { type BoardColumnDef } from "@/components/board/board";
import SearchInput from "@/components/data-table/search-input";
import { Page, PageHeader, PageToolbar } from "@/components/shell/page";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import { DEAL_STAGES, type DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/domain/money";
import { useUiStore } from "@/stores/ui-store";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import DealCard from "./deal-card";
import { formatTotals, today as todayDay } from "./format";
import LostReasonDialog from "./lost-reason-dialog";
import { DEAL_STAGE_TONE, isOpenStage } from "./stage";
import { positionBefore, useMoveDeal, type DealRow } from "./use-deal-actions";

const ZERO = formatMoney({ amount: 0, currency: DEFAULT_CURRENCY });
const ALL = "all";
const MINE = "mine";
const SHOW = "show";
const HIDE = "hide";

type BoardDeal = DealRow & { id: string };
type PendingLost = { deal: DealRow; position: number };

const stageOf = (deal: BoardDeal) => deal.stage;
const labelOf = (deal: BoardDeal) => deal.title;

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
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/** The pipeline board: deals by stage, with per-currency totals. */
export default function DealsPage() {
  const viewer = useViewer();
  const members = useMembers();
  const deals = useQuery(api.deals.list, {});
  const setCreate = useUiStore((state) => state.setCreate);
  const setEdit = useUiStore((state) => state.setEdit);
  const moveDeal = useMoveDeal();

  const [search, setSearch] = useState("");
  const [owner, setOwner] = useUrlState("owner", ALL);
  const [closed, setClosed] = useUrlState("closed", SHOW);
  const [pending, setPending] = useState<PendingLost | null>(null);
  const today = todayDay();

  const matching = useMemo(() => {
    if (!deals) return undefined;
    return deals.filter(
      (deal) =>
        (owner === ALL ||
          deal.ownerId === (owner === MINE ? viewer._id : owner)) &&
        (!search.trim() || matches(deal, search)),
    );
  }, [deals, owner, search, viewer._id]);

  const stages = useMemo(
    () => DEAL_STAGES.filter((stage) => closed === SHOW || isOpenStage(stage)),
    [closed],
  );

  const items = useMemo<BoardDeal[]>(() => {
    const visible = (matching ?? [])
      .filter((deal) => closed === SHOW || isOpenStage(deal.stage))
      .map((deal) =>
        pending && deal._id === pending.deal._id
          ? { ...deal, stage: "lost" as const, position: pending.position }
          : deal,
      )
      .sort((a, b) => a.position - b.position);
    return visible.map((deal) => ({ ...deal, id: deal._id }));
  }, [matching, closed, pending]);

  const columns = useMemo<BoardColumnDef[]>(
    () =>
      stages.map((stage) => ({
        id: stage,
        name: DEAL_STAGE_LABEL[stage],
        tone: DEAL_STAGE_TONE[stage],
        summary: formatTotals(
          items.filter((deal) => deal.stage === stage).map((d) => d.amount),
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
        return;
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
    (deal: BoardDeal) => <DealCard deal={deal} today={today} />,
    [today],
  );

  const filtered = owner !== ALL || search.trim() !== "";
  function clearFilters() {
    setSearch("");
    setOwner(ALL);
  }

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

  const overlay =
    deals && deals.length === 0 ? (
      <BoardMessage>
        <EmptyState
          icon={ClipboardIcon}
          title="No deals yet"
          description="Track each opportunity from first call to a live campaign."
          action={newDeal}
        />
      </BoardMessage>
    ) : deals && items.length === 0 && filtered ? (
      <BoardMessage>
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
      </BoardMessage>
    ) : undefined;

  return (
    <Page>
      <PageHeader
        title="Deals"
        meta={
          deals && (
            <span className="caption-style text-fg-tertiary tabular-nums">
              {deals.length}
            </span>
          )
        }
        actions={newDeal}
      />
      <PageToolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search deals"
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
      <div className="border-border flex min-h-0 flex-1 flex-col border-t">
        {deals === undefined ? (
          <BoardSkeleton columns={stages.length} />
        ) : (
          <Board
            columns={columns}
            items={items}
            columnOf={stageOf}
            renderCard={renderCard}
            getLabel={labelOf}
            onMove={onMove}
            onOpen={(id) => setEdit({ type: "deal", id })}
            onAdd={(stage) => setCreate({ type: "deal", stage })}
            addLabel="New deal"
            emptyLabel="No deals"
            overlay={overlay}
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
          className="border-border flex w-[85vw] max-w-80 shrink-0 flex-col gap-2.5 border-r p-3 sm:w-72 lg:w-auto lg:max-w-none lg:min-w-64 lg:flex-1"
        >
          <Skeleton className="mb-1 h-4 w-24" />
          <Skeleton className="mb-2 h-3 w-16" />
          {Array.from({ length: 3 - (column % 2) }, (_, card) => (
            <Skeleton key={card} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
