import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Run = NonNullable<
  FunctionReturnType<typeof api.enrichment.forAccount>
>["runs"][number];

/** The latest lookup while it runs, or its error if it failed. */
export function RunNotice({
  run,
  runningLabel,
  className,
}: {
  run: Run | undefined;
  runningLabel: string;
  className?: string;
}) {
  if (!run || run.status === "succeeded") return null;
  if (run.status === "running") {
    return (
      <p
        role="status"
        className={cn(
          "caption-style text-fg-secondary flex items-center gap-2",
          className,
        )}
      >
        <span
          aria-hidden
          className="size-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]"
        />
        {runningLabel}
      </p>
    );
  }
  return (
    <p
      role="status"
      className={cn(
        "caption-style flex flex-wrap items-baseline gap-x-1.5 gap-y-1 leading-snug",
        className,
      )}
    >
      <span className="text-danger">{run.error ?? "The lookup failed"}</span>
      <span className="text-fg-tertiary">
        {[run.requestedBy, relativeTime(run.finishedAt ?? run.startedAt)]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </p>
  );
}
