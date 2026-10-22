export const PLAYBOOK_KINDS = [
  "objection",
  "battlecard",
  "case_study",
  "demo",
] as const;
export type PlaybookKind = (typeof PLAYBOOK_KINDS)[number];

export const PLAYBOOK_KIND_LABEL: Record<PlaybookKind, string> = {
  objection: "Objection",
  battlecard: "Battlecard",
  case_study: "Case study",
  demo: "Demo",
};

export const PLAYBOOK_LIMITS = {
  titleMin: 3,
  titleMax: 120,
  bodyMax: 4000,
  tags: 6,
  tagMax: 30,
} as const;
