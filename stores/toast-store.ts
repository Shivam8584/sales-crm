import { create } from "zustand";

export type ToastTone = "success" | "info" | "warning" | "danger";

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  undo?: () => void;
};

type ToastOptions = { undo?: () => void; tone?: ToastTone };

export type UndoEntry = {
  id: number;
  message: string;
  undo: () => void;
  at: number;
};

type ToastState = {
  toasts: Toast[];
  history: UndoEntry[];
  show: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
  forget: (id: number) => void;
};

const MAX_TOASTS = 3;
const MAX_HISTORY = 10;
const HISTORY_TTL = 10 * 60 * 1000;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  history: [],
  show: (message, { undo, tone = "success" } = {}) => {
    const id = nextId++;
    let wrapped: (() => void) | undefined;
    if (undo) {
      let done = false;
      wrapped = () => {
        get().forget(id);
        if (done) return;
        done = true;
        undo();
      };
      setTimeout(() => get().forget(id), HISTORY_TTL);
    }
    set((state) => ({
      toasts: [...state.toasts, { id, message, tone, undo: wrapped }].slice(
        -MAX_TOASTS,
      ),
      history: wrapped
        ? [
            { id, message, undo: wrapped, at: Date.now() },
            ...state.history,
          ].slice(0, MAX_HISTORY)
        : state.history,
    }));
  },
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  forget: (id) =>
    set((state) =>
      state.history.some((entry) => entry.id === id)
        ? { history: state.history.filter((entry) => entry.id !== id) }
        : state,
    ),
}));

export const selectUndoHistory = (state: ToastState) => state.history;

export function undoEntry(entry: UndoEntry) {
  const { dismiss, show } = useToastStore.getState();
  dismiss(entry.id);
  entry.undo();
  show(`Undid: ${entry.message}`);
}

/** Undoes the most recent undoable action; false when there is none. */
export function undoLast() {
  const [entry] = useToastStore.getState().history;
  if (!entry) return false;
  undoEntry(entry);
  return true;
}

/** `toast(message, undo)` or `toast(message, { undo, tone })`. */
export const toast = (message: string, options?: (() => void) | ToastOptions) =>
  useToastStore
    .getState()
    .show(message, typeof options === "function" ? { undo: options } : options);
