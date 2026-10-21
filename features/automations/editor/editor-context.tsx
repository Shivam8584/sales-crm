"use client";

import { createContext, useContext } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type {
  AutomationSettings,
  NameLookup,
  SubjectKind,
  Trigger,
} from "@/lib/domain/automations";

export type AutomationDoc = NonNullable<
  FunctionReturnType<typeof api.automations.get>
>;
export type Catalog = FunctionReturnType<typeof api.automations.catalog>;
export type NodeStats = FunctionReturnType<typeof api.automations.nodeStats>;

export type EditorContextValue = {
  automation: AutomationDoc;
  catalog: Catalog | undefined;
  names: NameLookup;
  readOnly: boolean;
  nodeStats: NodeStats | undefined;
  setTrigger: (trigger: Trigger) => void;
  setSettings: (settings: AutomationSettings) => void;
  setSubjectKind: (kind: SubjectKind) => void;
  startTestRun: () => void;
};

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor outside the automation editor");
  return value;
}
