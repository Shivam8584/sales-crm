"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import { DetailSection } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import { formatPhone } from "@/lib/domain/normalize";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import MailIcon from "@/public/assets/icons/mail-03.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";
import LeadContactButtons from "./lead-contact";
import {
  LeadConsents,
  LeadOwnerPicker,
  Value,
  When,
  attributionRows,
  type Lead,
} from "./lead-fields";
import { compactSpan } from "./lead-meta";
import { countdown, isSlaOpen, slaState, useNow } from "./sla";
import { routes } from "@/lib/routes";

type SectionProps = { className?: string; divider?: boolean };

function Line({
  icon: Icon,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
}) {
  return (
    <span className="text-fg-secondary flex min-w-0 items-center gap-1">
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Owner, then the lead with their email and phone, then the contact actions. */
export function LeadSummary({
  lead,
  actions = true,
  className,
  divider,
}: SectionProps & { lead: Lead; actions?: boolean }) {
  return (
    <DetailSection
      title="Contact summary"
      className={className}
      divider={divider}
    >
      <div className="flex flex-col gap-3">
        <div className="lead-style flex min-w-0 items-center gap-1.5 font-medium">
          {lead.owner ? (
            <>
              <Avatar name={lead.owner.name} />
              <span className="truncate">{lead.owner.name}</span>
              <span className="caption-style text-fg-tertiary font-normal">
                Owner
              </span>
            </>
          ) : (
            <span className="text-fg-tertiary font-normal">
              Nobody owns this lead yet
            </span>
          )}
        </div>
        <div className="lead-style flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            <Avatar name={lead.name} />
            <span className="truncate">{lead.name}</span>
            <span className="caption-style text-fg-tertiary truncate font-normal">
              {lead.companyName}
            </span>
          </span>
          {lead.email && <Line icon={MailIcon}>{lead.email}</Line>}
          {lead.phone && (
            <Line icon={PhoneIcon}>
              <span className="tabular-nums">{formatPhone(lead.phone)}</span>
            </Line>
          )}
        </div>
        {actions && <LeadContactButtons lead={lead} className="pt-1" />}
      </div>
    </DetailSection>
  );
}

/** Time to first touch against the SLA: a live countdown until someone reaches out. */
export function SpeedToLead({
  lead,
  className,
  divider,
}: SectionProps & { lead: Lead }) {
  const now = useNow(isSlaOpen(lead), 1000);
  const state = slaState(lead, lead.slaMs, now);
  const sla = compactSpan(lead.slaMs);

  let value: ReactNode = null;
  let caption: ReactNode;
  switch (state.kind) {
    case "pending":
      value =
        state.remainingMs > lead.slaMs ? "09:00" : countdown(state.remainingMs);
      caption =
        state.remainingMs > lead.slaMs
          ? `Arrived out of hours. The ${sla} SLA clock starts at 09:00 IST.`
          : `Left to reach out · ${sla} SLA. Calling, emailing or messaging stops the clock.`;
      break;
    case "replied":
      value = compactSpan(state.tookMs);
      caption = (
        <>
          To first touch,{" "}
          <time
            dateTime={new Date(lead.firstTouchedAt!).toISOString()}
            title={dateTime(lead.firstTouchedAt!)}
          >
            {relativeTime(lead.firstTouchedAt!, now)}
          </time>{" "}
          · {state.late ? "after" : "within"} the {sla} SLA
        </>
      );
      break;
    case "breached":
      value = <span className="text-danger">{compactSpan(state.overMs)}</span>;
      caption = `Past the ${sla} SLA and nobody has reached out yet`;
      break;
    default:
      caption = "Closed before anyone reached out.";
  }

  return (
    <DetailSection
      title="Speed to lead"
      className={className}
      divider={divider}
    >
      <p className="flex flex-col gap-1 text-sm tabular-nums">
        {value && <span className="font-medium">{value}</span>}
        <span className="text-fg-tertiary">{caption}</span>
      </p>
    </DetailSection>
  );
}

/** Owner and timing as rows. */
export function LeadDetails({
  lead,
  className,
  divider,
}: SectionProps & { lead: Lead }) {
  return (
    <DetailSection
      title="Details"
      className={cn("gap-2", className)}
      divider={divider}
    >
      <Properties>
        <Property label="Owner">
          <LeadOwnerPicker lead={lead} />
        </Property>
        <Property label="Received">
          <When at={lead._creationTime} />
        </Property>
        {lead.demoAt && (
          <Property label="Demo">
            <Value>{dateTime(lead.demoAt)}</Value>
          </Property>
        )}
      </Properties>
    </DetailSection>
  );
}

export function LeadMessageSection({
  message,
  className,
  divider,
}: SectionProps & { message: string }) {
  return (
    <DetailSection
      title="Their message"
      className={className}
      divider={divider}
    >
      <blockquote className="border-line-strong text-foreground border-l-2 pl-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
        {message}
      </blockquote>
    </DetailSection>
  );
}

const MONO = new Set(["Referrer", "Landing page"]);

/** UTM, referrer and landing page as definition rows. */
export function LeadAttribution({
  lead,
  className,
  divider,
}: SectionProps & { lead: Lead }) {
  const rows = attributionRows(lead);
  return (
    <DetailSection
      title="Attribution"
      className={cn("gap-2", className)}
      divider={divider}
    >
      <Properties>
        {rows.map(([label, value]) => (
          <Property key={label} label={label}>
            <span
              title={value}
              className={cn(
                "truncate",
                MONO.has(label) ? "font-mono text-xs" : "text-sm",
              )}
            >
              {value}
            </span>
          </Property>
        ))}
      </Properties>
    </DetailSection>
  );
}

export function LeadConsent({
  lead,
  className,
  divider,
}: SectionProps & { lead: Lead }) {
  const granted = lead.consents.filter((consent) => consent.granted).length;
  return (
    <DetailSection
      title="Consent"
      className={className}
      divider={divider}
      action={
        lead.consents.length > 0 && (
          <span className="caption-style text-fg-tertiary tabular-nums">
            {granted} of {lead.consents.length} granted
          </span>
        )
      }
    >
      <LeadConsents consents={lead.consents} />
    </DetailSection>
  );
}

function ConvertRow({
  name,
  href,
  existing,
  onNavigate,
}: {
  name: string;
  href?: string;
  existing: boolean | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {href ? (
        <Button
          variant="link"
          size="none"
          href={href}
          onClick={onNavigate}
          className="min-w-0 truncate text-sm"
        >
          {name}
        </Button>
      ) : (
        <span className="min-w-0 truncate text-sm">{name}</span>
      )}
      {existing !== null && (
        <span className="caption-style text-fg-tertiary ml-auto">
          {existing ? "Existing" : "New"}
        </span>
      )}
    </div>
  );
}

/** What converting will create or link; after conversion, links to the records. */
export function LeadConversion({
  lead,
  onNavigate,
  className,
  divider,
}: SectionProps & { lead: Lead; onNavigate?: () => void }) {
  if (lead.status === "converted") {
    return (
      <DetailSection
        title="Converted"
        className={className}
        divider={divider}
        action={
          lead.convertedAt && (
            <span
              className="caption-style text-fg-tertiary"
              title={dateTime(lead.convertedAt)}
            >
              {relativeTime(lead.convertedAt)}
            </span>
          )
        }
      >
        <div className="flex flex-col gap-2.5">
          {lead.account && (
            <ConvertRow
              name={lead.account.name}
              href={routes.account(lead.account._id)}
              existing={null}
              onNavigate={onNavigate}
            />
          )}
          {lead.person && (
            <ConvertRow
              name={lead.person.name}
              href={routes.person(lead.person._id)}
              existing={null}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </DetailSection>
    );
  }
  const { account, person } = lead.matches;
  return (
    <DetailSection
      title="Convert preview"
      className={className}
      divider={divider}
    >
      <div className="flex flex-col gap-2.5">
        <ConvertRow
          name={account?.name ?? lead.companyName}
          href={account ? routes.account(account._id) : undefined}
          existing={Boolean(account)}
          onNavigate={onNavigate}
        />
        <ConvertRow
          name={person?.name ?? lead.name}
          href={person ? routes.person(person._id) : undefined}
          existing={Boolean(person)}
          onNavigate={onNavigate}
        />
        <p className="caption-style text-fg-tertiary leading-snug">
          Converting {account ? "links to" : "creates"} the account and{" "}
          {person ? "links to" : "adds"} the person, and carries over the
          timeline and consent.
        </p>
      </div>
    </DetailSection>
  );
}
