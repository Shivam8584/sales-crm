"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { DetailSection } from "@/components/record/detail";
import ListingList from "./listing-list";
import { routes } from "@/lib/routes";

const SHOWN = 4;

/** Account sidebar block: the brand's watched marketplace listings and their rating trend. */
export default function MarketplaceListings({
  accountId,
  className,
}: {
  accountId: Id<"accounts">;
  className?: string;
}) {
  const data = useQuery(api.prospecting.forAccount, { accountId });
  if (data === null) return null;
  const products = data?.products ?? [];
  const brandKey = data?.keys.find((key) =>
    products.some((item) => item.brandKey === key),
  );

  return (
    <DetailSection
      collapsible
      title="Marketplace listings"
      className={className}
      action={
        brandKey ? (
          <Button
            variant="ghost"
            size="xs"
            href={routes.prospect(encodeURIComponent(brandKey))}
          >
            View all
          </Button>
        ) : undefined
      }
    >
      {data === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : products.length === 0 ? (
        <p className="caption-style text-fg-tertiary leading-snug">
          No watched products for this brand.{" "}
          <Link
            href={routes.prospecting}
            className="text-fg-secondary hover:text-foreground focus-visible:ring-ring rounded-sm underline underline-offset-2 outline-none focus-visible:ring-2"
          >
            Watch its listings
          </Link>{" "}
          to track ratings against its category.
        </p>
      ) : (
        <>
          <ListingList listings={products.slice(0, SHOWN)} compact />
          {products.length > SHOWN && (
            <span className="caption-style text-fg-tertiary">
              +{products.length - SHOWN} more listings
            </span>
          )}
        </>
      )}
    </DetailSection>
  );
}
