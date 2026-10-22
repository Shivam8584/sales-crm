import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { dateTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { bandLabel, isSandboxSource, sourceLabel, sourceNote } from "./labels";

/** Where a fact came from and when it was observed, e.g. "GST registry · 12 Oct". */
export function SourceBadge({
  source,
  observedAt,
  confidence = null,
  note,
  className,
}: {
  source: string;
  observedAt: number;
  confidence?: number | null;
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
      {confidence !== null && (
        <span className="caption-style text-fg-tertiary">
          {bandLabel(confidence)}
        </span>
      )}
      {isSandboxSource(source) && <SandboxBadge />}
    </span>
  );
}

/** Where a value came from and how far to trust it, as quiet text. */
export function SourceNote({
  source,
  confidence,
  url,
  className,
}: {
  source: string;
  confidence: number | null;
  url?: string | null;
  className?: string;
}) {
  const text = sourceNote(source, confidence);
  return (
    <span
      className={cn(
        "caption-style text-fg-tertiary flex flex-wrap items-center gap-1.5 leading-snug",
        className,
      )}
    >
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground focus-visible:ring-ring rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2"
        >
          {text}
        </a>
      ) : (
        text
      )}
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
