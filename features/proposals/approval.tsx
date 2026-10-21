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
import {
  MAX_REASON_LENGTH,
  approvalReasons,
  rateLabel,
  type ProposalPricing,
} from "@/lib/domain/pricing";
import { relativeTime, dateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import CheckIcon from "@/public/assets/icons/check-circle.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import type { ProposalActions, ProposalRow } from "./use-proposals";

const TONE = {
  required: "border-danger/40 bg-danger/8",
  requested: "border-warning/40 bg-warning/8",
  approved: "border-success/40 bg-success/8",
  declined: "border-danger/40 bg-danger/8",
} as const;

/**
 * Shown on a draft whose pricing is outside policy: why, who asked, and the
 * decision. Managers and admins approve or decline here with a reason.
 */
export default function ApprovalPanel({
  proposal,
  pricing,
  canApprove,
  actions,
}: {
  proposal: ProposalRow;
  pricing: ProposalPricing;
  canApprove: boolean;
  actions: ProposalActions;
}) {
  const [deciding, setDeciding] = useState<"approve" | "decline" | null>(null);
  const approval = proposal.approval;
  const state = approval?.state ?? "required";
  const reasons = approvalReasons(pricing);
  const Icon =
    state === "approved"
      ? CheckIcon
      : state === "requested"
        ? ClockIcon
        : AlertIcon;

  const title =
    state === "approved"
      ? `Approved by ${approval?.decidedBy?.name ?? "a manager"}`
      : state === "declined"
        ? `Declined by ${approval?.decidedBy?.name ?? "a manager"}`
        : state === "requested"
          ? "Waiting for approval"
          : "Approval required";

  const detail =
    state === "approved" || state === "declined"
      ? approval?.reason
      : state === "requested"
        ? `${approval?.requestedBy?.name ?? "A teammate"} asked ${approval?.requestedAt ? relativeTime(approval.requestedAt) : ""}. ${reasons.join(". ")}.`
        : `${reasons.join(". ")}. A manager or admin has to approve this pricing before it goes to the brand.`;

  const decidedAt = approval?.decidedAt;

  return (
    <div
      role={state === "required" || state === "declined" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-3 rounded-xl border px-4 py-3.5",
        TONE[state],
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          state === "approved"
            ? "text-success"
            : state === "requested"
              ? "text-warning"
              : "text-danger",
        )}
      />
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
        <span className="text-sm font-medium">
          {title}
          {decidedAt && (
            <span
              className="text-fg-tertiary font-normal"
              title={dateTime(decidedAt)}
            >
              {" "}
              · {relativeTime(decidedAt)}
            </span>
          )}
        </span>
        {detail && (
          <span className="text-fg-secondary text-sm leading-snug text-pretty">
            {state === "approved" || state === "declined"
              ? `“${detail}”`
              : detail}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 max-sm:w-full">
        {canApprove && state !== "approved" && (
          <>
            {state !== "declined" && (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => setDeciding("decline")}
              >
                Decline
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setDeciding("approve")}
            >
              Approve
            </Button>
          </>
        )}
        {!canApprove && (state === "required" || state === "declined") && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => void actions.requestApproval(proposal)}
          >
            {state === "declined" ? "Ask again" : "Request approval"}
          </Button>
        )}
      </div>
      <DecideDialog
        mode={deciding}
        proposal={proposal}
        pricing={pricing}
        onClose={() => setDeciding(null)}
        onSubmit={(reason) =>
          actions.decide(proposal, deciding === "approve", reason)
        }
      />
    </div>
  );
}

function DecideDialog({
  mode,
  proposal,
  pricing,
  onClose,
  onSubmit,
}: {
  mode: "approve" | "decline" | null;
  proposal: ProposalRow;
  pricing: ProposalPricing;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<{ message: string } | void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const approve = mode === "approve";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError(
        approve ? "Say why this pricing is worth it" : "Say what has to change",
      );
      return;
    }
    setSaving(true);
    const failed = await onSubmit(reason.trim());
    setSaving(false);
    if (failed) setError(failed.message);
    else onClose();
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-110"
        onCloseAutoFocus={() => {
          setReason("");
          setError(undefined);
        }}
      >
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {approve ? "Approve pricing" : "Decline pricing"}
            </DialogTitle>
            <DialogDescription className="pr-8">
              Proposal v{proposal.version} at {rateLabel(pricing.marginRate)}{" "}
              blended margin. {approvalReasons(pricing).join(". ")}.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5">
            <Field
              label="Reason"
              htmlFor="approval-reason"
              required
              error={error}
              hint="Logged on the deal's timeline."
            >
              <textarea
                id="approval-reason"
                autoFocus
                rows={3}
                maxLength={MAX_REASON_LENGTH}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(undefined);
                }}
                placeholder={
                  approve
                    ? "Strategic logo; volume ramps to 1,000 slots in month 2"
                    : "Bring the bonus down or the price up to clear 15%"
                }
                aria-invalid={error ? true : undefined}
                aria-describedby={
                  error ? "approval-reason-error" : "approval-reason-hint"
                }
                className="border-input bg-secondary text-foreground placeholder:text-fg-tertiary focus-visible:border-selected focus-visible:ring-selected/20 duration-fast aria-invalid:border-danger field-sizing-content max-h-60 min-h-22 w-full resize-none rounded-lg border px-3 py-2.5 text-sm leading-snug transition-[border-color,box-shadow] outline-none focus-visible:ring-3"
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="subtle" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              {approve ? "Approve" : "Decline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
