import ToneDot from "./tone-dot";
import type { BoardColumnDef } from "./board";

export default function ColumnBadge({
  column,
  className,
}: {
  column: BoardColumnDef;
  className?: string;
}) {
  return <ToneDot tone={column.tone} className={className} />;
}
