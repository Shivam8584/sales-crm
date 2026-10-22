"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import RunStatus from "./run-status";

type Runs = FunctionReturnType<typeof api.agents.runs>;

const WHY = {
  schedule: "Scheduled",
  event: "Event",
  manual: "Run by you",
  preview: "Preview",
} as const;

/** Recent runs, newest first; one opens to show every step. */
export default function RunList({
  runs,
  openId,
  onOpen,
}: {
  runs: Runs;
  openId: Id<"agentRuns"> | null;
  onOpen: (id: Id<"agentRuns"> | null) => void;
}) {
  return (
    <ul className="border-border border-t">
      {runs.map((run) => {
        const open = openId === run._id;
        return (
          <li key={run._id} className="border-border border-b">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onOpen(open ? null : run._id)}
              className="focus-visible:ring-ring flex w-full cursor-pointer items-baseline gap-3 py-3 text-left outline-none focus-visible:ring-2"
            >
              <time
                title={dateTime(run.startedAt)}
                className="text-fg-secondary w-24 shrink-0 text-sm tabular-nums"
              >
                {relativeTime(run.startedAt)}
              </time>
              <span className="text-body min-w-0 flex-1 truncate">
                {WHY[run.trigger]}
                <span className="text-fg-secondary">
                  {run.summary
                    ? ` · ${run.summary}`
                    : run.note
                      ? ` · ${run.note}`
                      : ""}
                </span>
              </span>
              <RunStatus status={run.status} />
            </button>
            {open && <RunDetail id={run._id} />}
          </li>
        );
      })}
    </ul>
  );
}

function RunDetail({ id }: { id: Id<"agentRuns"> }) {
  const run = useQuery(api.agents.run, { id });
  const undo = useMutation(api.tokens.undo);
  const [busy, setBusy] = useState<string>();

  async function revert(changeId: Id<"mcpWrites">) {
    setBusy(changeId);
    try {
      await undo({ id: changeId });
      toast("Change undone");
    } catch (error) {
      toast(readError(error, "Couldn't undo that").message, { tone: "danger" });
    } finally {
      setBusy(undefined);
    }
  }

  if (run === undefined) {
    return (
      <div aria-hidden className="flex flex-col gap-2 pb-4">
        <Skeleton className="h-3 w-64 max-w-full" />
        <Skeleton className="h-3 w-40" />
      </div>
    );
  }
  if (run === null) return null;

  return (
    <div className="flex flex-col gap-4 pb-5 text-sm">
      {run.context && <p className="text-fg-secondary">{run.context}</p>}
      {run.summary && <p className="text-body">{run.summary}</p>}
      {run.note && (
        <p className={run.status === "failed" ? "text-danger" : "text-warning"}>
          {run.note}
        </p>
      )}
      {run.dryRun && run.status !== "skipped" && (
        <p className="text-fg-secondary">
          Nothing was changed. Writes are listed as planned.
        </p>
      )}
      {run.log.length > 0 && (
        <ol className="flex flex-col">
          {run.log.map((entry, index) => (
            <li
              key={index}
              className="border-border flex flex-col gap-1 border-t py-2.5"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-fg-tertiary caption-style tabular-nums">
                  {entry.step}
                </span>
                <code className="text-body font-mono">{entry.tool}</code>
                <span
                  className={cn(
                    "caption-style",
                    entry.status === "error"
                      ? "text-danger"
                      : "text-fg-tertiary",
                  )}
                >
                  {entry.status === "ok"
                    ? "done"
                    : entry.status === "planned"
                      ? "planned"
                      : "failed"}
                </span>
              </div>
              <code className="text-fg-secondary font-mono text-xs break-all">
                {entry.args}
              </code>
              <span
                className={cn(
                  "break-words",
                  entry.status === "error" && "text-danger",
                )}
              >
                {entry.result}
              </span>
            </li>
          ))}
        </ol>
      )}
      {run.changes.length > 0 && (
        <div className="flex flex-col">
          {run.changes.map((change) => (
            <div
              key={change._id}
              className="border-border flex items-center gap-3 border-t py-2"
            >
              <span className="min-w-0 flex-1 truncate">{change.summary}</span>
              {change.undone ? (
                <span className="text-fg-tertiary caption-style">undone</span>
              ) : (
                change.undoable && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busy === change._id}
                    onClick={() => void revert(change._id)}
                  >
                    Undo
                  </Button>
                )
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-fg-tertiary caption-style tabular-nums">
        {run.steps} {run.steps === 1 ? "step" : "steps"} · {run.toolCalls} tool{" "}
        {run.toolCalls === 1 ? "call" : "calls"} · about{" "}
        {run.tokens.toLocaleString("en-IN")} tokens
      </p>
    </div>
  );
}
