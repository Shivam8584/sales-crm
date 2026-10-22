import { cn } from "@/lib/utils";

function pretty(evidence: string) {
  try {
    return JSON.stringify(JSON.parse(evidence), null, 2);
  } catch {
    return evidence;
  }
}

/** Collapsed text behind a fact or a lookup, such as the registry response. */
export function Evidence({
  evidence,
  label = "Evidence",
  className,
}: {
  evidence: string;
  label?: string;
  className?: string;
}) {
  return (
    <details className={cn("group flex flex-col", className)}>
      <summary className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring flex h-6 w-fit cursor-pointer list-none items-center gap-1 rounded-sm outline-none select-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className="duration-fast size-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        >
          <path
            d="M4.5 3 7.5 6l-3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {label}
      </summary>
      <pre
        tabIndex={0}
        aria-label={label}
        className="bg-muted text-fg-secondary shadow-hairline focus-visible:ring-ring mt-1.5 max-h-72 overflow-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed whitespace-pre outline-none focus-visible:ring-2"
      >
        {pretty(evidence)}
      </pre>
    </details>
  );
}
