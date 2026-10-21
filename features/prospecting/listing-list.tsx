"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Tooltip from "@/components/_ui/tooltip";
import { dash } from "@/features/accounts/record-cells";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  GapCell,
  MarketplaceTag,
  RatingValue,
  ScoreTag,
  VelocityCell,
} from "./prospect-cells";

export type Listing = NonNullable<
  FunctionReturnType<typeof api.prospecting.brand>
>["items"][number];

function Checked({ listing }: { listing: Listing }) {
  if (listing.checking) {
    return <span className="text-fg-secondary">Checking…</span>;
  }
  if (listing.status === "failed") {
    return (
      <Tooltip content={listing.error ?? "The check failed"}>
        <span className="text-danger">Check failed</span>
      </Tooltip>
    );
  }
  if (!listing.checkedAt) return dash;
  return (
    <Tooltip content={dateTime(listing.checkedAt)}>
      <span>Checked {relativeTime(listing.checkedAt)}</span>
    </Tooltip>
  );
}

/** Marketplace listings with ratings against the benchmark and their recent pace. */
export default function ListingList({
  listings,
  compact = false,
}: {
  listings: Listing[];
  /** Sidebar layout: no score or check time. */
  compact?: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {listings.map((listing) => (
        <li
          key={listing._id}
          className="border-border flex flex-col gap-2 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
        >
          <div className="flex min-w-0 items-start gap-2">
            <MarketplaceTag slug={listing.marketplace} />
            <a
              href={listing.url}
              target="_blank"
              rel="noreferrer"
              title={listing.title ?? listing.url}
              className="hover:text-foreground focus-visible:ring-ring text-foreground min-w-0 flex-1 truncate rounded-sm pt-0.5 text-sm outline-none focus-visible:ring-2"
            >
              {listing.title ?? listing.identifier}
            </a>
            {!compact && listing.status === "ok" && (
              <ScoreTag
                score={listing.score?.score ?? null}
                reasons={listing.score?.reasons}
              />
            )}
          </div>
          <div
            className={cn(
              "caption-style text-fg-secondary grid items-center gap-x-4 gap-y-2",
              compact
                ? "grid-cols-[minmax(0,1fr)_auto]"
                : "grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_auto_auto_minmax(0,1fr)]",
            )}
          >
            <GapCell
              ratings={listing.ratingsCount}
              benchmark={listing.benchmark?.ratings ?? null}
            />
            {!compact && <RatingValue rating={listing.rating} />}
            <VelocityCell velocity={listing.velocity} gains={listing.gains} />
            {!compact && (
              <span className="truncate text-right max-sm:text-left">
                <Checked listing={listing} />
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
