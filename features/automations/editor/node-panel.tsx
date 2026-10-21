"use client";

import type { CSSProperties } from "react";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import SegmentedControl from "@/components/_ui/segmented-control";
import type { Issue } from "@/lib/domain/automations";
import RowInsertIcon from "@/public/assets/icons/automations/row-insert.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import XIcon from "@/public/assets/icons/x.svg";
import { ACTION_GROUPS, NODE_META, toneVars } from "../node-meta";
import { useCanvasApi } from "./canvas";
import { useEditor } from "./editor-context";
import { useEditorStore, type InspectorTab } from "./editor-store";
import { IssueList } from "./form-bits";
import { portsOf } from "./geometry";
import PanelBuild from "./panel-build";
import PanelLogs from "./panel-logs";
import PanelRules from "./panel-rules";
import PanelStatus from "./panel-status";

const TABS: { value: InspectorTab; label: string }[] = [
  { value: "build", label: "Build" },
  { value: "rules", label: "Rules" },
  { value: "status", label: "Status" },
  { value: "logs", label: "Logs" },
];

type NodePanelProps = { issues: Issue[] };

/** The selected step's side panel: Build, Rules, Status and Logs. */
export default function NodePanel({ issues }: NodePanelProps) {
  const { readOnly } = useEditor();
  const { focusNode: onFocusNode, appendTo: onAppend } = useCanvasApi();
  const inspector = useEditorStore((state) => state.inspector);
  const node = useEditorStore((state) =>
    state.nodes.find((item) => item.id === state.inspector?.nodeId),
  );
  const edges = useEditorStore((state) => state.edges);
  const setTab = useEditorStore((state) => state.setInspectorTab);
  const openInspector = useEditorStore((state) => state.openInspector);
  const closeInspector = useEditorStore((state) => state.closeInspector);
  const select = useEditorStore((state) => state.select);
  const removeSelection = useEditorStore((state) => state.removeSelection);

  if (!inspector || !node) return null;
  const meta = NODE_META[node.kind];
  const nodeIssues = issues.filter((issue) => issue.nodeId === node.id);
  const fieldErrors = Object.fromEntries(
    nodeIssues
      .filter((issue) => issue.field)
      .map((issue) => [issue.field!.split(".")[0], issue.message]),
  );
  const general = nodeIssues
    .filter((issue) => !issue.field)
    .map((issue) => issue.message);
  const outgoing = edges.filter((edge) => edge.source === node.id);
  const next = outgoing[0];
  const canAppend = !readOnly && portsOf(node).length > outgoing.length;

  const goNext = () => {
    if (!next) return;
    openInspector(next.target);
    onFocusNode(next.target);
  };

  return (
    <aside
      aria-label={`${meta.label} step`}
      data-canvas-overlay
      onPointerDown={(event) => event.stopPropagation()}
      style={toneVars(meta.tone) as CSSProperties}
      className="bg-popover shadow-overlay border-border absolute top-3 right-3 bottom-3 z-30 flex w-[min(440px,calc(100%-24px))] flex-col overflow-clip rounded-2xl border transition-[opacity,translate] duration-200 motion-reduce:transition-none max-sm:top-2 max-sm:right-2 max-sm:bottom-2 max-sm:w-[calc(100%-16px)] starting:translate-x-3 starting:opacity-0"
    >
      <div className="flex shrink-0 items-center gap-3 px-4 pt-3.5 pb-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-(--accent-border) bg-(--accent-surface)">
          <meta.Icon aria-hidden className="size-4 text-(--accent)" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{meta.label}</span>
          <span className="caption-style text-fg-tertiary truncate">
            {meta.hint}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close step panel"
          onClick={closeInspector}
        >
          <XIcon aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="border-border shrink-0 border-b px-4 pb-3">
        <SegmentedControl
          label="Step panels"
          value={inspector.tab}
          onChange={(tab) => setTab(tab as InspectorTab)}
          segments={TABS}
          className="w-full [&>*]:flex-1 [&>*]:justify-center"
        />
      </div>

      <div
        key={`${node.id}-${inspector.tab}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {(inspector.tab === "build" || inspector.tab === "rules") &&
          general.length > 0 && (
            <div className="mb-4">
              <IssueList issues={general} />
            </div>
          )}
        {inspector.tab === "build" && (
          <PanelBuild node={node} fieldErrors={fieldErrors} />
        )}
        {inspector.tab === "rules" && (
          <PanelRules node={node} fieldErrors={fieldErrors} />
        )}
        {inspector.tab === "status" && <PanelStatus node={node} />}
        {inspector.tab === "logs" && <PanelLogs node={node} />}
      </div>

      {(next || canAppend || (!readOnly && node.kind !== "trigger")) && (
        <div className="border-border flex shrink-0 items-center gap-2 border-t px-4 py-3">
          {!readOnly && node.kind !== "trigger" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                select({ type: "node", id: node.id });
                removeSelection();
              }}
            >
              <TrashIcon aria-hidden className="size-3.5" />
              Delete step
            </Button>
          )}
          <span className="flex-1" />
          {canAppend ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="primary" size="sm">
                  <RowInsertIcon
                    aria-hidden
                    className="size-3.5 -scale-y-100"
                  />
                  Add next step
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-60">
                {ACTION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <DropdownMenuLabel className="uppercase">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.kinds.map((kind) => {
                      const option = NODE_META[kind];
                      return (
                        <DropdownMenuItem
                          key={kind}
                          style={toneVars(option.tone) as CSSProperties}
                          onSelect={() => onAppend(node.id, kind)}
                        >
                          <option.Icon
                            aria-hidden
                            className="size-4 text-(--accent)"
                          />
                          {option.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            next && (
              <Button variant="secondary" size="sm" onClick={goNext}>
                Next step
              </Button>
            )
          )}
        </div>
      )}
    </aside>
  );
}
