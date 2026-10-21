"use client";

import { useEffect } from "react";
import { isEditableTarget } from "@/lib/keyboard";

const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";

/** Opens the inline editor of the `[data-record-title]` element on the page. */
export function editRecordTitle() {
  document
    .querySelector<HTMLButtonElement>("[data-record-title] button")
    ?.click();
}

/** `E` edits the record title, like in Linear. */
export function useTitleShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "e") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY))
        return;
      event.preventDefault();
      editRecordTitle();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
