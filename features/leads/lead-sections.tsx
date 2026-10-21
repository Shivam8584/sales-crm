"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { BigNumber, DetailSection, MeterRow } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import BuildingIcon from "@/public/assets/icons/building-sm.svg";
import MailIcon from "@/public/assets/icons/mail-04.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import LeadContactButtons from "./lead-contact";
import {
  LeadConsents,
  LeadOwnerPicker,
  LeadStatusControl,
  Value,
  When,
  attributionRows,
  type Lead,
} from "./lead-fields";
import { compactSpan } from "./lead-meta";
import { countdown, isSlaOpen, slaMeter, slaState, useNow } from "./sla";

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
  const meter = slaMeter(state, lead.slaMs);
  const sla = compactSpan(lead.slaMs);

  let body: ReactNode;
  switch (state.kind) {
    case "pending":
      body = (
        <>
          <BigNumber
            value={countdown(state.remainingMs)}
            caption={`Left to reach out · ${sla} SLA. Calling, emailing or messaging from here stops the clock.`}
          />
          <MeterRow
            label="SLA used"
            percent={meter!.percent}
            tone={meter!.tone}
            value={`${compactSpan(lead.slaMs - state.remainingMs)} of ${sla}`}
          />
        </>
      );
      break;
    case "replied":
      body = (
        <>
          <BigNumber
            value={compactSpan(state.tookMs)}
            caption={
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
            }
          />
          <MeterRow
            label="SLA used"
            percent={meter!.percent}
            tone={meter!.tone}
            value={
              state.late
                ? `${compactSpan(state.tookMs - lead.slaMs)} over`
                : `${compactSpan(state.tookMs)} of ${sla}`
            }
          />
        </>
      );
      break;
    case "breached":
      body = (
        <>
          <BigNumber
            value={
              <span className="text-danger">{compactSpan(state.overMs)}</span>
            }
            caption={`Past the ${sla} SLA and nobody has reached out yet`}
          />
          <MeterRow
            label="SLA used"
            percent={100}
            tone="danger"
            value="Breached"
          />
        </>
      );
      break;
    default:
      body = (
        <p className="caption-style text-fg-secondary">
          Closed before anyone reached out.
        </p>
      );
  }

  return (
    <DetailSection
      title="Speed to lead"
      className={className}
      divider={divider}
    >
      <div className="flex flex-col gap-4">{body}</div>
    </DetailSection>
  );
}

/** Status, owner, kind and timing as editable rows. */
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
        <Property label="Status">
          <LeadStatusControl lead={lead} />
        </Property>
        <Property label="Owner">
          <LeadOwnerPicker lead={lead} />
        </Property>
        <Property label="Kind">
          <Value>{LEAD_KIND_LABEL[lead.kind]}</Value>
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
  icon: Icon,
  name,
  href,
  existing,
  onNavigate,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  href?: string;
  existing: boolean | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="bg-overlay-2 text-icon flex size-6 shrink-0 items-center justify-center rounded-md">
        <Icon aria-hidden className="size-3.5" />
      </span>
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
        <Tag tone={existing ? "blue" : "green"} size="xs" className="ml-auto">
          {existing ? "Existing" : "New"}
        </Tag>
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
              icon={BuildingIcon}
              name={lead.account.name}
              href={`/accounts/${lead.account._id}`}
              existing={null}
              onNavigate={onNavigate}
            />
          )}
          {lead.person && (
            <ConvertRow
              icon={UsersIcon}
              name={lead.person.name}
              href={`/people/${lead.person._id}`}
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
          icon={BuildingIcon}
          name={account?.name ?? lead.companyName}
          href={account ? `/accounts/${account._id}` : undefined}
          existing={Boolean(account)}
          onNavigate={onNavigate}
        />
        <ConvertRow
          icon={UsersIcon}
          name={person?.name ?? lead.name}
          href={person ? `/people/${person._id}` : undefined}
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
