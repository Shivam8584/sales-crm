"use client";

import { useSyncExternalStore } from "react";

export type Density = "comfortable" | "compact";

const STORAGE_KEY = "crm:table-density";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function read(): Density {
  try {
    return localStorage.getItem(STORAGE_KEY) === "compact"
      ? "compact"
      : "comfortable";
  } catch {
    return "comfortable";
  }
}

/** Row density shared by every table, remembered on this device. */
export function useTableDensity() {
  return useSyncExternalStore(subscribe, read, () => "comfortable" as const);
}

export function setTableDensity(density: Density) {
  try {
    localStorage.setItem(STORAGE_KEY, density);
  } catch {}
  listeners.forEach((listener) => listener());
}
