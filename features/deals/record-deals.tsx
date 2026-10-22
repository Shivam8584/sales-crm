"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { RecordSection } from "@/components/record/record-layout";
import { DEAL_STAGES } from "@/lib/domain/enums";
import { formatMoney } from "@/lib/domain/money";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import PlusIcon from "@/public/assets/icons/plus.svg";
import { formatDay, formatTotals, today as todayDay } from "./format";
import { DealStageTag, isOpenStage } from "./stage";
import { isPlainClick } from "./use-deal-actions";

/** Deals section on an account page; a click peeks, a modified click opens the page. */
export default function RecordDeals({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  const deals = useQuery(api.deals.list, { accountId });
  const setCreate = useUiStore((state) => state.setCreate);
  const setPeek = useUiStore((state) => state.setPeek);
  const today = todayDay();

  const sorted = useMemo(
    () =>
      deals &&
      [...deals].sort((a, b) => {
        const open =
          Number(isOpenStage(b.stage)) - Number(isOpenStage(a.stage));
        if (open !== 0) return open;
        if (!isOpenStage(a.stage)) return (b.closedAt ?? 0) - (a.closedAt ?? 0);
        const stage =
          DEAL_STAGES.indexOf(a.stage) - DEAL_STAGES.indexOf(b.stage);
        return stage !== 0 ? stage : a.position - b.position;
      }),
    [deals],
  );
  const openTotal = deals
    ? formatTotals(
        deals.filter((deal) => isOpenStage(deal.stage)).map((d) => d.amount),
        "",
      )
    : "";

  return (
    <RecordSection
      title="Deals"
      action={
        <span className="flex items-center gap-3">
          {openTotal && (
            <span className="caption-style text-fg-tertiary tabular-nums">
              {openTotal} open
            </span>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setCreate({ type: "deal", accountId })}
          >
            <PlusIcon aria-hidden className="size-2.5" />
            New deal
          </Button>
        </span>
      }
    >
      {sorted === undefined ? (
        <div className="border-border divide-border flex flex-col divide-y rounded-xl border">
          {[0, 1].map((index) => (
            <div key={index} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="border-border caption-style text-fg-tertiary rounded-xl border border-dashed px-4 py-5 text-center">
          No deals with this account yet.
        </p>
      ) : (
        <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-xl border">
          {sorted.map((deal) => {
            const open = isOpenStage(deal.stage);
            const overdue =
              open && deal.closeDate !== null && deal.closeDate < today;
            return (
              <li key={deal._id}>
                <Link
                  href={`/pipeline/deals/${deal._id}`}
                  onClick={(event) => {
                    if (isPlainClick(event)) {
                      event.preventDefault();
                      setPeek({ type: "deal", id: deal._id });
                    }
                  }}
                  className="hover:bg-overlay-1 focus-visible:ring-ring flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
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
                      {deal.owner && (
                        <>
                          <Avatar name={deal.owner.name} size="xs" />
                          <span className="truncate">{deal.owner.name}</span>
                        </>
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
                      {deal.stage === "lost" && deal.lostReason && (
                        <span className="truncate">· {deal.lostReason}</span>
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
    </RecordSection>
  );
}
