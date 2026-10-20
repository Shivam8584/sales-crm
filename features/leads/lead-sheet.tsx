"use client";

import {
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button, { buttonVariants } from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import Skeleton from "@/components/_ui/skeleton";
import OptionPicker from "@/components/fields/option-picker";
import { Properties, Property } from "@/components/record/properties";
import Timeline from "@/features/timeline/timeline";
import { useMembers } from "@/hooks/use-viewer";
import {
  DISQUALIFY_REASONS,
  type Channel,
  type DisqualifyReason,
  type LeadStatus,
} from "@/lib/domain/enums";
import {
  DISQUALIFY_REASON_LABEL,
  LEAD_KIND_LABEL,
  LEAD_STATUS_LABEL,
} from "@/lib/domain/labels";
import { LEAD_SOURCE_LABEL } from "@/lib/domain/leads";
import { formatPhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { dateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import MailIcon from "@/public/assets/icons/mail-04.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";
import XIcon from "@/public/assets/icons/x.svg";
import {
  DemoTag,
  StatusTag,
  WORKING_STATUS_OPTIONS,
  ownerOptions,
  whatsappHref,
} from "./lead-meta";
import SlaIndicator from "./sla";

type Lead = NonNullable<FunctionReturnType<typeof api.leads.get>>;
type TouchChannel = "call" | "email" | "whatsapp";

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
};

/** Lead detail in a side sheet over the inbox, so triage never loses the list. */
export default function LeadSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const lead = useQuery(api.leads.get, id ? { id } : "skip");

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-130">
        <SheetHeader>
          <SheetTitle>Lead</SheetTitle>
          <SheetDescription className="sr-only">
            Contact details, attribution and next steps for this lead
          </SheetDescription>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mr-2"
              aria-label="Close"
            >
              <XIcon aria-hidden className="size-3.5" />
            </Button>
          </SheetClose>
        </SheetHeader>
        {lead === undefined ? (
          <div aria-busy className="flex flex-col gap-4 px-6 py-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <span className="flex flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </span>
            </div>
            <Skeleton className="h-8 w-64" />
          </div>
        ) : lead === null ? (
          <p className="text-fg-secondary px-6 py-6">
            This lead no longer exists.
          </p>
        ) : (
          <LeadBody key={lead._id} lead={lead} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Value({ children }: { children: ReactNode }) {
  return children ? (
    <span className="lead-style min-w-0 truncate leading-snug">{children}</span>
  ) : (
    <span className="lead-style text-fg-tertiary">—</span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border flex flex-col gap-3 border-t px-6 py-5">
      <h3 className="caption-style text-fg-tertiary font-medium">{title}</h3>
      {children}
    </section>
  );
}

function LeadBody({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const router = useRouter();
  const members = useMembers();
  const touch = useMutation(api.leads.touch);
  const setStatus = useMutation(api.leads.setStatus);
  const assign = useMutation(api.leads.assign);
  const convert = useMutation(api.leads.convert);
  const [converting, setConverting] = useState(false);
  const closed = lead.status === "disqualified" || lead.status === "converted";

  function recordTouch(channel: TouchChannel) {
    touch({ id: lead._id, channel }).catch((error) =>
      toast(readError(error).message, { tone: "danger" }),
    );
  }

  async function changeStatus(status: LeadStatus, reason?: DisqualifyReason) {
    try {
      const previous = await setStatus({ id: lead._id, status, reason });
      toast(
        status === "disqualified" && reason
          ? `Disqualified ${lead.name}: ${DISQUALIFY_REASON_LABEL[reason]}`
          : `Moved ${lead.name} to ${LEAD_STATUS_LABEL[status]}`,
        () =>
          void setStatus({
            id: lead._id,
            status: previous.status,
            reason: previous.reason,
          }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function reassign(ownerId: string | null) {
    try {
      const previous = await assign({
        id: lead._id,
        ownerId: ownerId as Id<"members"> | null,
      });
      const name = members?.find((member) => member._id === ownerId)?.name;
      toast(
        name ? `Assigned ${lead.name} to ${name}` : `Unassigned ${lead.name}`,
        () => void assign({ id: lead._id, ownerId: previous }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function runConvert() {
    setConverting(true);
    try {
      const result = await convert({ id: lead._id });
      toast(
        result.accountMatched
          ? `Converted ${lead.name} into ${result.accountName}`
          : `Converted ${lead.name}: created ${result.accountName}`,
      );
      onClose();
      router.push(`/accounts/${result.accountId}`);
    } catch (error) {
      toast(readError(error, "Couldn't convert the lead").message, {
        tone: "danger",
      });
      setConverting(false);
    }
  }

  const contacts: {
    channel: TouchChannel;
    href: string;
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    external?: boolean;
  }[] = [];
  if (lead.phone) {
    contacts.push({
      channel: "call",
      href: `tel:${lead.phone}`,
      label: "Call",
      icon: PhoneIcon,
    });
  }
  if (lead.email) {
    contacts.push({
      channel: "email",
      href: `mailto:${lead.email}`,
      label: "Email",
      icon: MailIcon,
    });
  }
  if (lead.phone) {
    contacts.push({
      channel: "whatsapp",
      href: whatsappHref(lead.phone),
      label: "WhatsApp",
      icon: MessageIcon,
      external: true,
    });
  }

  const websiteHref = lead.website
    ? /^https?:\/\//i.test(lead.website)
      ? lead.website
      : `https://${lead.website}`
    : null;
  const utmRows = (
    [
      ["Campaign", lead.utm.campaign],
      ["UTM source", lead.utm.source],
      ["UTM medium", lead.utm.medium],
      ["UTM term", lead.utm.term],
      ["UTM content", lead.utm.content],
    ] as const
  ).filter(([, value]) => value);
  const consentText = lead.consents[0]?.text;

  return (
    <>
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-6 pt-6 pb-5">
          <div className="flex items-start gap-3.5">
            <Avatar name={lead.name} size="xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
              <h2 className="truncate text-lg leading-6 font-semibold">
                {lead.name}
              </h2>
              <p className="caption-style text-fg-secondary truncate">
                {lead.companyName} · {LEAD_KIND_LABEL[lead.kind]}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusTag status={lead.status} />
                {lead.demoAt && <DemoTag at={lead.demoAt} />}
                <SlaIndicator lead={lead} slaMs={lead.slaMs} />
              </div>
            </div>
          </div>
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contacts.map((contact) => (
                <a
                  key={contact.channel}
                  href={contact.href}
                  target={contact.external ? "_blank" : undefined}
                  rel={contact.external ? "noreferrer" : undefined}
                  onClick={() => recordTouch(contact.channel)}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "gap-2 px-3",
                  )}
                >
                  <contact.icon aria-hidden className="size-3.5" />
                  {contact.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <Section title="Details">
          <Properties>
            <Property label="Status">
              {closed ? (
                <Value>
                  {lead.status === "converted"
                    ? `Converted ${lead.convertedAt ? dateTime(lead.convertedAt) : ""}`
                    : `Disqualified · ${lead.disqualifyReason ? DISQUALIFY_REASON_LABEL[lead.disqualifyReason] : "No reason"}`}
                </Value>
              ) : (
                <OptionPicker
                  value={lead.status}
                  label="Status"
                  options={WORKING_STATUS_OPTIONS}
                  onChange={(value) =>
                    value && void changeStatus(value as LeadStatus)
                  }
                />
              )}
            </Property>
            <Property label="Owner">
              <OptionPicker
                value={lead.owner?._id ?? null}
                label="Owner"
                placeholder="Unassigned"
                searchPlaceholder="Search teammates…"
                clearLabel="Unassign"
                options={ownerOptions(members, lead.owner)}
                onChange={(value) => void reassign(value)}
              />
            </Property>
            <Property label="Email">
              <Value>{lead.email}</Value>
            </Property>
            <Property label="Phone">
              <Value>
                {lead.phone && (
                  <span className="tabular-nums">
                    {formatPhone(lead.phone)}
                  </span>
                )}
              </Value>
            </Property>
            <Property label="Website">
              <Value>
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noreferrer"
                    className="decoration-fg-tertiary hover:decoration-foreground underline underline-offset-2"
                  >
                    {lead.website!.replace(/^https?:\/\//i, "")}
                  </a>
                )}
              </Value>
            </Property>
            <Property label="GSTIN">
              <Value>
                {lead.gstin && <span className="font-mono">{lead.gstin}</span>}
              </Value>
            </Property>
            <Property label="Received">
              <Value>{dateTime(lead._creationTime)}</Value>
            </Property>
            <Property label="First touch">
              <Value>
                {lead.firstTouchedAt && dateTime(lead.firstTouchedAt)}
              </Value>
            </Property>
            {lead.demoAt && (
              <Property label="Demo">
                <Value>{dateTime(lead.demoAt)}</Value>
              </Property>
            )}
          </Properties>
        </Section>

        <Section title="Message">
          {lead.message ? (
            <p className="text-foreground break-words whitespace-pre-wrap">
              {lead.message}
            </p>
          ) : (
            <p className="text-fg-tertiary">No message.</p>
          )}
        </Section>

        <Section title="Activity">
          <Timeline target={{ leadId: lead._id }} />
        </Section>

        <Section title="Attribution">
          <Properties>
            <Property label="Entered via">
              <Value>{LEAD_SOURCE_LABEL[lead.source] ?? lead.source}</Value>
            </Property>
            {utmRows.map(([label, value]) => (
              <Property key={label} label={label}>
                <Value>{value}</Value>
              </Property>
            ))}
            <Property label="Referrer">
              <Value>{lead.referrer}</Value>
            </Property>
            <Property label="Landing page">
              <Value>
                {lead.landingPage && (
                  <span className="font-mono text-xs">{lead.landingPage}</span>
                )}
              </Value>
            </Property>
          </Properties>
        </Section>

        <Section title="Consent">
          {lead.consents.length === 0 ? (
            <p className="text-fg-tertiary">No consent on record.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {consentText && (
                <blockquote className="border-line-strong text-fg-secondary border-l-2 pl-3 text-sm leading-snug">
                  {consentText}
                </blockquote>
              )}
              <ul className="flex flex-col gap-2">
                {lead.consents.map((consent) => (
                  <li
                    key={consent._id}
                    className="caption-style flex items-center gap-2 leading-snug"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        consent.granted ? "bg-success" : "bg-danger",
                      )}
                    />
                    <span className="text-foreground">
                      {CHANNEL_LABEL[consent.channel]}
                    </span>
                    <span className="text-fg-tertiary">
                      {consent.granted ? "granted" : "refused"} ·{" "}
                      {dateTime(consent.recordedAt)} ·{" "}
                      {LEAD_SOURCE_LABEL[consent.source] ?? consent.source}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {lead.status !== "converted" && (
          <Section title="Convert">
            <p className="text-fg-secondary">
              {lead.matches.account
                ? `Links to the existing account ${lead.matches.account.name}`
                : `Creates a new account, ${lead.companyName}`}
              {lead.matches.person
                ? ` and ${lead.matches.person.name}, already in People.`
                : `, with ${lead.name} as a person.`}
            </p>
          </Section>
        )}
      </div>

      <SheetFooter>
        {lead.status === "converted" ? (
          <>
            {lead.account && (
              <Button
                variant="primary"
                size="sm"
                href={`/accounts/${lead.account._id}`}
                onClick={onClose}
                className="ml-auto max-w-full min-w-0"
              >
                <span className="truncate">Open {lead.account.name}</span>
              </Button>
            )}
          </>
        ) : (
          <>
            {lead.status === "disqualified" ? (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2.25"
                onClick={() => void changeStatus("nurture")}
              >
                Move to nurture
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="group -ml-2.25">
                    Disqualify
                    <ChevronDownIcon
                      aria-hidden
                      className="duration-base size-2.5 transition-transform group-data-[state=open]:rotate-180"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="top"
                  className="min-w-52"
                >
                  <DropdownMenuLabel>Reason</DropdownMenuLabel>
                  {DISQUALIFY_REASONS.map((reason) => (
                    <DropdownMenuItem
                      key={reason}
                      onSelect={() => void changeStatus("disqualified", reason)}
                    >
                      {DISQUALIFY_REASON_LABEL[reason]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="primary"
              size="sm"
              loading={converting}
              onClick={() => void runConvert()}
            >
              Convert to account
            </Button>
          </>
        )}
      </SheetFooter>
    </>
  );
}
