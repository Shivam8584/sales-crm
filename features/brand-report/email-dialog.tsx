"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Skeleton from "@/components/_ui/skeleton";
import { Switch } from "@/components/_ui/switch";
import { readError } from "@/lib/errors";
import { relativeTime, shortDate } from "@/lib/time";
import { toast } from "@/stores/toast-store";

/** Preview, send now, and the monthly opt-in for one account's results email. */
export default function EmailDialog({
  accountId,
  monthKey,
  onClose,
}: {
  accountId: Id<"accounts">;
  monthKey?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <Body accountId={accountId} monthKey={monthKey} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function Body({
  accountId,
  monthKey,
  onClose,
}: {
  accountId: Id<"accounts">;
  monthKey?: string;
  onClose: () => void;
}) {
  const panel = useQuery(api.brandReport.emailPanel, {
    accountId,
    key: monthKey,
  });
  const sendNow = useMutation(api.brandReport.sendNow);
  const setMonthly = useMutation(api.brandReport.setMonthly);
  const [sending, setSending] = useState(false);

  const problem =
    panel &&
    (panel.blocked ??
      (panel.stopped
        ? "Sequences are stopped for the whole workspace."
        : panel.provider === "outbox"
          ? "No email provider is set up, so nothing can be sent."
          : !panel.to
            ? "There is no contact with an email address on this account."
            : !panel.allowed
              ? `${panel.consentNote}.`
              : !panel.canSend
                ? "Only the account owner or a manager can send this."
                : null));

  async function send() {
    if (!panel) return;
    setSending(true);
    try {
      await sendNow({ accountId, key: panel.period.key });
      toast(`Sending the ${panel.period.label} report to ${panel.to?.email}`);
      onClose();
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  async function toggle(enabled: boolean) {
    try {
      await setMonthly({ accountId, enabled });
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Email the results report</DialogTitle>
        <DialogDescription>
          {panel
            ? `The ${panel.period.label} report as a plain email, sent only if the contact agreed to product updates.`
            : "Loading the preview."}
        </DialogDescription>
      </DialogHeader>
      {panel === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-fg-tertiary">To</dt>
            <dd className="truncate">
              {panel.to ? `${panel.to.name} <${panel.to.email}>` : "—"}
            </dd>
            <dt className="text-fg-tertiary">Subject</dt>
            <dd className="truncate">{panel.email?.subject ?? "—"}</dd>
          </dl>
          {panel.email && (
            <pre className="border-border text-fg-secondary max-h-64 overflow-y-auto border-y py-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
              {panel.email.body}
            </pre>
          )}
          {problem && (
            <p className="text-danger text-sm text-pretty">{problem}</p>
          )}
          {panel.canSend && (
            <div className="flex items-start justify-between gap-4">
              <label
                htmlFor="monthly-report"
                className="flex min-w-0 flex-col gap-0.5"
              >
                <span className="text-sm">Send every month</span>
                <span className="caption-style text-fg-tertiary leading-snug">
                  {panel.monthly.enabled && panel.monthly.next
                    ? `Next: ${panel.monthly.next.label} report on ${shortDate(Date.parse(`${panel.monthly.next.day}T00:00:00+05:30`))}.`
                    : "On the 2nd, the report for the month before, if anything happened."}
                  {panel.monthly.last?.status === "sent" &&
                    panel.monthly.last.at &&
                    ` Last sent ${relativeTime(panel.monthly.last.at)}.`}
                  {panel.monthly.last?.status === "skipped" &&
                    ` Skipped ${panel.monthly.last.key}: ${panel.monthly.last.note}.`}
                  {panel.monthly.last?.status === "failed" &&
                    ` Last send failed: ${panel.monthly.last.note}.`}
                </span>
              </label>
              <Switch
                id="monthly-report"
                checked={panel.monthly.enabled}
                onCheckedChange={(on) => void toggle(on)}
              />
            </div>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="primary"
          loading={sending}
          disabled={!panel || Boolean(problem)}
          onClick={() => void send()}
        >
          Send now
        </Button>
      </DialogFooter>
    </>
  );
}
