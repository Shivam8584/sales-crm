"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Tooltip from "@/components/_ui/tooltip";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import SearchInput from "@/components/data-table/search-input";
import SavedViewsMenu from "@/features/views/saved-views-menu";
import SelectionBar from "@/components/data-table/selection-bar";
import {
  type Column,
  compareBy,
  type SortState,
} from "@/components/data-table/types";
import {
  CreateButton,
  Page,
  PageActions,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { dash } from "@/features/accounts/record-cells";
import { useUrlState } from "@/hooks/use-url-state";
import { can } from "@/convex/lib/permissions";
import { useViewer } from "@/hooks/use-viewer";
import { isEditableTarget } from "@/lib/keyboard";
import { marketplaceName, scoreBand } from "@/lib/domain/prospecting";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import LinkIcon from "@/public/assets/icons/link.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import ShareIcon from "@/public/assets/icons/share.svg";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import AddProductsDialog from "./add-products-dialog";
import { useProspectActions } from "./prospect-actions";
import WatchlistDialog, { type WatchlistDraft } from "./watchlist-dialog";
import { routes } from "@/lib/routes";
import {
  ALL,
  CRM_OPTIONS,
  DEFAULT_SORT,
  OPEN_OVERLAY,
  PROSPECT_SORTS,
  STATUS_OPTIONS,
  VIEWS,
  exportProducts,
  exportProspects,
  type View,
  type WatchlistRow,
  words,
} from "./prospecting-data";
import {
  COLUMNS_BY_VIEW,
  PRODUCT_COLUMNS,
  PROSPECT_COLUMNS,
  ProductCard,
  ProspectCard,
} from "./prospecting-columns";

/** Marketplace prospecting: brands whose listings trail their category on ratings. */
export default function ProspectingPage() {
  const overview = useQuery(api.prospecting.overview, {});
  const watchlists = useQuery(api.prospecting.watchlists, {});
  const refresh = useMutation(api.prospecting.refresh);
  const setRemoved = useMutation(api.prospecting.setProductsRemoved);
  const setDeleted = useMutation(api.prospecting.setWatchlistDeleted);
  const actions = useProspectActions();
  const router = useRouter();
  const viewer = useViewer();

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
      title="Find brands with a review gap"
      description="Watch product links from marketplaces. Daily checks track ratings, so you can pitch brands whose listings trail their category."
      action={
        <Button
          variant={noWatchlists ? "primary" : "well"}
          size="sm"
          onClick={() => setAdding(true)}
        >
          Watch products
        </Button>
      }
    />
  );
  const noMatch = (
    <EmptyState
      title="Nothing matches"
      action={
        <Button variant="secondary" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  );

  const mode = overview?.mode;

  return (
    <Page wide>
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
              can(viewer, "record.export") && {
                label: "Export CSV",
                icon: ShareIcon,
                disabled: !(view === "prospects" ? prospects : products)
                  ?.length,
                onSelect: exportView,
              },
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
        activeFilters={
          Number(watchlist !== ALL) +
          Number(marketplace !== ALL) +
          Number(view === "prospects" && crm !== ALL) +
          Number(view === "products" && status !== ALL)
        }
        onClearFilters={clearFilters}
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
            <SavedViewsMenu />
            {!noWatchlists && (
              <CreateButton onClick={() => setAdding(true)}>
                Watch products
              </CreateButton>
            )}
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
        {view === "prospects" && (
          <DataTable
            label="Prospects"
            columns={PROSPECT_COLUMNS}
            rows={prospects}
            getId={(row) => row.key}
            getHref={(row) => routes.prospect(encodeURIComponent(row.key))}
            getLabel={(row) => row.brand}
            sort={sort}
            onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
            rowMenu={(row) => [
              row.lead?.open
                ? {
                    label: "Open lead",
                    icon: TargetIcon,
                    onSelect: () => router.push(routes.lead(row.lead!._id)),
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
                  title="No brands yet"
                  description="Brands appear once their products are read."
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
                  ? routes.prospect(encodeURIComponent(row.brandKey))
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
