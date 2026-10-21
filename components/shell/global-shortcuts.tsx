"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isEditableTarget } from "@/lib/keyboard";
import { useUiStore } from "@/stores/ui-store";
import { ALL_NAV_ITEMS } from "./navigation";

const SEQUENCE_TIMEOUT = 900;
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";

/** App-wide keys: ⌘K search, `?` help, `C` create, and `G` then a letter to navigate. */
export default function GlobalShortcuts({
  onCreate,
}: {
  onCreate: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    let pendingG = 0;

    function onKeyDown(event: KeyboardEvent) {
      const ui = useUiStore.getState();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ui.setCommandOpen(!ui.commandOpen);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY))
        return;

      const key = event.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < SEQUENCE_TIMEOUT) {
        pendingG = 0;
        const item = ALL_NAV_ITEMS.find(
          (nav) => nav.shortcut.toLowerCase() === key,
        );
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
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, onCreate]);

  return null;
}
