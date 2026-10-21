import Tag, { type TagTone } from "@/components/_ui/tag";
import ToneDot from "@/components/board/tone-dot";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/domain/enums";
import { STAGE_LABEL } from "@/lib/domain/labels";
import type { Option } from "@/components/fields/option-picker";

const STAGE_TONE: Record<LifecycleStage, TagTone> = {
  prospect: "neutral",
  lead: "blue",
  qualified: "blue",
  demo: "purple",
  signed_up: "teal",
  org_created: "teal",
  gst_verified: "teal",
  funded: "amber",
  live: "green",
  activated: "green",
  expanding: "moss",
  at_risk: "red",
  dormant: "neutral",
  disqualified: "neutral",
};

export const STAGE_OPTIONS: Option[] = LIFECYCLE_STAGES.map((stage) => ({
  value: stage,
  label: STAGE_LABEL[stage],
  icon: <ToneDot tone={STAGE_TONE[stage]} />,
}));

export function StageTag({ stage }: { stage: LifecycleStage }) {
  return (
    <Tag tone={STAGE_TONE[stage]} size="sm">
      {STAGE_LABEL[stage]}
    </Tag>
  );
}
