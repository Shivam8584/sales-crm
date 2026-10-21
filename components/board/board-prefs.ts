"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

type StoredPrefs = { hidden: string[]; panel: boolean };

const EMPTY: StoredPrefs = { hidden: [], panel: false };
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: StoredPrefs }>();

const storageKey = (boardId: string) => `board:${boardId}`;

function read(boardId: string): StoredPrefs {
  const key = storageKey(boardId);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return EMPTY;
  }
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value;
  let value = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredPrefs>) : null;
    if (parsed) {
      value = {
        hidden: Array.isArray(parsed.hidden)
          ? parsed.hidden.filter((id) => typeof id === "string")
          : [],
        panel: parsed.panel === true,
      };
    }
  } catch {
    value = EMPTY;
  }
  cache.set(key, { raw, value });
  return value;
}

function write(boardId: string, next: StoredPrefs) {
  try {
    localStorage.setItem(storageKey(boardId), JSON.stringify(next));
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("board:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export type BoardPrefs = {
  hidden: ReadonlySet<string>;
  setHidden: (columnId: string, hidden: boolean) => void;
  showAll: () => void;
  /** Hidden columns panel beside the board (desktop). */
  panelOpen: boolean;
  /** Hidden columns sheet (below `lg`). */
  sheetOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  setSheetOpen: (open: boolean) => void;
};

/** Hidden columns and the hidden-columns panel for one board, kept in localStorage. */
export function useBoardPrefs(boardId: string): BoardPrefs {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(boardId),
    () => EMPTY,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  const setHidden = useCallback(
    (columnId: string, hide: boolean) => {
      const current = read(boardId);
      const rest = current.hidden.filter((id) => id !== columnId);
      write(boardId, {
        ...current,
        hidden: hide ? [...rest, columnId] : rest,
      });
    },
    [boardId],
  );
  const showAll = useCallback(
    () => write(boardId, { ...read(boardId), hidden: [] }),
    [boardId],
  );
  const setPanelOpen = useCallback(
    (open: boolean) => write(boardId, { ...read(boardId), panel: open }),
    [boardId],
  );
  const hidden = useMemo(() => new Set(stored.hidden), [stored.hidden]);

  return {
    hidden,
    setHidden,
    showAll,
    panelOpen: stored.panel,
    sheetOpen,
    setPanelOpen,
    setSheetOpen,
  };
}
