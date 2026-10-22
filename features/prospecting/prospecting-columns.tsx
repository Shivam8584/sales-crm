"use client";

import Tooltip from "@/components/_ui/tooltip";
import type { Column } from "@/components/data-table/types";
import AccountLogo from "@/features/accounts/account-logo";
import { dash, MoneyValue } from "@/features/accounts/record-cells";
import { marketplaceName } from "@/lib/domain/prospecting";
import { dateTime, relativeTime } from "@/lib/time";
import ClockIcon from "@/public/assets/icons/clock.svg";
import type { Prospect } from "./prospect-actions";
import {
  GapCell,
  MarketplaceChips,
  MarketplaceTag,
  MatchCell,
  RatingValue,
  ScoreTag,
  VelocityCell,
} from "./prospect-cells";
import type { ProductRow } from "./prospecting-data";

function brandLogo(row: Prospect) {
  return {
    name: row.brand,
    domain: row.account?.domain ?? null,
    logoUrl: row.account?.logoUrl ?? null,
  };
}

export const PROSPECT_COLUMNS: Column<Prospect>[] = [
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

export const PRODUCT_COLUMNS: Column<ProductRow>[] = [
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

export const COLUMNS_BY_VIEW = {
  prospects: PROSPECT_COLUMNS,
  products: PRODUCT_COLUMNS,
} as const;

export function ProspectCard({ row }: { row: Prospect }) {
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

export function ProductCard({ row }: { row: ProductRow }) {
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
