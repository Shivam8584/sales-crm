"use client";

import { useCallback } from "react";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

/**
 * Applies a patch to several records through their single-record `update`,
 * reports how many went through, and offers one undo for all of them.
 */
export function useBulkUpdate<Id extends string, Patch extends object>(
  update: (args: { id: Id; patch: Patch }) => Promise<unknown>,
) {
  return useCallback(
    async (
      ids: Id[],
      patchFor: (id: Id) => Patch,
      label: string,
    ): Promise<boolean> => {
      const results = await Promise.allSettled(
        ids.map((id) => update({ id, patch: patchFor(id) })),
      );
      const done = results.flatMap((result, index) =>
        result.status === "fulfilled"
          ? [{ id: ids[index], previous: result.value }]
          : [],
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed)
        toast(
          done.length
            ? `${label}: ${done.length} of ${ids.length} updated. ${readError(failed.reason).message}`
            : readError(failed.reason, "Couldn't save that change").message,
          { tone: "danger" },
        );
      if (done.length && !failed)
        toast(
          done.length === 1
            ? `${label} updated`
            : `${label} updated · ${done.length} records`,
          () =>
            done.forEach(({ id, previous }) => {
              const restore = Object.fromEntries(
                Object.keys(patchFor(id)).map((key) => [
                  key,
                  (previous as Record<string, unknown>)[key] ?? null,
                ]),
              ) as Patch;
              void update({ id, patch: restore });
            }),
        );
      return !failed;
    },
    [update],
  );
}
