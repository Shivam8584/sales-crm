import type { ComponentType, SVGProps } from "react";
import Tag, { type TagTone } from "@/components/_ui/tag";
import type { BadgeTone } from "@/components/_common/status-badge";
import ToneDot from "@/components/board/tone-dot";
import type { Option } from "@/components/fields/option-picker";
import { DEAL_STAGES, type DealStage } from "@/lib/domain/enums";
import { DEAL_STAGE_LABEL } from "@/lib/domain/labels";
import ClipboardCheckIcon from "@/public/assets/icons/kanban/clipboard-check.svg";
import ContrastIcon from "@/public/assets/icons/kanban/contrast-02.svg";
import LoadingIcon from "@/public/assets/icons/kanban/loading-02.svg";
import XCloseIcon from "@/public/assets/icons/kanban/x-close.svg";
import MonitorIcon from "@/public/assets/icons/monitor.svg";
import NoteIcon from "@/public/assets/icons/note.svg";

export const DEAL_STAGE_TONE: Record<DealStage, TagTone> = {
  discovery: "blue",
  demo: "purple",
  proposal: "amber",
  onboarding: "teal",
  won: "green",
  lost: "neutral",
};

type StageBadge = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: BadgeTone;
  text: string;
};

/** Kanban-style column badge and card icon for each stage. */
export const DEAL_STAGE_BADGE: Record<DealStage, StageBadge> = {
  discovery: { icon: LoadingIcon, tone: "neutral", text: "text-fg-tertiary" },
  demo: { icon: MonitorIcon, tone: "info", text: "text-info" },
  proposal: { icon: NoteIcon, tone: "warning", text: "text-warning" },
  onboarding: { icon: ContrastIcon, tone: "info", text: "text-info" },
  won: { icon: ClipboardCheckIcon, tone: "success", text: "text-success" },
  lost: { icon: XCloseIcon, tone: "neutral", text: "text-fg-tertiary" },
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
