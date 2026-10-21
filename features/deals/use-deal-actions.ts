"use client";

import { useCallback } from "react";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export type DealRow = FunctionReturnType<typeof api.deals.list>[number];

/** A left click without modifiers; anything else should follow the link. */
export function isPlainClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** Position that drops a card before `beforeId` (or at the end) of a column. */
export function positionBefore(
  column: DealRow[],
  id: string,
  beforeId: string | null,
) {
  const others = column.filter((deal) => deal._id !== id);
  const index = beforeId
    ? others.findIndex((deal) => deal._id === beforeId)
    : others.length;
  const prev = others[index - 1]?.position;
  const next = index >= 0 ? others[index]?.position : undefined;
  if (prev === undefined && next === undefined) return 0;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

type MoveArgs = {
  id: Id<"deals">;
  stage: DealStage;
  position: number;
  lostReason?: string;
};

/** Applies an optimistic change to the board and to every record page's deal list. */
function patchDeals(
  store: OptimisticLocalStore,
  update: (deals: DealRow[]) => DealRow[],
) {
  for (const { args, value } of store.getAllQueries(api.deals.list)) {
    if (value) store.setQuery(api.deals.list, args, update(value));
  }
  for (const { args, value } of store.getAllQueries(api.deals.board)) {
    if (value) store.setQuery(api.deals.board, args, update(value));
  }
}

export function useMoveDeal() {
  const move = useMutation(api.deals.move).withOptimisticUpdate(
    (store, { id, stage, position, lostReason }) =>
      patchDeals(store, (deals) =>
        deals
          .map((deal) =>
            deal._id === id
              ? {
                  ...deal,
                  stage,
                  position,
                  lostReason:
                    stage === "lost" ? (lostReason ?? deal.lostReason) : null,
                  closedAt:
                    stage === "won" || stage === "lost"
                      ? deal.stage === stage
                        ? deal.closedAt
                        : Date.now()
                      : null,
                }
              : deal,
          )
          .sort((a, b) => a.position - b.position),
      ),
  );

  return useCallback(
    async (deal: DealRow, args: Omit<MoveArgs, "id">) => {
      try {
        const previous = await move({ id: deal._id, ...args });
        if (args.stage === previous.stage) return;
        if (args.stage !== "won" && args.stage !== "lost") return;
        const undo = () =>
          void move({
            id: deal._id,
            stage: previous.stage,
            position: previous.position,
            lostReason: previous.lostReason,
          }).catch((error) =>
            toast(readError(error).message, { tone: "danger" }),
          );
        toast(
          args.stage === "won"
            ? `Won ${deal.title}`
            : `${deal.title} marked as ${DEAL_STAGE_LABEL.lost.toLowerCase()}`,
          undo,
        );
      } catch (error) {
        toast(readError(error, `Couldn't move ${deal.title}`).message, {
          tone: "danger",
        });
      }
    },
    [move],
  );
}

export function useRemoveDeal() {
  const remove = useMutation(api.deals.remove).withOptimisticUpdate(
    (store, { id }) =>
      patchDeals(store, (deals) => deals.filter((deal) => deal._id !== id)),
  );
  const restore = useMutation(api.deals.restore);

  return useCallback(
    async (deal: { _id: Id<"deals">; title: string }) => {
      try {
        const removed = await remove({ id: deal._id });
        toast(`Deleted ${deal.title}`, () => {
          void restore(removed).catch((error) =>
            toast(readError(error, `Couldn't restore ${deal.title}`).message, {
              tone: "danger",
            }),
          );
        });
      } catch (error) {
        toast(readError(error, `Couldn't delete ${deal.title}`).message, {
          tone: "danger",
        });
      }
    },
    [remove, restore],
  );
}
