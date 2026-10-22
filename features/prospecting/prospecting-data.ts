import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { SortState } from "@/components/data-table/types";
import { downloadCsv } from "@/lib/csv";
import { marketplaceName } from "@/lib/domain/prospecting";
import type { Prospect } from "./prospect-actions";

type Overview = FunctionReturnType<typeof api.prospecting.overview>;
export type ProductRow = Overview["products"][number];
export type WatchlistRow = FunctionReturnType<
  typeof api.prospecting.watchlists
>[number];

export const ALL = "all";
export const VIEWS = [
  { id: "prospects", label: "Prospects" },
  { id: "products", label: "Products" },
] as const;
export type View = (typeof VIEWS)[number]["id"];

export const OPEN_OVERLAY = "[role=dialog], [role=menu], [role=listbox]";

export function words(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export const PROSPECT_SORTS = [
  { value: "score", label: "Score" },
  { value: "gap", label: "Biggest gap" },
  { value: "velocity", label: "Ratings pace" },
  { value: "marketplaces", label: "Listings" },
  { value: "brand", label: "Name" },
];
export const DEFAULT_SORT: Record<View, SortState> = {
  prospects: { id: "score", dir: "desc" },
  products: { id: "score", dir: "desc" },
};

export const CRM_OPTIONS = [
  { value: ALL, label: "Any" },
  { value: "new", label: "New to CRM" },
  { value: "account", label: "Has account" },
  { value: "lead", label: "Has lead" },
];
export const STATUS_OPTIONS = [
  { value: ALL, label: "Any" },
  { value: "ok", label: "Read" },
  { value: "checking", label: "Checking" },
  { value: "failed", label: "Failed" },
];

export function exportProspects(rows: Prospect[]) {
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

export function exportProducts(rows: ProductRow[]) {
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
