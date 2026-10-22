import Tag from "@/components/_ui/tag";
import type { Reason } from "@/lib/domain/dedupe";

export function ReasonTags({ reasons }: { reasons: Reason[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <Tag key={reason.code} size="xs" tone="neutral">
          {reason.label}
        </Tag>
      ))}
    </span>
  );
}
