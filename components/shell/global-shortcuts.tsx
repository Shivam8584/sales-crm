"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/hooks/use-viewer";
import { isEditableTarget } from "@/lib/keyboard";
import { toggleSidebarCollapsed } from "@/lib/sidebar-collapse";
import { undoLast, useToastStore } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import { navItems } from "./navigation";

const SEQUENCE_TIMEOUT = 900;
const DESKTOP_WIDTH = 1024;
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";
const CANVAS = '[aria-roledescription="workflow canvas"]';

/** App-wide keys: ⌘K search, ⌘Z undo, `?` help, `C` create, `[` sidebar, and `G` then a letter to navigate. */
export default function GlobalShortcuts({
  onCreate,
}: {
  onCreate: () => void;
}) {
  const router = useRouter();
  const { role } = useViewer();

  useEffect(() => {
    const items = navItems(role);
    let pendingG = 0;

    function onKeyDown(event: KeyboardEvent) {
      const ui = useUiStore.getState();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ui.setCommandOpen(!ui.commandOpen);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "z"
      ) {
        // The toaster undoes visible toasts itself, and the canvas has its own history.
        if (
          event.defaultPrevented ||
          isEditableTarget(event.target) ||
          document.querySelector(`${OVERLAY}, ${CANVAS}`) ||
          useToastStore.getState().toasts.some((toast) => toast.undo)
        )
          return;
        if (undoLast()) event.preventDefault();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY))
        return;

      const key = event.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < SEQUENCE_TIMEOUT) {
        pendingG = 0;
        const item = items.find((nav) => nav.shortcut.toLowerCase() === key);
        if (item) {
          event.preventDefault();
          router.push(item.href);
        }
        return;
      }
      if (key === "g") {
        pendingG = Date.now();
      } else if (event.key === "?") {
        event.preventDefault();
        ui.setShortcutsOpen(true);
      } else if (key === "c") {
        event.preventDefault();
        onCreate();
      } else if (event.key === "[" && window.innerWidth >= DESKTOP_WIDTH) {
        event.preventDefault();
        toggleSidebarCollapsed();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, onCreate, role]);

  return null;
}
