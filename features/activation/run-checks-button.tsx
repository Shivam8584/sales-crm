"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";

type Result = FunctionReturnType<typeof api.activation.runNow>;

const OUTCOME_LABEL = {
  created: "New task",
  reopened: "Reopened",
  closed: "Closed",
} as const;

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Runs the activation checks on demand and shows which tasks they opened or closed. */
export default function RunChecksButton() {
  const runNow = useMutation(api.activation.runNow);
  const setEdit = useUiStore((state) => state.setEdit);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);

  async function run() {
    setRunning(true);
    try {
      setResult(await runNow({}));
      setOpen(true);
    } catch (error) {
      toast(readError(error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={(next) => !next && setOpen(false)}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          loading={running}
          onClick={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          Run checks now
        </Button>
      </PopoverTrigger>
      {result && (
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))]">
          <div className="border-border border-b px-4 py-3">
            <p className="lead-style font-medium">
              {result.changes.length === 0
                ? "Nothing changed"
                : plural(result.changes.length, "change")}
            </p>
            <p className="caption-style text-fg-tertiary mt-1">
              Checked {plural(result.checked, "brand")} · {result.stuck} stuck
            </p>
          </div>
          {result.changes.length === 0 ? (
            <p className="caption-style text-fg-secondary px-4 py-3 leading-snug">
              Every stuck brand already has a task, and no brand moved on since
              the last check.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {result.changes.map((change) => (
                <li key={`${change.outcome}-${change.taskId}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setEdit({ type: "task", id: change.taskId });
                    }}
                    className="hover:bg-overlay-1 focus-visible:ring-ring flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2"
                  >
                    <span className="flex w-full items-baseline justify-between gap-3">
                      <span className="lead-style truncate font-medium">
                        {change.accountName}
                      </span>
                      <span className="caption-style text-fg-tertiary shrink-0">
                        {OUTCOME_LABEL[change.outcome]}
                      </span>
                    </span>
                    <span className="caption-style text-fg-tertiary leading-snug">
                      {change.detail}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}
