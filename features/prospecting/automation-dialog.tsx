"use client";

import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import {
  RecordAutomations,
  type AutomationTarget,
} from "@/features/automations/record-automations";

export type AutomationDraft = {
  brand: string;
  target: AutomationTarget | null;
  /** What the target is, for the description: "lead" or the account name. */
  label: string | null;
  onCreateLead: () => void;
};

/** Enrols a prospect's lead (or its account) in an automation. */
export default function AutomationDialog({
  draft,
  onClose,
}: {
  draft: AutomationDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-120">
        {draft && (
          <>
            <DialogHeader>
              <DialogTitle>Automations for {draft.brand}</DialogTitle>
              <DialogDescription>
                {draft.target
                  ? `Runs on ${draft.label}. Enrol it in an active automation, or remove it from one.`
                  : "Automations run on CRM records. Create a lead for this brand first, then enrol it."}
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 py-5">
              {draft.target ? (
                <RecordAutomations target={draft.target} />
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    draft.onCreateLead();
                  }}
                >
                  Create lead
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
