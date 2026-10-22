import type { Id } from "../_generated/dataModel";

export type Brief = {
  summary: string;
  nextStep: string;
  risks: string[];
  at: number;
};

export type NextAction = { text: string; at: number };

type Subject = {
  accountId: Id<"accounts"> | null;
  personId: Id<"people"> | null;
  dealId: Id<"deals"> | null;
  /** Display name of the matched account or person, for the confirm step. */
  subjectName: string | null;
};

/** What `parseCapture` understood from one line of text; nothing is written until the member confirms. */
export type CaptureItem = Subject &
  (
    | { kind: "task"; title: string; dueDate: string | null }
    | { kind: "note"; body: string }
    | { kind: "call"; summary: string }
  );

export type Capture = { items: CaptureItem[]; unresolved: string | null };

export type Draft = { subject: string | null; body: string };

export type CallSummary = {
  summary: string;
  actionItems: { title: string; dueDate: string | null }[];
};
