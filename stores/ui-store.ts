import { create } from "zustand";

export type RecordType = "account" | "person";

export type Peek = { type: RecordType; id: string } | null;

export type CreateDialog =
  | { type: "account" }
  | { type: "person"; accountId?: string }
  | null;

type UiState = {
  sidebarOpen: boolean;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  peek: Peek;
  create: CreateDialog;
  setSidebarOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setPeek: (peek: Peek) => void;
  setCreate: (create: CreateDialog) => void;
};

/** Client-only UI state. Server data never lives here; read it with Convex hooks. */
export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  commandOpen: false,
  shortcutsOpen: false,
  peek: null,
  create: null,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setPeek: (peek) => set({ peek }),
  setCreate: (create) => set({ create }),
}));
