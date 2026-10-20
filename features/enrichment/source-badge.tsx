import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { dateTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { isSandboxSource, sourceLabel } from "./labels";

/** Where a fact came from and when it was observed, e.g. "GST registry · 12 Oct". */
export function SourceBadge({
  source,
  observedAt,
  note,
  className,
}: {
  source: string;
  observedAt: number;
  note?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      <Tooltip
        content={[`Observed ${dateTime(observedAt)}`, note]
          .filter(Boolean)
          .join(" · ")}
      >
        <Tag
          tone="neutral"
          size="xs"
          tabIndex={0}
          className="focus-visible:ring-ring outline-none focus-visible:ring-2"
        >
          <time dateTime={new Date(observedAt).toISOString()}>
            {sourceLabel(source)} · {shortDate(observedAt)}
          </time>
        </Tag>
      </Tooltip>
      {isSandboxSource(source) && <SandboxBadge />}
    </span>
  );
}

export function SandboxBadge() {
  return (
    <Tooltip content="Test data from the enrichment sandbox, not a real registry">
      <Tag
        tone="amber"
        size="xs"
        tabIndex={0}
        className="focus-visible:ring-ring outline-none focus-visible:ring-2"
      >
        Sandbox
      </Tag>
    </Tooltip>
  );
}
