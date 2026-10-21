"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import SegmentedControl from "@/components/_ui/segmented-control";
import Skeleton from "@/components/_ui/skeleton";
import type { GraphNode } from "@/lib/domain/automations";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import PlayIcon from "@/public/assets/icons/automations/play.svg";
import { useEditor } from "./editor-context";
import { useEditorStore } from "./editor-store";

const LEVEL_DOT = {
  info: "bg-fg-tertiary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-danger",
} as const;

/** Run log for this step or the whole automation, newest first, with the test run on top. */
export default function PanelLogs({ node }: { node: GraphNode }) {
  const { automation, startTestRun } = useEditor();
  const [scope, setScope] = useState<"step" | "all">(() =>
    useEditorStore.getState().run.status === "done" ? "all" : "step",
  );
  const logs = useQuery(api.automations.logs, {
    id: automation._id as Id<"automations">,
    nodeId: scope === "step" ? node.id : undefined,
  });
  const run = useEditorStore((state) => state.run);
  const tested = run.steps.filter(
    (step) => scope === "all" || step.nodeId === node.id,
  );
  const count = (logs?.length ?? 0) + tested.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl
          label="Show logs for"
          value={scope}
          onChange={(value) => setScope(value as "step" | "all")}
          segments={[
            { value: "step", label: "This step" },
            { value: "all", label: "All steps" },
          ]}
        />
        <span className="caption-style text-fg-tertiary tabular-nums">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
      </div>

      {tested.length > 0 && (
        <ol
          aria-label="Test run"
          className="bg-card shadow-card flex flex-col overflow-hidden rounded-xl"
        >
          <li className="caption-style text-fg-tertiary border-border border-b px-3.5 py-2 font-medium">
            Dry run{run.subject ? ` · ${run.subject}` : ""} · nothing was sent
            or changed
          </li>
          {tested.map((step, index) => (
            <li
              key={`${step.nodeId}-${index}`}
              className="border-border flex items-start gap-3 px-3.5 py-2.5 not-last:border-b"
            >
              <span
                className={cn(
                  "mt-[7px] size-1.5 shrink-0 rounded-full",
                  step.outcome === "skipped"
                    ? "bg-warning"
                    : step.outcome === "error"
                      ? "bg-danger"
                      : "bg-success",
                )}
              />
              <span className="min-w-0 flex-1 text-[13px] leading-5">
                {step.message}
              </span>
            </li>
          ))}
        </ol>
      )}

      {logs === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : logs.length ? (
        <ol className="bg-card shadow-card flex flex-col overflow-hidden rounded-xl">
          {logs.map((log) => (
            <li
              key={log._id}
              className="border-border flex items-start gap-3 px-3.5 py-2.5 not-last:border-b"
            >
              <span
                className={cn(
                  "mt-[7px] size-1.5 shrink-0 rounded-full",
                  LEVEL_DOT[log.level],
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] leading-5 break-words">
                  {log.message}
                </span>
                {log.subject.href ? (
                  <Link
                    href={log.subject.href}
                    className="caption-style text-fg-tertiary hover:text-foreground w-fit truncate"
                  >
                    {log.subject.name}
                  </Link>
                ) : (
                  <span className="caption-style text-fg-tertiary">
                    {log.subject.name}
                  </span>
                )}
              </span>
              <time
                dateTime={new Date(log.at).toISOString()}
                title={dateTime(log.at)}
                className="caption-style text-fg-tertiary shrink-0 tabular-nums"
              >
                {relativeTime(log.at)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        tested.length === 0 && (
          <div className="bg-card shadow-card flex flex-col items-center rounded-xl px-6 py-8 text-center">
            <span className="text-sm font-medium">No logs yet</span>
            <span className="caption-style text-fg-tertiary mt-1.5 max-w-[24em] leading-snug text-balance">
              Try the automation on a real record. The dry run shows each step’s
              decision without sending anything.
            </span>
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              onClick={startTestRun}
            >
              <PlayIcon aria-hidden className="size-3.5" />
              Test run
            </Button>
          </div>
        )
      )}
    </div>
  );
}
