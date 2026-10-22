"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { can } from "@/convex/lib/permissions";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import SegmentedControl from "@/components/_ui/segmented-control";
import { Switch } from "@/components/_ui/switch";
import { useViewer } from "@/hooks/use-viewer";
import {
  EXPORT_FORMATS,
  buildAutomationExport,
  exportFileName,
  type ExportFormat,
  type ExportSource,
} from "@/lib/domain/automation-export";
import type { NameLookup } from "@/lib/domain/automations";
import { toast } from "@/stores/toast-store";
import { describeCondition } from "./describe";
import { ToggleRow } from "./editor/form-bits";

const PREVIEW_LINES = 60;

const SEGMENTS = [
  { value: "json", label: "JSON" },
  { value: "csv", label: "Steps CSV" },
  { value: "markdown", label: "Markdown" },
];

const BLURB: Record<ExportFormat, string> = {
  json: "Every step and setting, to keep a copy or move it between workspaces.",
  csv: "One row per step, in order, for a spreadsheet.",
  markdown: "A readable outline to share or paste into a doc.",
};

function save(name: string, mime: string, text: string, bom: boolean) {
  const blob = new Blob(bom ? ["\ufeff", text] : [text], {
    type: `${mime};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Exports a copy of the sequence's steps; nothing here is customer data. */
export default function ExportDialog({
  id,
  source,
  open,
  onOpenChange,
}: {
  id: Id<"automations">;
  source: ExportSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ExportBody id={id} source={source} />
      </DialogContent>
    </Dialog>
  );
}

function ExportBody({
  id,
  source,
}: {
  id: Id<"automations">;
  source: ExportSource;
}) {
  const viewer = useViewer();
  const catalog = useQuery(api.automations.catalog, {});
  const [openedAt] = useState(() => Date.now());
  const [format, setFormat] = useState<ExportFormat>("json");
  const [includeRules, setIncludeRules] = useState(true);
  const [includeLog, setIncludeLog] = useState(false);

  // Run log lines name recipients, so only people who may export records get the option.
  const canLog = can(viewer, "record.export");
  const wantsLog = canLog && includeLog && format !== "csv";
  const logs = useQuery(api.automations.logs, wantsLog ? { id } : "skip");

  const names: NameLookup = useMemo(() => {
    const members = new Map(
      (catalog?.members ?? []).map((member) => [
        member._id as string,
        member.name,
      ]),
    );
    const automations = new Map(
      (catalog?.automations ?? []).map((item) => [
        item._id as string,
        item.name,
      ]),
    );
    return {
      member: (key) => members.get(key),
      automation: (key) => automations.get(key),
    };
  }, [catalog]);

  const waiting = catalog === undefined || (wantsLog && logs === undefined);
  const text = useMemo(
    () =>
      buildAutomationExport(format, source, {
        exportedAt: openedAt,
        includeRules,
        names,
        logs: wantsLog ? logs : undefined,
        describeCondition: (condition) => describeCondition(condition, names),
      }),
    [format, source, openedAt, includeRules, names, wantsLog, logs],
  );
  const lines = text.split("\n");
  const meta = EXPORT_FORMATS[format];
  const fileName = exportFileName(source.name, format);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied the ${meta.label.toLowerCase()}`);
    } catch {
      toast("Couldn't copy. Download it instead.", { tone: "warning" });
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export sequence</DialogTitle>
        <DialogDescription>
          A copy of the steps and settings. It holds message templates, not
          customer data.
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-5 px-6 py-5">
        <div className="flex flex-col gap-2">
          <SegmentedControl
            label="Format"
            value={format}
            onChange={(value) => setFormat(value as ExportFormat)}
            segments={SEGMENTS}
            className="self-start"
          />
          <p className="caption-style text-fg-tertiary leading-snug">
            {BLURB[format]}
          </p>
        </div>
        <details>
          <summary className="text-fg-secondary hover:text-foreground focus-visible:ring-ring w-fit cursor-pointer rounded-sm text-sm outline-none focus-visible:ring-2">
            More options
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <ToggleRow
              label="Include rules and settings"
              description="Trigger filters, conditions, goal, limits and sender."
              control={(controlId) => (
                <Switch
                  id={controlId}
                  checked={includeRules}
                  onCheckedChange={setIncludeRules}
                />
              )}
            />
            {canLog && (
              <ToggleRow
                label="Include run log"
                description={
                  format === "csv"
                    ? "Not part of the steps report."
                    : "The last 100 lines. They name recipients."
                }
                control={(controlId) => (
                  <Switch
                    id={controlId}
                    checked={includeLog && format !== "csv"}
                    disabled={format === "csv"}
                    onCheckedChange={setIncludeLog}
                  />
                )}
              />
            )}
          </div>
        </details>
        <div className="flex min-w-0 flex-col gap-1.5">
          <pre
            tabIndex={0}
            aria-label="Preview"
            className="border-input bg-secondary text-fg-secondary focus-visible:border-selected focus-visible:ring-selected/20 max-h-64 min-w-0 overflow-auto rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed outline-none focus-visible:ring-3"
          >
            {lines.slice(0, PREVIEW_LINES).join("\n")}
          </pre>
          {lines.length > PREVIEW_LINES && (
            <p className="caption-style text-fg-tertiary">
              {lines.length - PREVIEW_LINES} more lines in the export
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="secondary"
          size="sm"
          disabled={waiting}
          onClick={() => void copy()}
        >
          Copy
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={waiting}
          onClick={() => {
            save(fileName, meta.mime, text, format === "csv");
            toast(`Downloaded ${fileName}`);
          }}
        >
          Download
        </Button>
      </DialogFooter>
    </>
  );
}
