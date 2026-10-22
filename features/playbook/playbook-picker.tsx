"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import { copyText } from "@/features/team/invite-link";
import { toast } from "@/stores/toast-store";
import PlaybookBrowser from "./playbook-browser";

/** The playbook inside a record: click an entry to copy it into a message. */
export default function PlaybookPicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(36rem,85dvh)] max-w-xl">
        <DialogHeader>
          <DialogTitle>Playbook</DialogTitle>
          <DialogDescription>Click an entry to copy it.</DialogDescription>
        </DialogHeader>
        <PlaybookBrowser
          onSelect={async (entry) => {
            const copied = await copyText(entry.body);
            if (copied) onOpenChange(false);
            toast(
              copied
                ? `Copied "${entry.title}"`
                : "Couldn't copy. Open the playbook page instead.",
              { tone: copied ? "success" : "danger" },
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
