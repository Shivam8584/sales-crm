import Tag, { type TagTone } from "@/components/_ui/tag";
import {
  PROPOSAL_STATUS_LABEL,
  type ProposalStatus,
} from "@/lib/domain/pricing";

const TONE: Record<ProposalStatus, TagTone> = {
  draft: "neutral",
  sent: "blue",
  accepted: "green",
  rejected: "red",
};

export function ProposalStatusTag({
  status,
  size = "xs",
}: {
  status: ProposalStatus;
  size?: "xs" | "sm" | "md";
}) {
  return (
    <Tag tone={TONE[status]} size={size}>
      {PROPOSAL_STATUS_LABEL[status]}
    </Tag>
  );
}
