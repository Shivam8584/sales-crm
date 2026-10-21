"use client";

import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import { DISQUALIFY_REASONS, type DisqualifyReason } from "@/lib/domain/enums";
import { DISQUALIFY_REASON_LABEL } from "@/lib/domain/labels";

/** Pick why a lead is disqualified; picking a reason applies it at once. */
export default function DisqualifyDialog({
  lead,
  onPick,
  onClose,
}: {
  lead: { name: string } | null;
  onPick: (reason: DisqualifyReason) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={lead !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-96">
        <DialogHeader>
          <DialogTitle>Disqualify {lead?.name}</DialogTitle>
          <DialogDescription>
            The reason shows up in reports on lost leads.
          </DialogDescription>
        </DialogHeader>
        <div
          role="group"
          aria-label="Reason"
          className="flex flex-wrap gap-1.5 px-6 py-5"
        >
          {DISQUALIFY_REASONS.map((reason) => (
            <Button
              key={reason}
              variant="secondary"
              size="sm"
              onClick={() => {
                onPick(reason);
                onClose();
              }}
              className="rounded-full"
            >
              {DISQUALIFY_REASON_LABEL[reason]}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="subtle" size="sm">
              Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
