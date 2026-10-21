"use client";

import { useId, useMemo, useRef, useState, type DragEvent } from "react";
import type { ImportResult } from "@/convex/lib/records";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/_ui/select";
import Tag from "@/components/_ui/tag";
import { downloadCsv } from "@/lib/csv";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  /** Header names that map to this field automatically, lowercase. */
  aliases: string[];
};

export type ImportRow = Record<string, string>;

export type ImportConfig = {
  noun: [string, string];
  fields: ImportField[];
  example: string[];
  run: (rows: ImportRow[], dryRun: boolean) => Promise<ImportResult[]>;
  /** Main and secondary text identifying a row in the preview. */
  describe: (row: ImportRow) => [string, string];
};

const SKIP = "__skip";
const MAX_ROWS = 1000;
const CHUNK = 200;

/** RFC 4180 parsing: quoted fields, escaped quotes, CRLF and newlines inside quotes. */
export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function guessMapping(headers: string[], fields: ImportField[]) {
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const names = [
      field.key.toLowerCase(),
      field.label.toLowerCase(),
      ...field.aliases,
    ];
    const index = headers.findIndex((header) =>
      names.includes(normalizeHeader(header)),
    );
    mapping[field.key] =
      index >= 0 && !Object.values(mapping).includes(String(index))
        ? String(index)
        : SKIP;
  }
  return mapping;
}

type Step =
  | { name: "upload"; error?: string }
  | { name: "map" }
  | { name: "preview"; results: ImportResult[] }
  | { name: "done"; results: ImportResult[] };

