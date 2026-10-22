"use client";

import { useSyncExternalStore } from "react";

type InstallEvent = Event & { prompt: () => Promise<void> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

function set(next: InstallEvent | null) {
  deferred = next;
  listeners.forEach((listener) => listener());
}

// The browser fires this once at page load, long before the settings page mounts.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    set(event as InstallEvent);
  });
  window.addEventListener("appinstalled", () => set(null));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useInstallPrompt() {
  const event = useSyncExternalStore(
    subscribe,
    () => deferred,
    () => null,
  );

  async function install() {
    if (!event) return;
    set(null);
    await event.prompt();
  }

  return { canInstall: event !== null, install };
}
