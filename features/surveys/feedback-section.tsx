"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DetailSection } from "@/components/record/detail";
import { scoreBucket } from "@/lib/domain/surveys";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const TONE = {
  promoter: "text-success",
  passive: "text-foreground",
  detractor: "text-danger",
} as const;

/** Latest NPS answer with its comment, and the few before it; absent until someone answers. */
export default function FeedbackSection({
  target,
  className,
}: {
  target: { accountId: Id<"accounts"> } | { personId: Id<"people"> };
  className?: string;
}) {
  const answers = useQuery(api.surveys.forRecord, target);
  if (!answers?.length) return null;
  const [latest, ...earlier] = answers;

  return (
    <DetailSection title="Feedback" className={className}>
      <div className="-mt-2 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-lg leading-6 font-semibold tabular-nums",
                TONE[scoreBucket(latest.score)],
              )}
            >
              {latest.score}
            </span>
            <span className="caption-style text-fg-tertiary">
              NPS · {shortDate(latest.at)}
            </span>
          </span>
          {latest.comment && (
            <p className="text-fg-secondary text-sm break-words whitespace-pre-line">
              {latest.comment}
            </p>
          )}
        </div>
        {earlier.length > 0 && (
          <ul className="caption-style text-fg-tertiary flex flex-col gap-1 tabular-nums">
            {earlier.map((answer) => (
              <li key={answer.id} className="flex justify-between gap-2">
                <span>{shortDate(answer.at)}</span>
                <span className={TONE[scoreBucket(answer.score)]}>
                  {answer.score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DetailSection>
  );
}
