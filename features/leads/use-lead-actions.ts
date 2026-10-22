"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMembers } from "@/hooks/use-viewer";
import type { DisqualifyReason, LeadStatus } from "@/lib/domain/enums";
import {
  DISQUALIFY_REASON_LABEL,
  LEAD_STATUS_LABEL,
} from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { routes } from "@/lib/routes";

type LeadRef = { _id: Id<"leads">; name: string };

function fail(error: unknown, fallback?: string) {
  toast(readError(error, fallback).message, { tone: "danger" });
}

function statusMessage(
  subject: string,
  status: LeadStatus,
  reason?: DisqualifyReason,
) {
  return status === "disqualified" && reason
    ? `Disqualified ${subject}: ${DISQUALIFY_REASON_LABEL[reason]}`
    : `Moved ${subject} to ${LEAD_STATUS_LABEL[status]}`;
}

/** Status, owner and conversion changes for one lead, each with an Undo toast. */
export function useLeadActions() {
  const router = useRouter();
  const members = useMembers();
  const setStatusMutation = useMutation(api.leads.setStatus);
  const assignMutation = useMutation(api.leads.assign);
  const convertMutation = useMutation(api.leads.convert);
  const touchMutation = useMutation(api.leads.touch);

  const setStatus = useCallback(
    async (lead: LeadRef, status: LeadStatus, reason?: DisqualifyReason) => {
      try {
        const previous = await setStatusMutation({
          id: lead._id,
          status,
          reason,
        });
        toast(
          statusMessage(lead.name, status, reason),
          () =>
            void setStatusMutation({
              id: lead._id,
              status: previous.status,
              reason: previous.reason,
            }).catch((error) => fail(error)),
        );
      } catch (error) {
        fail(error);
      }
    },
    [setStatusMutation],
  );

  const assign = useCallback(
    async (lead: LeadRef, ownerId: string | null) => {
      try {
        const previous = await assignMutation({
          id: lead._id,
          ownerId: ownerId as Id<"members"> | null,
        });
        const name = members?.find((member) => member._id === ownerId)?.name;
        toast(
          name ? `Assigned ${lead.name} to ${name}` : `Unassigned ${lead.name}`,
          () =>
            void assignMutation({ id: lead._id, ownerId: previous }).catch(
              (error) => fail(error),
            ),
        );
      } catch (error) {
        fail(error);
      }
    },
    [assignMutation, members],
  );

  const convert = useCallback(
    async (lead: LeadRef) => {
      try {
        const result = await convertMutation({ id: lead._id });
        toast(
          result.accountMatched
            ? `Converted ${lead.name} into ${result.accountName}`
            : `Converted ${lead.name}: created ${result.accountName}`,
        );
        router.push(routes.account(result.accountId));
        return true;
      } catch (error) {
        fail(error, "Couldn't convert the lead");
        return false;
      }
    },
    [convertMutation, router],
  );

  const touch = useCallback(
    (lead: LeadRef, channel: "call" | "email" | "whatsapp") => {
      touchMutation({ id: lead._id, channel }).catch((error) => fail(error));
    },
    [touchMutation],
  );

  return { setStatus, assign, convert, touch };
}

/** Status and owner changes for many leads at once, undone as one step. */
export function useBulkLeadActions() {
  const members = useMembers();
  const setStatusMany = useMutation(api.leads.setStatusMany);
  const restoreStatuses = useMutation(api.leads.restoreStatuses);
  const assignMany = useMutation(api.leads.assignMany);
  const restoreOwners = useMutation(api.leads.restoreOwners);

  const setStatus = useCallback(
    async (
      ids: Id<"leads">[],
      status: LeadStatus,
      reason?: DisqualifyReason,
    ) => {
      try {
        const { previous, skipped } = await setStatusMany({
          ids,
          status,
          reason,
        });
        const count = previous.length;
        const subject = count === 1 ? "1 lead" : `${count} leads`;
        const note = skipped ? ` · ${skipped} converted, skipped` : "";
        if (count === 0) {
          toast("Converted leads can't change status", { tone: "warning" });
          return;
        }
        toast(
          `${statusMessage(subject, status, reason)}${note}`,
          () =>
            void restoreStatuses({ items: previous }).catch((error) =>
              fail(error),
            ),
        );
      } catch (error) {
        fail(error);
      }
    },
    [setStatusMany, restoreStatuses],
  );

  const assign = useCallback(
    async (ids: Id<"leads">[], ownerId: string | null) => {
      try {
        const previous = await assignMany({
          ids,
          ownerId: ownerId as Id<"members"> | null,
        });
        const name = members?.find((member) => member._id === ownerId)?.name;
        const subject =
          previous.length === 1 ? "1 lead" : `${previous.length} leads`;
        toast(
          name ? `Assigned ${subject} to ${name}` : `Unassigned ${subject}`,
          () =>
            void restoreOwners({ items: previous }).catch((error) =>
              fail(error),
            ),
        );
      } catch (error) {
        fail(error);
      }
    },
    [assignMany, restoreOwners, members],
  );

  return { setStatus, assign };
}
