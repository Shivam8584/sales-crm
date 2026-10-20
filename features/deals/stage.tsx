import Tag, { type TagTone } from "@/components/_ui/tag";
import ToneDot from "@/components/board/tone-dot";
import type { Option } from "@/components/fields/option-picker";
import { DEAL_STAGES, type DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";

export const DEAL_STAGE_TONE: Record<DealStage, TagTone> = {
  discovery: "blue",
  demo: "purple",
  proposal: "amber",
  onboarding: "teal",
  won: "green",
  lost: "neutral",
};

export const OPEN_STAGES = DEAL_STAGES.filter(
  (stage) => stage !== "won" && stage !== "lost",
);

export const isOpenStage = (stage: DealStage) =>
  stage !== "won" && stage !== "lost";

export const DEAL_STAGE_OPTIONS: Option[] = DEAL_STAGES.map((stage) => ({
  value: stage,
  label: DEAL_STAGE_LABEL[stage],
  icon: <ToneDot tone={DEAL_STAGE_TONE[stage]} />,
}));

export function DealStageTag({ stage }: { stage: DealStage }) {
  return (
    <Tag tone={DEAL_STAGE_TONE[stage]} size="sm">
      {DEAL_STAGE_LABEL[stage]}
    </Tag>
  );
}
