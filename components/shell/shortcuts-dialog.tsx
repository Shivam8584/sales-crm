"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Kbd from "@/components/_ui/kbd";
import { useViewer } from "@/hooks/use-viewer";
import type { Role } from "@/lib/domain/enums";
import { MOD_KEY } from "@/lib/keyboard";
import { useUiStore } from "@/stores/ui-store";
import { navItems } from "./navigation";

const groups = (role: Role) => [
  {
    title: "General",
    items: [
      { keys: [MOD_KEY, "K"], label: "Search and commands" },
      ...navItems(role).map((item) => ({
        keys: ["G", item.shortcut],
        label: `Go to ${item.label.toLowerCase()}`,
      })),
      { keys: ["C"], label: "Create a record" },
      { keys: ["["], label: "Collapse or expand the sidebar" },
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
  {
    title: "Inbox",
    items: [
      { keys: ["E"], label: "Archive, or move back to the inbox" },
      { keys: ["U"], label: "Mark read or unread" },
    ],
  },
  {
    title: "Boards",
    items: [
      { keys: ["Click"], label: "Peek at card" },
      { keys: [MOD_KEY, "Click"], label: "Open card page" },
      { keys: ["↵"], label: "Open card page" },
      { keys: ["Space"], label: "Pick up and drop a card" },
    ],
  },
];

export default function ShortcutsDialog() {
  const open = useUiStore((state) => state.shortcutsOpen);
  const setOpen = useUiStore((state) => state.setShortcutsOpen);
  const { role } = useViewer();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Work through the pipeline without the mouse.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-10 gap-y-5 px-6 py-5 sm:grid-cols-2 sm:[&>section:first-child]:row-span-3">
          {groups(role).map((group) => (
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
