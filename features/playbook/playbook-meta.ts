import type { TagTone } from "@/components/_ui/tag";
import type { PlaybookKind } from "@/lib/domain/playbook";

export const KIND_TONE: Record<PlaybookKind, TagTone> = {
  objection: "orange",
  battlecard: "blue",
  case_study: "green",
  demo: "purple",
};
