"use client";

import { useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Skeleton from "@/components/_ui/skeleton";
import SearchInput from "@/components/data-table/search-input";
import { SUBJECT_LABEL, type SubjectKind } from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useEditorStore } from "./editor-store";
import { playTestRun } from "./test-run";

type TestRunDialogProps = {
  automationId: Id<"automations">;
  subjectKind: SubjectKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the path is known, e.g. to open the logs. */
  onResult: (lastNodeId: string | null) => void;
};

/** Picks a record and dry-runs the current draft on it; nothing is sent or changed. */
export default function TestRunDialog({
  automationId,
  subjectKind,
  open,
  onOpenChange,
  onResult,
}: TestRunDialogProps) {
  const convex = useConvex();
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const records = useQuery(
    api.automations.subjects,
    open ? { kind: subjectKind, query } : "skip",
  );
  const [plural] = [SUBJECT_LABEL[subjectKind][1]];

  async function run(record: { id: string; name: string }) {
    setRunning(record.id);
    try {
      const result = await convex.query(api.automations.dryRun, {
        id: automationId,
        target: { kind: subjectKind, id: record.id },
      });
      onOpenChange(false);
      useEditorStore.getState().closeInspector();
      onResult(result.steps.at(-1)?.nodeId ?? null);
      void playTestRun(result.steps, record.name);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Test run</DialogTitle>
          <DialogDescription>
            Pick one of your {plural} to see its path through the current draft.
            Nothing is sent or changed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-6">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={`Search ${plural}`}
          />
          <ul
            aria-label={`${plural} to test with`}
            className="border-border flex max-h-80 flex-col overflow-y-auto rounded-xl border"
          >
            {records === undefined ? (
              Array.from({ length: 5 }, (_, index) => (
                <li
                  key={index}
                  className="border-border flex h-12 items-center border-b px-3 last:border-b-0"
                >
                  <Skeleton className="h-3.5 w-40" />
                </li>
              ))
            ) : records.length === 0 ? (
              <li className="caption-style text-fg-tertiary px-3 py-6 text-center">
                No {plural} match “{query}”.
              </li>
            ) : (
              records.map((record) => (
                <li
                  key={record.id}
                  className="border-border border-b last:border-b-0"
                >
                  <button
                    type="button"
                    disabled={Boolean(running)}
                    onClick={() => void run(record)}
                    className={cn(
                      "hover:bg-overlay-1 focus-visible:bg-overlay-2 flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left outline-none disabled:opacity-60",
                      running === record.id && "bg-overlay-2",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {record.name}
                      </span>
                      {record.meta && (
                        <span className="caption-style text-fg-tertiary truncate">
                          {record.meta}
                        </span>
                      )}
                    </span>
                    <span className="caption-style text-fg-tertiary shrink-0">
                      {running === record.id ? "Running…" : "Run"}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
