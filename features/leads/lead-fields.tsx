"use client";

import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import OptionPicker from "@/components/fields/option-picker";
import { useMembers } from "@/hooks/use-viewer";
import {
  CONSENT_CHANNEL_LABEL,
  CONSENT_EVENT_LABEL,
  CONSENT_PURPOSE_LABEL,
  consentSourceLabel,
  eventOf,
  purposeOf,
  type ConsentEvent,
} from "@/lib/domain/consent";
import {
  DISQUALIFY_REASON_LABEL,
  LEAD_STATUS_LABEL,
} from "@/lib/domain/labels";
import { LEAD_SOURCE_LABEL } from "@/lib/domain/leads";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import { StatusTag, ownerOptions } from "./lead-meta";
import LeadStatusMenu from "./lead-status-menu";
import { useLeadActions } from "./use-lead-actions";

export type Lead = NonNullable<FunctionReturnType<typeof api.leads.get>>;

const EVENT_DOT: Record<ConsentEvent, string> = {
  grant: "bg-success",
  withdraw: "bg-danger",
  dnd_on: "bg-danger",
  dnd_off: "bg-success",
  erasure_requested: "bg-warning",
  erasure_cancelled: "bg-fg-tertiary",
  erased: "bg-fg-tertiary",
};

export function Value({ children }: { children: ReactNode }) {
  return children ? (
    <span className="min-w-0 truncate text-sm leading-snug">{children}</span>
  ) : (
    <span className="text-fg-tertiary text-sm">—</span>
  );
}

/** A time shown relative, with the exact time on hover. */
export function When({ at }: { at: number | null | undefined }) {
  if (!at) return <Value>{null}</Value>;
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={dateTime(at)}
      className="truncate text-sm"
    >
      {relativeTime(at)}
    </time>
  );
}

/** Status tag that opens the status menu; converted leads are read-only. */
export function LeadStatusControl({
  lead,
  className,
}: {
  lead: Pick<Lead, "_id" | "name" | "status" | "disqualifyReason">;
  className?: string;
}) {
  const { setStatus } = useLeadActions();
  if (lead.status === "converted") return <StatusTag status={lead.status} />;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <LeadStatusMenu
        status={lead.status}
        reason={lead.disqualifyReason}
        onChange={(status, reason) => void setStatus(lead, status, reason)}
      >
        <button
          type="button"
          aria-label={`Status: ${LEAD_STATUS_LABEL[lead.status]}. Change status`}
          className="group focus-visible:ring-ring flex shrink-0 cursor-pointer items-center gap-1 rounded-full outline-none focus-visible:ring-2"
        >
          <StatusTag status={lead.status} />
          <ChevronDownIcon
            aria-hidden
            className="text-fg-tertiary group-hover:text-foreground duration-fast size-2.5 transition-colors"
          />
        </button>
      </LeadStatusMenu>
      {lead.status === "disqualified" && lead.disqualifyReason && (
        <span className="caption-style text-fg-tertiary truncate">
          {DISQUALIFY_REASON_LABEL[lead.disqualifyReason]}
        </span>
      )}
    </span>
  );
}

export function LeadOwnerPicker({
  lead,
  className,
}: {
  lead: Pick<Lead, "_id" | "name" | "owner">;
  className?: string;
}) {
  const members = useMembers();
  const { assign } = useLeadActions();
  return (
    <OptionPicker
      value={lead.owner?._id ?? null}
      label="Owner"
      placeholder="Unassigned"
      searchPlaceholder="Search teammates…"
      clearLabel="Unassign"
      options={ownerOptions(members, lead.owner)}
      onChange={(value) => void assign(lead, value)}
      className={className}
    />
  );
}

export function LeadMessage({ message }: { message: string }) {
  return (
    <figure className="bg-card shadow-card flex flex-col gap-2 rounded-xl px-4 py-3.5">
      <figcaption className="caption-style text-fg-tertiary">
        Their message
      </figcaption>
      <blockquote className="text-sm leading-relaxed break-words whitespace-pre-wrap">
        {message}
      </blockquote>
    </figure>
  );
}

export function LeadConsents({ consents }: { consents: Lead["consents"] }) {
  if (consents.length === 0) {
    return (
      <p className="caption-style text-fg-tertiary">No consent on record.</p>
    );
  }
  const text = consents[0]?.text;
  return (
    <div className="flex flex-col gap-3">
      {text && (
        <blockquote className="border-line-strong text-fg-secondary border-l-2 pl-3 text-sm leading-snug">
          {text}
        </blockquote>
      )}
      <ul className="flex flex-col gap-2">
        {consents.map((consent) => (
          <li
            key={consent._id}
            className="caption-style flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug"
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                EVENT_DOT[eventOf(consent)],
              )}
            />
            <span className="text-foreground">
              {CONSENT_CHANNEL_LABEL[consent.channel]} ·{" "}
              {CONSENT_EVENT_LABEL[eventOf(consent)].toLowerCase()}
              {purposeOf(consent) &&
                ` for ${CONSENT_PURPOSE_LABEL[purposeOf(consent)!].toLowerCase()}`}
            </span>
            <span className="text-fg-tertiary">
              {dateTime(consent.recordedAt)} ·{" "}
              {consentSourceLabel(consent.source)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** UTM, referrer and landing page rows that have a value. */
export function attributionRows(lead: Lead) {
  const rows: [string, string | undefined][] = [
    ["Entered via", LEAD_SOURCE_LABEL[lead.source] ?? lead.source],
    ["Channel", lead.channel],
    ["Campaign", lead.utm.campaign],
    ["UTM source", lead.utm.source],
    ["UTM medium", lead.utm.medium],
    ["UTM term", lead.utm.term],
    ["UTM content", lead.utm.content],
    ["Referrer", lead.referrer],
    ["Landing page", lead.landingPage],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}
