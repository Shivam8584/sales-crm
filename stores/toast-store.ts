import { create } from "zustand";

export type ToastTone = "success" | "info" | "warning" | "danger";

export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  undo?: () => void;
};

type ToastOptions = { undo?: () => void; tone?: ToastTone };

type ToastState = {
  toasts: Toast[];
  show: (message: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
};

const MAX_TOASTS = 3;
let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, { undo, tone = "success" } = {}) =>
    set((state) => ({
      toasts: [...state.toasts, { id: nextId++, message, tone, undo }].slice(
        -MAX_TOASTS,
      ),
    })),
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

/** `toast(message, undo)` or `toast(message, { undo, tone })`. */
export const toast = (message: string, options?: (() => void) | ToastOptions) =>
  useToastStore
    .getState()
    .show(message, typeof options === "function" ? { undo: options } : options);
