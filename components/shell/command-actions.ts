"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type SVGProps,
} from "react";

export type CommandAction = {
  id: string;
  label: string;
  perform: () => void;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Single key shown next to the action, e.g. "E". */
  shortcut?: string;
  /** Extra words that should match a search, e.g. "phone dial". */
  keywords?: string;
};

const entries = new Map<number, CommandAction[]>();
const listeners = new Set<() => void>();
let snapshot: CommandAction[] = [];
let nextKey = 0;

function emit() {
  snapshot = [...entries.values()].flat();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: CommandAction[] = [];

/** Adds contextual actions to the ⌘K menu for as long as the calling component is mounted. */
export function useCommandActions(actions: CommandAction[]) {
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });
  const signature = actions
    .map((action) =>
      [action.id, action.label, action.shortcut, action.keywords].join(
        "\u0000",
      ),
    )
    .join("\u0001");

  useEffect(() => {
    const key = nextKey++;
    entries.set(
      key,
      latest.current.map((action) => ({
        ...action,
        perform: () =>
          latest.current.find((item) => item.id === action.id)?.perform(),
      })),
    );
    emit();
    return () => {
      entries.delete(key);
      emit();
    };
  }, [signature]);
}

/** Every action currently registered with `useCommandActions`. */
export function useRegisteredCommandActions() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
