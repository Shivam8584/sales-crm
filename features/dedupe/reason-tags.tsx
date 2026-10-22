import Tag, { type TagTone } from "@/components/_ui/tag";
import type { Reason, Strength } from "@/lib/domain/dedupe";

const TONE: Record<Strength, TagTone> = {
  certain: "orange",
  strong: "amber",
  medium: "neutral",
};

export function ReasonTags({ reasons }: { reasons: Reason[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <Tag key={reason.code} size="xs" tone={TONE[reason.strength]}>
          {reason.label}
        </Tag>
      ))}
    </span>
  );
}