/** Upload a CSV, map its columns, preview server validation per row, then import. */
export default function CsvImportDialog({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ImportConfig;
}) {
  const [step, setStep] = useState<Step>({ name: "upload" });
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [cells, setCells] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plural, singular] = [config.noun[1], config.noun[0]];

  const rows = useMemo(
    () =>
      cells.map((line) => {
        const row: ImportRow = {};
        for (const field of config.fields) {
          const column = mapping[field.key];
          if (column === undefined || column === SKIP) continue;
          const value = line[Number(column)]?.trim();
          if (value) row[field.key] = value;
        }
        return row;
      }),
    [cells, mapping, config.fields],
  );

  function reset() {
    setStep({ name: "upload" });
    setFileName("");
    setHeaders([]);
    setCells([]);
    setMapping({});
    setError(null);
    setBusy(false);
  }

  async function readFile(file: File) {
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setStep({ name: "upload", error: "Choose a .csv file" });
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      setStep({
        name: "upload",
        error: "The file needs a header row and at least one row of data",
      });
      return;
    }
    if (parsed.length - 1 > MAX_ROWS) {
      setStep({
        name: "upload",
        error: `Import up to ${MAX_ROWS} rows at a time; this file has ${parsed.length - 1}`,
      });
      return;
    }
    const [head, ...body] = parsed;
    setFileName(file.name);
    setHeaders(head.map((header) => header.trim()));
    setCells(body);
    setMapping(guessMapping(head, config.fields));
    setError(null);
    setStep({ name: "map" });
  }

  async function preview() {
    setBusy(true);
    setError(null);
    try {
      setStep({ name: "preview", results: await config.run(rows, true) });
    } catch (caught) {
      setError(readError(caught, "Couldn't check the file").message);
    } finally {
      setBusy(false);
    }
  }

  async function runImport(previewed: ImportResult[]) {
    const ready = previewed
      .filter((result) => result.status === "ready")
      .map((result) => result.row);
    setBusy(true);
    setError(null);
    const final = new Map<number, ImportResult>(
      previewed.map((result) => [result.row, result]),
    );
    try {
      for (let start = 0; start < ready.length; start += CHUNK) {
        const batch = ready.slice(start, start + CHUNK);
        const results = await config.run(
          batch.map((index) => rows[index]),
          false,
        );
        for (const result of results) {
          const row = batch[result.row];
          final.set(row, { ...result, row });
        }
      }
      setStep({
        name: "done",
        results: [...final.values()].sort((a, b) => a.row - b.row),
      });
    } catch (caught) {
      setError(readError(caught, "The import stopped part way").message);
    } finally {
      setBusy(false);
    }
  }

  const missingRequired = config.fields.some(
    (field) => field.required && (mapping[field.key] ?? SKIP) === SKIP,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-160"
        onCloseAutoFocus={reset}
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Import {plural}</DialogTitle>
          <DialogDescription>
            {step.name === "upload"
              ? `Add ${plural} from a CSV file. Every row is checked with the same rules as the New ${singular} form.`
              : step.name === "map"
                ? `${fileName} · ${cells.length} ${cells.length === 1 ? "row" : "rows"}. Match the file's columns to fields.`
                : step.name === "preview"
                  ? "Nothing is saved yet. Rows with problems are skipped."
                  : "Import finished."}
          </DialogDescription>
        </DialogHeader>

        {step.name === "upload" && (
          <UploadStep
            error={step.error}
            onFile={(file) => void readFile(file)}
            onTemplate={() =>
              downloadCsv(`${plural}-template.csv`, [
                config.fields.map((field) => field.label),
                config.example,
              ])
            }
          />
        )}
        {step.name === "map" && (
          <MapStep
            fields={config.fields}
            headers={headers}
            sample={cells[0] ?? []}
            mapping={mapping}
            onChange={(key, value) =>
              setMapping((current) => ({ ...current, [key]: value }))
            }
          />
        )}
        {(step.name === "preview" || step.name === "done") && (
          <ResultsStep
            results={step.results}
            rows={rows}
            describe={config.describe}
            done={step.name === "done"}
          />
        )}

        {error && (
          <p role="alert" className="caption-style text-danger px-6 pb-4">
            {error}
          </p>
        )}

        <DialogFooter>
          {step.name === "map" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto"
                onClick={() => setStep({ name: "upload" })}
              >
                Choose another file
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={busy}
                disabled={missingRequired}
                onClick={() => void preview()}
              >
                Check {cells.length} {cells.length === 1 ? "row" : "rows"}
              </Button>
            </>
          )}
          {step.name === "preview" && (
            <PreviewActions
              results={step.results}
              busy={busy}
              noun={config.noun}
              onBack={() => setStep({ name: "map" })}
              onImport={() => void runImport(step.results)}
            />
          )}
          {(step.name === "upload" || step.name === "done") && (
            <DialogClose asChild>
              <Button
                variant={step.name === "done" ? "primary" : "subtle"}
                size="sm"
              >
                {step.name === "done" ? "Done" : "Cancel"}
              </Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadStep({
  error,
  onFile,
  onTemplate,
}: {
  error?: string;
  onFile: (file: File) => void;
  onTemplate: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border-line-strong bg-card hover:bg-overlay-1 has-focus-visible:ring-ring duration-fast flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-6 py-10 text-center transition-colors has-focus-visible:ring-2",
          dragging && "border-selected bg-overlay-1",
        )}
      >
        <span className="text-sm font-medium">
          Drop a CSV here, or click to choose
        </span>
        <span className="caption-style text-fg-tertiary">
          First row must be column names · up to {MAX_ROWS} rows
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        {error ? (
          <p role="alert" className="caption-style text-danger">
            {error}
          </p>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="xs" onClick={onTemplate}>
          Download template
        </Button>
      </div>
    </div>
  );
}

function MapStep({
  fields,
  headers,
  sample,
  mapping,
  onChange,
}: {
  fields: ImportField[];
  headers: string[];
  sample: string[];
  mapping: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col px-6 py-3">
      <div className="caption-style text-fg-tertiary grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-2 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
        <span>Field</span>
        <span>Column in file</span>
        <span className="max-sm:hidden">First row</span>
      </div>
      {fields.map((field) => {
        const column = mapping[field.key] ?? SKIP;
        const value = column === SKIP ? "" : (sample[Number(column)] ?? "");
        return (
          <div
            key={field.key}
            className="border-border grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 border-t py-2 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <span id={`map-${field.key}`} className="text-sm">
              {field.label}
              {field.required && (
                <span aria-hidden className="text-fg-tertiary">
                  {" "}
                  *
                </span>
              )}
            </span>
            <Select
              value={column}
              onValueChange={(next) => onChange(field.key, next)}
            >
              <SelectTrigger
                aria-labelledby={`map-${field.key}`}
                className={cn(
                  "h-8",
                  field.required && column === SKIP && "border-danger",
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SKIP}>
                  {field.required ? "Choose a column" : "Don't import"}
                </SelectItem>
                {headers.map((header, index) => (
                  <SelectItem key={index} value={String(index)}>
                    {header || `Column ${index + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span
              title={value}
              className="caption-style text-fg-secondary truncate max-sm:hidden"
            >
              {value || <span className="text-fg-disabled">—</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const STATUS: Record<
  ImportResult["status"],
  { label: string; tone: "green" | "neutral" | "amber" | "red" }
> = {
  ready: { label: "Ready", tone: "neutral" },
  created: { label: "Imported", tone: "green" },
  duplicate: { label: "Duplicate", tone: "amber" },
  error: { label: "Error", tone: "red" },
};

type Filter = "all" | "problems";

function ResultsStep({
  results,
  rows,
  describe,
  done,
}: {
  results: ImportResult[];
  rows: ImportRow[];
  describe: (row: ImportRow) => [string, string];
  done: boolean;
}) {
  const counts = { ready: 0, created: 0, duplicate: 0, error: 0 };
  for (const result of results) counts[result.status] += 1;
  const problems = counts.duplicate + counts.error;
  const [filter, setFilter] = useState<Filter>(problems ? "problems" : "all");
  const visible =
    filter === "problems"
      ? results.filter(
          (result) =>
            result.status === "error" || result.status === "duplicate",
        )
      : results;

  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm" aria-live="polite">
          {done ? (
            <>
              <span className="font-medium">{counts.created} imported</span>
              {counts.duplicate > 0 &&
                `, ${counts.duplicate} duplicates skipped`}
              {counts.error > 0 && `, ${counts.error} with errors skipped`}
            </>
          ) : (
            <>
              <span className="font-medium">{counts.ready} ready</span>
              {counts.duplicate > 0 && ` · ${counts.duplicate} duplicates`}
              {counts.error > 0 && ` · ${counts.error} with errors`}
            </>
          )}
        </p>
        {problems > 0 && (
          <div
            role="group"
            aria-label="Show rows"
            className="bg-muted ml-auto flex rounded-full p-0.5"
          >
            {(["problems", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring h-6 rounded-full px-2.5 outline-none focus-visible:ring-2",
                  filter === value &&
                    "bg-raised text-foreground shadow-hairline",
                )}
              >
                {value === "problems"
                  ? `Problems ${problems}`
                  : `All ${results.length}`}
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="border-border divide-border max-h-80 divide-y overflow-y-auto rounded-xl border">
        {visible.map((result) => {
          const [primary, secondary] = describe(rows[result.row] ?? {});
          const status = STATUS[result.status];
          return (
            <li
              key={result.row}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 px-3 py-2.5"
            >
              <span className="caption-style text-fg-tertiary pt-0.5 tabular-nums">
                {result.row + 2}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {primary || <span className="text-fg-tertiary">No name</span>}
                </span>
                {"message" in result ? (
                  <span
                    className={cn(
                      "caption-style leading-snug",
                      result.status === "error"
                        ? "text-danger"
                        : "text-fg-secondary",
                    )}
                  >
                    {result.message}
                  </span>
                ) : (
                  secondary && (
                    <span className="caption-style text-fg-tertiary truncate">
                      {secondary}
                    </span>
                  )
                )}
              </span>
              <Tag tone={status.tone} size="xs">
                {status.label}
              </Tag>
            </li>
          );
        })}
      </ol>
      <p className="caption-style text-fg-tertiary">
        Row numbers match the lines in your file.
      </p>
    </div>
  );
}

function PreviewActions({
  results,
  busy,
  noun,
  onBack,
  onImport,
}: {
  results: ImportResult[];
  busy: boolean;
  noun: [string, string];
  onBack: () => void;
  onImport: () => void;
}) {
  const ready = results.filter((result) => result.status === "ready").length;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mr-auto"
        disabled={busy}
        onClick={onBack}
      >
        Back to columns
      </Button>
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        disabled={ready === 0}
        onClick={onImport}
      >
        Import {ready} {ready === 1 ? noun[0] : noun[1]}
      </Button>
    </>
  );
}
