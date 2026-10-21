"use client";

import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ProposalLine } from "@/lib/domain/pricing";
import { formatMoney } from "@/lib/domain/money";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export type ProposalRow = FunctionReturnType<
  typeof api.proposals.forDeal
>[number];

export type LinePatch = Partial<Omit<ProposalLine, "key" | "price">> & {
  price?: ProposalLine["price"] | null;
};

function patchLine(line: ProposalLine, patch: LinePatch): ProposalLine {
  const { price, ...rest } = patch;
  const next: ProposalLine = { ...line, ...rest };
  if (price === null) delete next.price;
  else if (price !== undefined) next.price = price;
  return next;
}

const fail = (error: unknown, fallback?: string) =>
  toast(readError(error, fallback).message, { tone: "danger" });

/** Proposal mutations for one deal: optimistic line edits and Undo toasts. */
export function useProposalActions(dealId: Id<"deals">) {
  function editLines(
    store: OptimisticLocalStore,
    id: Id<"proposals">,
    edit: (lines: ProposalLine[]) => ProposalLine[],
  ) {
    const rows = store.getQuery(api.proposals.forDeal, { dealId });
    if (!rows) return;
    store.setQuery(
      api.proposals.forDeal,
      { dealId },
      rows.map((row) =>
        row._id === id ? { ...row, lines: edit(row.lines) } : row,
      ),
    );
  }

  const updateLineMutation = useMutation(
    api.proposals.updateLine,
  ).withOptimisticUpdate((store, { id, key, patch }) =>
    editLines(store, id, (lines) =>
      lines.map((line) =>
        line.key === key ? patchLine(line, patch as LinePatch) : line,
      ),
    ),
  );
  const addLineMutation = useMutation(
    api.proposals.addLine,
  ).withOptimisticUpdate((store, { id, line, index }) =>
    editLines(store, id, (lines) => {
      const next = [...lines];
      next.splice(index ?? next.length, 0, line);
      return next;
    }),
  );
  const removeLineMutation = useMutation(
    api.proposals.removeLine,
  ).withOptimisticUpdate((store, { id, key }) =>
    editLines(store, id, (lines) => lines.filter((line) => line.key !== key)),
  );

  const create = useMutation(api.proposals.create);
  const update = useMutation(api.proposals.update);
  const requestApproval = useMutation(api.proposals.requestApproval);
  const decide = useMutation(api.proposals.decide);
  const send = useMutation(api.proposals.send);
  const accept = useMutation(api.proposals.accept);
  const reject = useMutation(api.proposals.reject);
  const reopen = useMutation(api.proposals.reopen);
  const remove = useMutation(api.proposals.remove);
  const restore = useMutation(api.proposals.restore);

  return {
    create: async (line?: ProposalLine, validUntil?: string) => {
      try {
        return await create({ dealId, line, validUntil });
      } catch (error) {
        fail(error, "Couldn't start the proposal");
      }
    },
    updateLine: (id: Id<"proposals">, key: string, patch: LinePatch) =>
      updateLineMutation({ id, key, patch }).catch((error) => fail(error)),
    addLine: (id: Id<"proposals">, line: ProposalLine, index?: number) =>
      addLineMutation({ id, line, index }).catch((error) => fail(error)),
    removeLine: async (id: Id<"proposals">, line: ProposalLine) => {
      try {
        const removed = await removeLineMutation({ id, key: line.key });
        toast(
          `Removed ${line.product || "the line"}`,
          () =>
            void addLineMutation({
              id,
              line: removed.line,
              index: removed.index,
            }).catch((error) => fail(error)),
        );
      } catch (error) {
        fail(error);
      }
    },
    update: async (
      proposal: ProposalRow,
      patch: {
        validUntil?: string;
        terms?: string;
        currency?: ProposalRow["currency"];
      },
      label: string,
    ) => {
      try {
        const previous = await update({ id: proposal._id, patch });
        const undo = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            previous[key as keyof typeof previous],
          ]),
        );
        toast(
          `${label} updated`,
          () =>
            void update({ id: proposal._id, patch: undo }).catch((error) =>
              fail(error),
            ),
        );
      } catch (error) {
        fail(error);
      }
    },
    requestApproval: async (proposal: ProposalRow) => {
      try {
        await requestApproval({ id: proposal._id });
        toast("Approval requested; managers have been notified");
      } catch (error) {
        fail(error);
      }
    },
    decide: async (proposal: ProposalRow, approve: boolean, reason: string) => {
      try {
        await decide({ id: proposal._id, approve, reason });
        toast(approve ? "Pricing approved" : "Pricing declined");
      } catch (error) {
        return readError(error, "Couldn't save the decision");
      }
    },
    send: async (proposal: ProposalRow) => {
      try {
        await send({ id: proposal._id });
        toast(`Marked v${proposal.version} as sent`);
      } catch (error) {
        fail(error);
      }
    },
    accept: async (proposal: ProposalRow) => {
      try {
        const result = await accept({ id: proposal._id });
        toast(
          `Accepted v${proposal.version}; deal amount is now ${formatMoney(result.amount)}`,
          () =>
            void reopen({ id: proposal._id, restore: result }).catch((error) =>
              fail(error),
            ),
        );
      } catch (error) {
        fail(error);
      }
    },
    reject: async (proposal: ProposalRow) => {
      try {
        await reject({ id: proposal._id });
        toast(
          `Marked v${proposal.version} as rejected`,
          () => void reopen({ id: proposal._id }).catch((error) => fail(error)),
        );
      } catch (error) {
        fail(error);
      }
    },
    remove: async (
      proposal: ProposalRow,
      onRestored: (id: Id<"proposals">) => void,
    ) => {
      try {
        const copy = await remove({ id: proposal._id });
        toast(
          `Deleted draft v${proposal.version}`,
          () =>
            void restore({ proposal: copy })
              .then(onRestored)
              .catch((error) => fail(error)),
        );
      } catch (error) {
        fail(error);
      }
    },
  };
}

export type ProposalActions = ReturnType<typeof useProposalActions>;
