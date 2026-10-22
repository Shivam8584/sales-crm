"use client";

import { useCallback, useEffect, useState } from "react";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { score, type Reason } from "@/lib/domain/dedupe";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export type DedupeType = "accounts" | "people";

export type Label = { id: string; name: string; sub: string | null };
export type ScanPair = { a: string; b: string; reasons: Reason[] };

/** The scan stops here; a workspace with more has bigger problems than this list. */
export const MAX_PAIRS = 200;

type Scan = {
  pairs: ScanPair[];
  labels: Map<string, Label>;
  done: boolean;
};

const START: Scan = { pairs: [], labels: new Map(), done: false };

/**
 * Pages through `dedupe.candidates` one call at a time, so the list fills in as
 * the scan goes and no single query reads more than a page.
 */
export function useDuplicateScan(type: DedupeType) {
  const convex = useConvex();
  const [scan, setScan] = useState<Scan>(START);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      const pairs = new Map<string, ScanPair>();
      const labels = new Map<string, Label>();
      let cursor: string | null = null;
      try {
        for (;;) {
          const page: FunctionReturnType<typeof api.dedupe.candidates> =
            await convex.query(api.dedupe.candidates, {
              type,
              paginationOpts: { numItems: 50, cursor },
            });
          if (cancelled) return;
          for (const group of page.groups) {
            for (const pair of group.pairs) {
              pairs.set([pair.a, pair.b].sort().join("|"), pair);
            }
          }
          for (const label of page.records) labels.set(label.id, label);
          const done = page.isDone || pairs.size >= MAX_PAIRS;
          setScan({
            pairs: [...pairs.values()]
              .sort((x, y) => score(y.reasons) - score(x.reasons))
              .slice(0, MAX_PAIRS),
            labels: new Map(labels),
            done,
          });
          if (done) return;
          cursor = page.continueCursor;
        }
      } catch (error) {
        if (cancelled) return;
        toast(readError(error, "Couldn't look for duplicates").message, {
          tone: "danger",
        });
        setScan((current) => ({ ...current, done: true }));
      }
    }
    void go();
    return () => {
      cancelled = true;
    };
  }, [convex, type, run]);

  const rescan = useCallback(() => {
    setScan(START);
    setRun((count) => count + 1);
  }, []);

  /** Drops pairs that involve `id` without waiting for a rescan. */
  const without = useCallback((id: string, other?: string) => {
    setScan((current) => ({
      ...current,
      pairs: current.pairs.filter((pair) =>
        other
          ? !(
              (pair.a === id && pair.b === other) ||
              (pair.a === other && pair.b === id)
            )
          : pair.a !== id && pair.b !== id,
      ),
    }));
  }, []);

  return { ...scan, rescan, without };
}
