"use client";

import { useCallback } from "react";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

/**
 * Saves one field of a record and offers undo. Resolves with an error message
 * for inline editors, so a rejected value keeps the editor open.
 */
export function useRecordUpdate<Id, Patch>(
  update: (args: { id: Id; patch: Patch }) => Promise<Patch>,
  id: Id,
) {
  return useCallback(
    async (patch: Patch, label: string): Promise<string | void> => {
      try {
        const previous = await update({ id, patch });
        const restore = Object.fromEntries(
          Object.keys(patch as object).map((key) => [
            key,
            (previous as Record<string, unknown>)[key] ?? null,
          ]),
        ) as Patch;
        toast(`${label} updated`, () => void update({ id, patch: restore }));
      } catch (error) {
        return readError(error, "Couldn't save that change").message;
      }
    },
    [update, id],
  );
}
