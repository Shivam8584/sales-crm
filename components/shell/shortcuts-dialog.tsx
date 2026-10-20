"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Kbd from "@/components/_ui/kbd";
import { MOD_KEY } from "@/lib/keyboard";
import { useUiStore } from "@/stores/ui-store";

const GROUPS = [
  {
    title: "General",
    items: [
      { keys: [MOD_KEY, "K"], label: "Search and commands" },
      { keys: ["G", "A"], label: "Go to accounts" },
      { keys: ["G", "P"], label: "Go to people" },
      { keys: ["C"], label: "Create a record" },
      { keys: ["?"], label: "Show shortcuts" },
    ],
  },
  {
    title: "Lists",
    items: [
      { keys: ["J", "K"], label: "Move down and up" },
      { keys: ["↵"], label: "Open record" },
      { keys: ["Space"], label: "Peek at record" },
      { keys: ["X"], label: "Select row" },
      { keys: ["/"], label: "Search the list" },
      { keys: ["Esc"], label: "Clear selection" },
    ],
  },
];

export default function ShortcutsDialog() {
  const open = useUiStore((state) => state.shortcutsOpen);
  const setOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Work through the pipeline without the mouse.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 px-6 py-5">
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <h3 className="eyebrow-style text-fg-tertiary">{group.title}</h3>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <li
                    key={`${item.label}-${item.keys.join("")}`}
                    className="flex h-8 items-center justify-between gap-4"
                  >
                    <span className="lead-style text-fg-secondary">
                      {item.label}
                    </span>
                    <span className="flex items-center gap-1">
                      {item.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
