"use client";

import type { CSSProperties } from "react";
import {
  PORT_LABEL,
  portsOf,
  type GraphNode,
  type PortId,
} from "@/lib/domain/automations";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { useEditorStore } from "./editor-store";

const PATH_NAME: Record<PortId, string> = {
  out: "Next",
  yes: "YES",
  no: "NO",
  met: "EVENT",
  timeout: "TIMEOUT",
};

/** How real runs have moved through this step, from the enrollment history. */
export default function PanelStatus({ node }: { node: GraphNode }) {
  const { nodeStats, automation } = useEditor();
  const run = useEditorStore((state) => state.run);
  const edges = useEditorStore((state) => state.edges);
  const stats = nodeStats?.[node.id];
  const tested = run.steps.find((step) => step.nodeId === node.id);

  const state =
    run.activeNodeId === node.id
      ? "Running in the test run"
      : tested
        ? `Test run: ${tested.message}`
        : stats?.current
          ? `${stats.current} ${stats.current === 1 ? "record is" : "records are"} on this step now`
          : stats?.reached
            ? "Ready"
            : automation.status === "active"
              ? "No record has reached this step yet"
              : "Not live yet. Activate the automation to start enrolling.";

  const ports = portsOf(node);
  const metrics = [
    { label: "Reached", value: stats?.reached ?? 0 },
    {
      label: node.kind === "exit" ? "Ended here" : "Went on",
      value: node.kind === "exit" ? (stats?.ended ?? 0) : (stats?.passed ?? 0),
    },
    { label: "Here now", value: stats?.current ?? 0 },
  ];
  const skipped = stats?.skipped ?? 0;
  const ended = node.kind === "exit" ? 0 : (stats?.ended ?? 0);
  const portCounts = ports.map((port) => ({
    port,
    count: stats?.ports[port] ?? 0,
  }));
  const total = portCounts.reduce((sum, item) => sum + item.count, 0);
  const incoming = edges.filter((edge) => edge.target === node.id).length;
  const outgoing = edges.filter((edge) => edge.source === node.id).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="relative flex size-2.5 shrink-0">
          {(run.activeNodeId === node.id || Boolean(stats?.current)) && (
            <span className="bg-ring absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none" />
          )}
          <span
            className={cn(
              "relative size-2.5 rounded-full",
              stats?.reached || tested ? "bg-ring" : "bg-overlay-4",
            )}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm leading-5 font-medium">{state}</span>
          <span className="caption-style text-fg-tertiary">
            {stats?.lastAt
              ? `Last activity ${relativeTime(stats.lastAt)}`
              : "No activity yet"}{" "}
            · {incoming} in · {outgoing} out
          </span>
        </div>
      </div>

      <dl className="border-border grid grid-cols-3 gap-2 border-t pt-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex flex-col gap-0.5">
            <dt className="caption-style text-fg-tertiary">{metric.label}</dt>
            <dd className="text-lg tabular-nums">
              {metric.value.toLocaleString("en-IN")}
            </dd>
          </div>
        ))}
      </dl>

      {(skipped > 0 || ended > 0) && (
        <p className="caption-style text-fg-tertiary leading-snug">
          {[
            skipped > 0 &&
              `${skipped.toLocaleString("en-IN")} skipped here (no consent, no address, an empty variable or nobody to assign)`,
            ended > 0 && `${ended.toLocaleString("en-IN")} ended on this step`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {ports.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="caption-style text-fg-tertiary">Path split</span>
          <div className="bg-overlay-2 flex h-2 overflow-hidden rounded-full">
            {total > 0 && (
              <span
                className="bg-fg-tertiary h-full w-(--split)"
                style={
                  {
                    "--split": `${(portCounts[0].count / total) * 100}%`,
                  } as CSSProperties
                }
              />
            )}
          </div>
          <div className="flex justify-between text-xs leading-4 tabular-nums">
            {portCounts.map(({ port, count }, index) => (
              <span
                key={port}
                className={index === 0 ? "text-foreground" : "text-fg-tertiary"}
              >
                {PORT_LABEL[port] || PATH_NAME[port]} ·{" "}
                {total ? Math.round((count / total) * 100) : 0}%{" "}
                <span className="text-fg-tertiary">({count})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
