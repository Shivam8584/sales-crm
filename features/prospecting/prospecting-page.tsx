"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Tooltip from "@/components/_ui/tooltip";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import SearchInput from "@/components/data-table/search-input";
import SelectionBar from "@/components/data-table/selection-bar";
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
import { MoneyValue, dash } from "@/features/accounts/record-cells";
import { useUrlState } from "@/hooks/use-url-state";
import { downloadCsv } from "@/lib/csv";
import { isEditableTarget } from "@/lib/keyboard";
import { marketplaceName, scoreBand } from "@/lib/domain/prospecting";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import LinkIcon from "@/public/assets/icons/link.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import AddProductsDialog from "./add-products-dialog";
import { useProspectActions, type Prospect } from "./prospect-actions";
import {
  GapCell,
  MarketplaceChips,
  MarketplaceTag,
  MatchCell,
  RatingValue,
  ScoreTag,
  VelocityCell,
} from "./prospect-cells";
import WatchlistDialog, { type WatchlistDraft } from "./watchlist-dialog";

type Overview = FunctionReturnType<typeof api.prospecting.overview>;
type ProductRow = Overview["products"][number];
type WatchlistRow = FunctionReturnType<
  typeof api.prospecting.watchlists
>[number];

const ALL = "all";
const VIEWS = [
  { id: "prospects", label: "Prospects" },
  { id: "products", label: "Products" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const OPEN_OVERLAY = "[role=dialog], [role=menu], [role=listbox]";

function words(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function brandLogo(row: Prospect) {
  return {
    name: row.brand,
    domain: row.account?.domain ?? null,
    logoUrl: row.account?.logoUrl ?? null,
  };
}

const PROSPECT_COLUMNS: Column<Prospect>[] = [
  {
    id: "brand",
    header: "Brand",
    width: "minmax(9rem,1fr)",
    sortValue: (row) => row.brand,
    cell: (row) => (
      <>
        <AccountLogo account={brandLogo(row)} size="xs" />
        <span className="truncate" title={row.brand}>
          {row.brand}
        </span>
      </>
    ),
  },
  {
    id: "score",
    header: "Score",
    width: "6.5rem",
    defaultDir: "desc",
    sortValue: (row) => row.score,
    cell: (row) => <ScoreTag score={row.score} reasons={row.reasons} />,
  },
  {
    id: "gap",
    header: "Biggest gap",
    width: "minmax(10.5rem,1fr)",
    defaultDir: "asc",
    sortValue: (row) => row.worst?.share ?? null,
    cell: (row) =>
      row.worst ? (
        <GapCell
          ratings={row.worst.ratingsCount}
          benchmark={row.worst.benchmark}
        />
      ) : (
        dash
      ),
  },
  {
    id: "best",
    header: "Strongest listing",
    width: "minmax(10.5rem,1fr)",
    minViewport: 1360,
    defaultDir: "desc",
    sortValue: (row) => row.best?.share ?? null,
    cell: (row) =>
      row.best ? (
        <GapCell
          ratings={row.best.ratingsCount}
          benchmark={row.best.benchmark}
        />
      ) : (
        dash
      ),
  },
  {
    id: "velocity",
    header: "Ratings pace",
    width: "9.5rem",
    minViewport: 1000,
    defaultDir: "desc",
    sortValue: (row) => row.velocity,
    cell: (row) => <VelocityCell velocity={row.velocity} gains={row.gains} />,
  },
  {
    id: "marketplaces",
    header: "Listings",
    width: "minmax(12rem,1fr)",
    minViewport: 900,
    defaultDir: "desc",
    sortValue: (row) => row.products,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span className="text-fg-secondary w-[2ch] shrink-0 text-right tabular-nums">
          {row.products}
        </span>
        <MarketplaceChips slugs={row.marketplaces} />
      </span>
    ),
  },
  {
    id: "crm",
    header: "In CRM",
    width: "minmax(8.5rem,0.9fr)",
    minViewport: 760,
    sortValue: (row) => row.account?.name ?? (row.lead ? "~lead" : null),
    cell: (row) => (
      <MatchCell account={row.account} lead={row.lead} inbound={row.inbound} />
    ),
  },
];

const PRODUCT_COLUMNS: Column<ProductRow>[] = [
  {
    id: "product",
    header: "Product",
    width: "minmax(12rem,1.6fr)",
    sortValue: (row) => row.title ?? row.identifier,
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate" title={row.title ?? row.url}>
          {row.title ?? row.identifier}
        </span>
      </span>
    ),
  },
  {
    id: "marketplace",
    header: "Marketplace",
    width: "7rem",
    sortValue: (row) => marketplaceName(row.marketplace),
    cell: (row) => <MarketplaceTag slug={row.marketplace} />,
  },
  {
    id: "brand",
    header: "Brand",
    width: "minmax(6.5rem,0.7fr)",
    minViewport: 900,
    sortValue: (row) => row.brand,
    cell: (row) =>
      row.brand ? (
        <span className="truncate" title={row.brand}>
          {row.brand}
        </span>
      ) : (
        dash
      ),
  },
  {
    id: "ratings",
    header: "Ratings / benchmark",
    width: "minmax(11.5rem,1fr)",
    defaultDir: "asc",
    sortValue: (row) => row.score?.share ?? null,
    cell: (row) => (
      <GapCell
        ratings={row.ratingsCount}
        benchmark={row.benchmark?.ratings ?? null}
      />
    ),
  },
  {
    id: "rating",
    header: "Rating",
    width: "5rem",
    minViewport: 1100,
    defaultDir: "desc",
    sortValue: (row) => row.rating,
    cell: (row) => <RatingValue rating={row.rating} />,
  },
  {
    id: "velocity",
    header: "Pace",
    width: "5.75rem",
    align: "end",
    minViewport: 1000,
    defaultDir: "desc",
    sortValue: (row) => row.velocity,
    cell: (row) =>
      row.velocity === null ? (
        dash
      ) : (
        <span className="tabular-nums">
          {row.velocity}
          <span className="text-fg-tertiary">/wk</span>
        </span>
      ),
  },
  {
    id: "score",
    header: "Score",
    width: "6.75rem",
    defaultDir: "desc",
    minViewport: 700,
    sortValue: (row) => row.score?.score ?? null,
    cell: (row) =>
      row.status === "ok" ? (
        <ScoreTag
          score={row.score?.score ?? null}
          reasons={row.score?.reasons}
        />
      ) : (
        dash
      ),
  },
  {
    id: "price",
    header: "Price",
    width: "5.5rem",
    align: "end",
    minViewport: 1360,
    sortValue: (row) => row.price?.amount ?? null,
    cell: (row) => <MoneyValue totals={row.price ? [row.price] : []} />,
  },
  {
    id: "checked",
    header: "Last check",
    width: "minmax(7.5rem,0.8fr)",
    minViewport: 800,
    defaultDir: "desc",
    sortValue: (row) => row.checkedAt,
    cell: (row) => <CheckCell row={row} />,
  },
];

function CheckCell({ row }: { row: ProductRow }) {
  if (row.checking) {
    return (
      <span className="text-fg-secondary flex items-center gap-1.5">
        <ClockIcon aria-hidden className="size-3.5 shrink-0" />
        Checking…
      </span>
    );
  }
  if (row.status === "failed") {
    return (
      <Tooltip content={row.error ?? "The check failed"}>
        <span className="text-danger truncate">
          {row.checkedAt ? "Last check failed" : "Couldn't read"}
        </span>
      </Tooltip>
    );
  }
  if (!row.checkedAt) return dash;
  return (
    <Tooltip content={dateTime(row.checkedAt)}>
      <span className="truncate">{relativeTime(row.checkedAt)}</span>
    </Tooltip>
  );
}

const PROSPECT_SORTS = [
  { value: "score", label: "Score" },
  { value: "gap", label: "Biggest gap" },
  { value: "velocity", label: "Ratings pace" },
  { value: "marketplaces", label: "Listings" },
  { value: "brand", label: "Name" },
];
const DEFAULT_SORT: Record<View, SortState> = {
  prospects: { id: "score", dir: "desc" },
  products: { id: "score", dir: "desc" },
};
const COLUMNS_BY_VIEW = {
  prospects: PROSPECT_COLUMNS,
  products: PRODUCT_COLUMNS,
} as const;

const CRM_OPTIONS = [
  { value: ALL, label: "Any" },
  { value: "new", label: "New to CRM" },
  { value: "account", label: "Has account" },
  { value: "lead", label: "Has lead" },
];
const STATUS_OPTIONS = [
  { value: ALL, label: "Any" },
  { value: "ok", label: "Read" },
  { value: "checking", label: "Checking" },
  { value: "failed", label: "Failed" },
];

function exportProspects(rows: Prospect[]) {
  const day = new Date().toISOString().slice(0, 10);
  downloadCsv(`prospects-${day}.csv`, [
    [
      "Brand",
      "Score",
      "Products",
      "Marketplaces",
      "Fewest ratings",
      "Benchmark",
      "Ratings a week",
      "Account",
      "Talking point",
    ],
    ...rows.map((row) => [
      row.brand,
      row.score ?? "",
      row.products,
      row.marketplaces.map(marketplaceName).join(", "),
      row.worst?.ratingsCount ?? "",
      row.worst?.benchmark ?? "",
      row.velocity ?? "",
      row.account?.name ?? "",
      row.talkingPoint ?? "",
    ]),
  ]);
}

function exportProducts(rows: ProductRow[]) {
  const day = new Date().toISOString().slice(0, 10);
  downloadCsv(`watched-products-${day}.csv`, [
    [
      "Source",
      "Marketplace",
      "Product id",
      "Title",
      "Brand",
      "Category",
      "Rating",
      "Ratings",
      "Benchmark",
      "Ratings a week",
      "Score",
      "Link",
      "Status",
    ],
    ...rows.map((row) => [
      row.watchlist,
      marketplaceName(row.marketplace),
      row.identifier,
      row.title ?? "",
      row.brand ?? "",
      row.category ?? "",
      row.rating ?? "",
      row.ratingsCount ?? "",
      row.benchmark?.ratings ?? "",
      row.velocity ?? "",
      row.score?.score ?? "",
      row.url,
      row.status === "failed" ? `Failed: ${row.error ?? ""}` : row.status,
    ]),
  ]);
}

/** Marketplace prospecting: brands whose listings trail their category on ratings. */
export default function ProspectingPage() {
  const overview = useQuery(api.prospecting.overview, {});
  const watchlists = useQuery(api.prospecting.watchlists, {});
  const refresh = useMutation(api.prospecting.refresh);
  const setRemoved = useMutation(api.prospecting.setProductsRemoved);
  const setDeleted = useMutation(api.prospecting.setWatchlistDeleted);
  const actions = useProspectActions();
  const router = useRouter();

  const [viewParam, setView] = useUrlState("view", "prospects");
  const [search, setSearch] = useUrlState("q", "");
  const [watchlist, setWatchlist] = useUrlState("source", ALL);
  const [marketplace, setMarketplace] = useUrlState("marketplace", ALL);
  const [crm, setCrm] = useUrlState("crm", ALL);
  const [status, setStatus] = useUrlState("status", ALL);
  const [sortParam, setSortParam] = useUrlState("sort", "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WatchlistDraft | null>(null);

  const view: View = VIEWS.some((item) => item.id === viewParam)
    ? (viewParam as View)
    : "prospects";
  const columns = COLUMNS_BY_VIEW[view] as Column<unknown>[];
  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = columns.some(
    (column) => column.id === sortId && column.sortValue,
  )
    ? { id: sortId, dir: sortDir === "asc" ? "asc" : "desc" }
    : DEFAULT_SORT[view];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        isEditableTarget(event.target) ||
        document.querySelector(OPEN_OVERLAY)
      )
        return;
      event.preventDefault();
      setAdding(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const prospects = useMemo(() => {
    if (!overview) return undefined;
    const query = words(search);
    return overview.brands.filter((row) => {
      if (
        watchlist !== ALL &&
        !row.watchlistIds.includes(watchlist as Id<"watchlists">)
      ) {
        return false;
      }
      if (marketplace !== ALL && !row.marketplaces.includes(marketplace)) {
        return false;
      }
      if (crm === "new" && (row.account || row.lead)) return false;
      if (crm === "account" && !row.account) return false;
      if (crm === "lead" && !row.lead) return false;
      const text =
        `${row.brand} ${row.account?.name ?? ""} ${row.marketplaces.join(" ")}`.toLowerCase();
      return query.every((word) => text.includes(word));
    });
  }, [overview, search, watchlist, marketplace, crm]);

  const products = useMemo(() => {
    if (!overview) return undefined;
    const query = words(search);
    return overview.products.filter((row) => {
      if (watchlist !== ALL && row.watchlistId !== watchlist) return false;
      if (marketplace !== ALL && row.marketplace !== marketplace) return false;
      if (status === "checking" && !row.checking) return false;
      if (status === "failed" && (row.checking || row.status !== "failed")) {
        return false;
      }
      if (status === "ok" && (row.checking || row.status !== "ok"))
        return false;
      const text =
        `${row.title ?? ""} ${row.brand ?? ""} ${row.identifier} ${row.category ?? ""} ${row.watchlist}`.toLowerCase();
      return query.every((word) => text.includes(word));
    });
  }, [overview, search, watchlist, marketplace, status]);

  const counts: Record<View, number | undefined> = {
    prospects: overview?.brands.length,
    products: overview?.products.length,
  };

  const marketplaceOptions = useMemo(
    () => [
      { value: ALL, label: "Any" },
      ...[...new Set(overview?.products.map((row) => row.marketplace) ?? [])]
        .sort()
        .map((slug) => ({ value: slug, label: marketplaceName(slug) })),
    ],
    [overview],
  );
  const watchlistOptions = [
    { value: ALL, label: "Any" },
    ...(watchlists ?? []).map((row) => ({ value: row._id, label: row.name })),
  ];
  const source = watchlists?.find((row) => row._id === watchlist);

  const filtered =
    search.trim() !== "" ||
    watchlist !== ALL ||
    marketplace !== ALL ||
    (view === "prospects" && crm !== ALL) ||
    (view === "products" && status !== ALL);

  function clearFilters() {
    setSearch("");
    setWatchlist(ALL);
    setMarketplace(ALL);
    setCrm(ALL);
    setStatus(ALL);
  }

  async function runRefresh(
    args: {
      watchlistId?: Id<"watchlists">;
      productIds?: Id<"watchedProducts">[];
    },
    label: string,
  ) {
    try {
      const queued = await refresh(args);
      toast(
        queued
          ? `Checking ${queued} ${queued === 1 ? "product" : "products"} ${label}`
          : "Those products are already being checked",
        { tone: queued ? "success" : "info" },
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function removeProducts(ids: Id<"watchedProducts">[]) {
    try {
      await setRemoved({ ids, removed: true });
      setSelected(new Set());
      toast(
        `Stopped watching ${ids.length} ${ids.length === 1 ? "product" : "products"}`,
        () => void setRemoved({ ids, removed: false }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function deleteSource(row: WatchlistRow) {
    try {
      await setDeleted({ id: row._id, deleted: true });
      if (watchlist === row._id) setWatchlist(ALL);
      toast(
        `${row.name} deleted`,
        () => void setDeleted({ id: row._id, deleted: false }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  function exportView() {
    const column = columns.find((item) => item.id === sort.id);
    const order = <T,>(rows: T[]) =>
      column?.sortValue
        ? [...rows].sort(compareBy(column as Column<T>, sort.dir))
        : rows;
    if (view === "prospects" && prospects) {
      exportProspects(order(prospects));
      toast(`Exported ${prospects.length} prospects`);
    } else if (view === "products" && products) {
      exportProducts(order(products));
      toast(`Exported ${products.length} products`);
    }
  }

  const selectedProducts = [...selected].filter((id) =>
    products?.some((row) => row._id === id),
  ) as Id<"watchedProducts">[];

  const prospectTotals = useMemo(() => {
    if (!prospects) return null;
    const scored = prospects.filter((row) => row.score !== null);
    return {
      hot: scored.filter((row) => scoreBand(row.score!) === "hot").length,
      average: scored.length
        ? Math.round(
            scored.reduce((sum, row) => sum + row.score!, 0) / scored.length,
          )
        : null,
      fresh: prospects.filter((row) => !row.account && !row.lead).length,
    };
  }, [prospects]);

  const noWatchlists = watchlists !== undefined && watchlists.length === 0;
  const firstRun = (
    <EmptyState
      icon={EyeIcon}
      title="Find brands with a review gap"
      description="Watch product links from Amazon, Flipkart, Myntra, Nykaa and more. Daily checks track ratings, so you can pitch brands whose listings trail their category."
      action={
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <PlusIcon aria-hidden className="size-3" />
          Watch products
        </Button>
      }
    />
  );
  const noMatch = (
    <EmptyState
      icon={EyeIcon}
      title="Nothing matches"
      description="Try another search or clear the filters."
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  );

  const mode = overview?.mode;

  return (
    <Page>
      <PageHeader
        title="Prospecting"
        meta={
          mode === "sandbox" ? (
            <Tooltip content="SCRAPER_SANDBOX=1: ratings are generated test data">
              <span className="flex">
                <PageStatus tone="warning">Sandbox data</PageStatus>
              </span>
            </Tooltip>
          ) : mode === null ? (
            <Tooltip content="Set SCRAPER_WORKER_URL and SCRAPER_AUTH_TOKEN on the Convex deployment">
              <span className="flex">
                <PageStatus tone="danger">Scraper not set up</PageStatus>
              </span>
            </Tooltip>
          ) : undefined
        }
        actions={
          <PageActions
            label="Prospecting actions"
            actions={[
              {
                label: "New source",
                icon: PlusIcon,
                onSelect: () => setEditing({ name: "", benchmark: null }),
              },
              ...(source && !source.inbound
                ? [
                    {
                      label: `Edit ${source.name}`,
                      icon: EditIcon,
                      onSelect: () =>
                        setEditing({
                          _id: source._id,
                          name: source.name,
                          benchmark: source.benchmark,
                        }),
                    },
                  ]
                : []),
              source
                ? {
                    label: `Re-check ${source.name}`,
                    icon: ClockIcon,
                    disabled: source.products === 0,
                    onSelect: () =>
                      void runRefresh(
                        { watchlistId: source._id },
                        `in ${source.name}`,
                      ),
                  }
                : {
                    label: "Re-check everything now",
                    icon: ClockIcon,
                    disabled: !overview?.products.length,
                    onSelect: () => void runRefresh({}, "now"),
                  },
              ...(source && !source.inbound
                ? [
                    {
                      label: `Delete ${source.name}`,
                      icon: TrashIcon,
                      tone: "danger" as const,
                      onSelect: () => void deleteSource(source),
                    },
                  ]
                : []),
            ]}
          />
        }
      />
      <PageViews
        value={view}
        onChange={(next) => {
          setView(next);
          setSortParam("");
          setSelected(new Set());
        }}
        views={VIEWS.map((item) => ({ ...item, count: counts[item.id] }))}
      />
      <PageToolbar
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              view === "prospects" ? "Search brands" : "Search products"
            }
          />
        }
        actions={
          <>
            <ExportButton
              disabled={!(view === "prospects" ? prospects : products)?.length}
              onClick={exportView}
            />
            <CreateButton onClick={() => setAdding(true)}>
              Watch products
            </CreateButton>
          </>
        }
      >
        {view === "prospects" && (
          <FilterMenu
            label="Sort by"
            value={
              PROSPECT_SORTS.some((option) => option.value === sort.id)
                ? sort.id
                : "score"
            }
            options={PROSPECT_SORTS}
            onChange={(id) =>
              setSortParam(
                `${id}:${PROSPECT_COLUMNS.find((column) => column.id === id)?.defaultDir ?? "asc"}`,
              )
            }
          />
        )}
        <FilterMenu
          label="Source"
          value={watchlist}
          options={watchlistOptions}
          onChange={setWatchlist}
        />
        <FilterMenu
          label="Marketplace"
          value={marketplace}
          options={marketplaceOptions}
          onChange={setMarketplace}
        />
        {view === "prospects" && (
          <FilterMenu
            label="CRM"
            value={crm}
            options={CRM_OPTIONS}
            onChange={setCrm}
          />
        )}
        {view === "products" && (
          <FilterMenu
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
        )}
        {filtered && (
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </PageToolbar>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {view === "prospects" && (
          <DataTable
            label="Prospects"
            columns={PROSPECT_COLUMNS}
            rows={prospects}
            getId={(row) => row.key}
            getHref={(row) => `/prospecting/${encodeURIComponent(row.key)}`}
            getLabel={(row) => row.brand}
            sort={sort}
            onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
            rowMenu={(row) => [
              row.lead?.open
                ? {
                    label: "Open lead",
                    icon: TargetIcon,
                    onSelect: () => router.push(`/leads/${row.lead!._id}`),
                  }
                : {
                    label: "Create lead",
                    icon: TargetIcon,
                    onSelect: () => actions.createLead(row),
                  },
              {
                label:
                  row.account?.via === "linked"
                    ? "Change account"
                    : "Add to account",
                icon: BuildingIcon,
                onSelect: () => actions.addToAccount(row),
              },
              {
                label: "Add to automation",
                icon: AutomationIcon,
                onSelect: () => actions.addToAutomation(row),
              },
            ]}
            footer={[
              { label: "Brands in view", value: prospects?.length ?? 0 },
              { label: "Hot", value: prospectTotals?.hot ?? 0 },
              {
                label: "Avg score",
                value: prospectTotals?.average ?? dash,
              },
              { label: "New to CRM", value: prospectTotals?.fresh ?? 0 },
            ]}
            renderCard={(row) => <ProspectCard row={row} />}
            empty={
              noWatchlists ? (
                firstRun
              ) : filtered ? (
                noMatch
              ) : (
                <EmptyState
                  icon={EyeIcon}
                  title="No brands yet"
                  description="Brands appear once their products are read. Check the Products view for links that are still being checked or failed."
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setView("products")}
                    >
                      Show products
                    </Button>
                  }
                />
              )
            }
          />
        )}
        {view === "products" && (
          <>
            <DataTable
              label="Watched products"
              columns={PRODUCT_COLUMNS}
              rows={products}
              getId={(row) => row._id}
              getHref={(row) =>
                row.brandKey
                  ? `/prospecting/${encodeURIComponent(row.brandKey)}`
                  : row.url
              }
              getLabel={(row) => row.title ?? row.identifier}
              sort={sort}
              onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
              selected={selected}
              onSelectedChange={setSelected}
              rowMenu={(row) => [
                {
                  label: `Open on ${marketplaceName(row.marketplace)}`,
                  icon: LinkIcon,
                  onSelect: () =>
                    window.open(row.url, "_blank", "noopener,noreferrer"),
                },
                {
                  label: "Check now",
                  icon: ClockIcon,
                  disabled: row.checking,
                  onSelect: () =>
                    void runRefresh({ productIds: [row._id] }, "now"),
                },
                {
                  label: "Stop watching",
                  icon: TrashIcon,
                  tone: "danger",
                  onSelect: () => void removeProducts([row._id]),
                },
              ]}
              footer={[
                { label: "Products in view", value: products?.length ?? 0 },
                {
                  label: "Brands",
                  value: new Set(
                    products?.map((row) => row.brandKey).filter(Boolean),
                  ).size,
                },
                {
                  label: "Checking",
                  value: products?.filter((row) => row.checking).length ?? 0,
                },
                {
                  label: "Failed",
                  value:
                    products?.filter(
                      (row) => !row.checking && row.status === "failed",
                    ).length ?? 0,
                },
              ]}
              renderCard={(row) => <ProductCard row={row} />}
              empty={noWatchlists ? firstRun : filtered ? noMatch : firstRun}
            />
            <SelectionBar
              count={selectedProducts.length}
              noun={["product", "products"]}
              onClear={() => setSelected(new Set())}
            >
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  void runRefresh({ productIds: selectedProducts }, "now")
                }
              >
                Check now
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void removeProducts(selectedProducts)}
              >
                Stop watching
              </Button>
            </SelectionBar>
          </>
        )}
      </div>
      <AddProductsDialog
        open={adding}
        onOpenChange={setAdding}
        watchlistId={watchlist === ALL ? null : watchlist}
      />
      <WatchlistDialog draft={editing} onClose={() => setEditing(null)} />
      {actions.dialogs}
    </Page>
  );
}

function ProspectCard({ row }: { row: Prospect }) {
  return (
    <span className="flex flex-col gap-2.5">
      <span className="flex items-center gap-3">
        <AccountLogo account={brandLogo(row)} size="md" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="lead-style truncate font-medium">{row.brand}</span>
          <span className="caption-style text-fg-tertiary truncate">
            {row.products} {row.products === 1 ? "listing" : "listings"} ·{" "}
            {row.marketplaces.map(marketplaceName).join(", ")}
          </span>
        </span>
        <ScoreTag score={row.score} />
      </span>
      <span className="caption-style flex items-center justify-between gap-3 pl-11">
        {row.worst ? (
          <GapCell
            ratings={row.worst.ratingsCount}
            benchmark={row.worst.benchmark}
          />
        ) : (
          dash
        )}
        <span className="text-fg-secondary flex min-w-0 justify-end">
          <MatchCell
            account={row.account}
            lead={row.lead}
            inbound={row.inbound}
          />
        </span>
      </span>
    </span>
  );
}

function ProductCard({ row }: { row: ProductRow }) {
  return (
    <span className="flex flex-col gap-2.5">
      <span className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="lead-style line-clamp-2 font-medium">
            {row.title ?? row.identifier}
          </span>
          <span className="caption-style text-fg-tertiary truncate">
            {[row.brand, row.category, row.watchlist]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <MarketplaceTag slug={row.marketplace} />
      </span>
      <span className="caption-style flex items-center justify-between gap-3">
        <GapCell
          ratings={row.ratingsCount}
          benchmark={row.benchmark?.ratings ?? null}
        />
        <span className="text-fg-secondary flex min-w-0 justify-end">
          <CheckCell row={row} />
        </span>
      </span>
    </span>
  );
}
