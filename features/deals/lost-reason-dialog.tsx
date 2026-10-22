"use client";

import { useState, type FormEvent } from "react";
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
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { cn } from "@/lib/utils";

const LOST_REASONS = [
  "Budget",
  "Timing",
  "Chose an agency",
  "Chose another platform",
  "Marketplace policy concern",
  "No response",
];

/** Quick-pick chips for common reasons; picking one fills the field. */
export function LostReasonChips({
  value,
  onPick,
}: {
  value: string;
  onPick: (reason: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Common reasons">
      {LOST_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          aria-pressed={value === reason}
          onClick={() => onPick(reason)}
          className={cn(
            "caption-style border-line-strong text-fg-secondary hover:bg-overlay-1 hover:text-foreground focus-visible:ring-ring duration-fast h-6 rounded-full border px-2.5 transition-colors outline-none focus-visible:ring-2",
            value === reason &&
              "bg-overlay-2 text-foreground border-transparent",
          )}
        >
          {reason}
        </button>
      ))}
    </div>
  );
}

/** Asks why a deal was lost before it moves to Lost; dismissing cancels the move. */
export default function LostReasonDialog({
  dealTitle,
  onConfirm,
  onCancel,
}: {
  dealTitle: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Say why the deal was lost");
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Dialog
      open={dealTitle !== null}
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent
        className="max-w-100"
        onCloseAutoFocus={() => {
          setReason("");
          setError(undefined);
        }}
      >
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Mark as lost</DialogTitle>
            <DialogDescription className="truncate pr-8">
              Why did {dealTitle ?? "this deal"} fall through?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 px-6 py-5">
            <Field label="Reason" htmlFor="lost-reason" required error={error}>
              <Input
                id="lost-reason"
                autoFocus
                autoComplete="off"
                value={reason}
                maxLength={280}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(undefined);
                }}
                placeholder="What happened?"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "lost-reason-error" : undefined}
                className="aria-invalid:border-danger"
              />
            </Field>
            <LostReasonChips
              value={reason}
              onPick={(next) => {
                setReason(next);
                setError(undefined);
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm">
              Mark as lost
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
