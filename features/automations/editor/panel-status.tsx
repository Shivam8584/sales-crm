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
import { NODE_META, toneVars } from "../node-meta";
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
  const meta = NODE_META[node.kind];
  const tested = run.steps.find((step) => step.nodeId === node.id);

  const state =
    run.activeNodeId === node.id
      ? "Running in the test run"
      : tested
        ? `Test run: ${tested.message}`
        : stats?.current
          ? `${stats.current} ${stats.current === 1 ? "record is" : "records are"} on this step now`
          : stats?.entered
            ? "Ready"
            : automation.status === "active"
              ? "No record has reached this step yet"
              : "Not live yet. Activate the automation to start enrolling.";

  const ports = portsOf(node);
  const skipped = stats?.ports.skipped ?? 0;
  const left = (stats?.ports.exited ?? 0) + (stats?.ports.failed ?? 0);
  const metrics = [
    { label: "Reached", value: stats?.entered ?? 0 },
    { label: "Here now", value: stats?.current ?? 0 },
    { label: skipped ? "Skipped" : "Left here", value: skipped || left },
  ];
  const portCounts = ports.map((port) => ({
    port,
    count: stats?.ports[port] ?? 0,
  }));
  const total = portCounts.reduce((sum, item) => sum + item.count, 0);
  const incoming = edges.filter((edge) => edge.target === node.id).length;
  const outgoing = edges.filter((edge) => edge.source === node.id).length;

  return (
    <div
      className="flex flex-col gap-4"
      style={toneVars(meta.tone) as CSSProperties}
    >
      <div className="bg-card shadow-card flex items-center gap-3 rounded-xl px-3.5 py-3">
        <span className="relative flex size-2.5 shrink-0">
          {(run.activeNodeId === node.id || Boolean(stats?.current)) && (
            <span className="absolute inset-0 animate-ping rounded-full bg-(--accent) opacity-60 motion-reduce:animate-none" />
          )}
          <span
            className={cn(
              "relative size-2.5 rounded-full",
              stats?.entered || tested ? "bg-(--accent)" : "bg-overlay-4",
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

      <div className="grid grid-cols-3 gap-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="bg-card shadow-card flex flex-col gap-1 rounded-xl px-3.5 py-3"
          >
            <span className="caption-style text-fg-tertiary font-medium">
              {metric.label}
            </span>
            <span className="font-display text-2xl leading-8 tabular-nums">
              {metric.value.toLocaleString("en-IN")}
            </span>
          </div>
        ))}
      </div>

      {ports.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="caption-style text-fg-tertiary font-medium">
            Path split
          </span>
          <div className="bg-overlay-2 flex h-2 overflow-hidden rounded-full">
            {total > 0 && (
              <span
                className="h-full w-(--split) bg-(--accent)"
                style={
                  {
                    "--split": `${(portCounts[0].count / total) * 100}%`,
                  } as CSSProperties
                }
              />
            )}
          </div>
          <div className="flex justify-between text-xs leading-4 font-medium tabular-nums">
            {portCounts.map(({ port, count }, index) => (
              <span
                key={port}
                className={index === 0 ? "text-(--accent)" : "text-fg-tertiary"}
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
