"use client";

import Button from "@/components/_ui/button";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { toast } from "@/stores/toast-store";

/** Downloads one report table as CSV; rows are built on click, from what's on screen. */
export default function ExportButton({
  filename,
  label,
  rows,
  disabled,
}: {
  filename: string;
  /** What's exported, for the accessible name, e.g. "funnel". */
  label: string;
  rows: () => CsvCell[][];
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      disabled={disabled}
      aria-label={`Export ${label} as CSV`}
      onClick={() => {
        downloadCsv(filename, rows());
        toast(`Exported ${label}`);
      }}
    >
      Export CSV
    </Button>
  );
}
