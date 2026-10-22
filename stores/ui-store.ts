import { create } from "zustand";

export type RecordType = "account" | "person" | "lead" | "deal";

export type Peek = { type: RecordType; id: string } | null;

export type CreateDialog =
  | { type: "account" }
  | { type: "person"; accountId?: string }
  | { type: "lead" }
  | { type: "deal"; accountId?: string; stage?: string }
  | {
      type: "task";
      accountId?: string;
      personId?: string;
      dealId?: string;
      leadId?: string;
      status?: string;
    }
  | null;

/** Edit dialogs for records that have no page of their own. */
export type EditDialog = { type: "deal" | "task"; id: string } | null;

type UiState = {
  commandOpen: boolean;
  shortcutsOpen: boolean;
  peek: Peek;
  create: CreateDialog;
  edit: EditDialog;
  setCommandOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setPeek: (peek: Peek) => void;
  setCreate: (create: CreateDialog) => void;
  setEdit: (edit: EditDialog) => void;
};

/** Client-only UI state. Server data never lives here; read it with Convex hooks. */
export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  shortcutsOpen: false,
  peek: null,
  create: null,
  edit: null,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setPeek: (peek) => set({ peek }),
  setCreate: (create) => set({ create }),
  setEdit: (edit) => set({ edit }),
}));
