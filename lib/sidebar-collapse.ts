"use client";

import { useSyncExternalStore } from "react";
import {
  SIDEBAR_COLLAPSED_ATTR,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from "./sidebar";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readCollapsed() {
  return document.documentElement.hasAttribute(SIDEBAR_COLLAPSED_ATTR);
}

/** The desktop sidebar's collapsed state lives on `<html>` so CSS applies it before hydration. */
export function useSidebarCollapsed() {
  return useSyncExternalStore(subscribe, readCollapsed, () => false);
}

function setSidebarCollapsed(collapsed: boolean) {
  document.documentElement.toggleAttribute(SIDEBAR_COLLAPSED_ATTR, collapsed);
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {}
  listeners.forEach((listener) => listener());
}

export function toggleSidebarCollapsed() {
  setSidebarCollapsed(!readCollapsed());
}
