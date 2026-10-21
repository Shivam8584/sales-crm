import StatusBadge from "@/components/_common/status-badge";
import ToneDot from "./tone-dot";
import type { BoardColumnDef } from "./board";

export default function ColumnBadge({
  column,
  className,
}: {
  column: BoardColumnDef;
  className?: string;
}) {
  return column.icon ? (
    <StatusBadge icon={column.icon} tone={column.tone} className={className} />
  ) : (
    <ToneDot tone={column.tone} className={className} />
  );
}
