"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import {
  formatDay,
  formatTotals,
  today as todayDay,
} from "@/features/deals/format";
import { DealStageTag, isOpenStage } from "@/features/deals/stage";
import { formatMoney } from "@/lib/domain/money";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

/** Deals the person is a contact on, across accounts. */
export default function PersonDeals({
  personId,
  onAdd,
}: {
  personId: Id<"people">;
  onAdd: (() => void) | null;
}) {
  const deals = useQuery(api.people.deals, { personId });
  const today = todayDay();
  const openTotal = deals
    ? formatTotals(
        deals.filter((deal) => isOpenStage(deal.stage)).map((d) => d.amount),
        "",
      )
    : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-3">
        {openTotal && (
          <span className="caption-style text-fg-tertiary tabular-nums">
            {openTotal} open
          </span>
        )}
        {onAdd && (
          <Button variant="ghost" size="xs" onClick={onAdd}>
            New deal
          </Button>
        )}
      </div>
      {deals === undefined ? (
        <div className="divide-border -mx-3 flex flex-col divide-y">
          {[0, 1].map((index) => (
            <div key={index} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          ))}
        </div>
      ) : deals.length === 0 ? (
        <p className="caption-style text-fg-tertiary">Not on any deals yet.</p>
      ) : (
        <ul className="divide-border -mx-3 flex flex-col divide-y">
          {deals.map((deal) => {
            const open = isOpenStage(deal.stage);
            const overdue =
              open && deal.closeDate !== null && deal.closeDate < today;
            return (
              <li key={deal._id}>
                <Link
                  href={routes.deal(deal._id)}
                  className="hover:bg-overlay-1 focus-visible:ring-ring flex w-full items-center gap-3 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className={cn(
                        "lead-style truncate font-medium",
                        !open && "text-fg-secondary",
                      )}
                    >
                      {deal.title}
                    </span>
                    <span className="caption-style text-fg-tertiary flex min-w-0 items-center gap-1.5">
                      {deal.account && (
                        <span className="truncate">{deal.account.name}</span>
                      )}
                      {!open && deal.closedAt ? (
                        <span className="shrink-0">
                          · {deal.stage === "won" ? "Won" : "Lost"}{" "}
                          {shortDate(deal.closedAt)}
                        </span>
                      ) : (
                        deal.closeDate && (
                          <span
                            className={cn("shrink-0", overdue && "text-danger")}
                          >
                            ·{" "}
                            {overdue && (
                              <span className="sr-only">Overdue, </span>
                            )}
                            Closes {formatDay(deal.closeDate)}
                          </span>
                        )
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "lead-style font-medium tabular-nums",
                        !open && "text-fg-secondary",
                      )}
                    >
                      {formatMoney(deal.amount)}
                    </span>
                    <DealStageTag stage={deal.stage} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
