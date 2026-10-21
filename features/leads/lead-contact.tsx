"use client";

import type { ComponentType, SVGProps } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import { formatPhone } from "@/lib/domain/normalize";
import { cn } from "@/lib/utils";
import MailIcon from "@/public/assets/icons/mail-04.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";
import { whatsappHref } from "./lead-meta";
import { useLeadActions } from "./use-lead-actions";

type Contact = {
  channel: "call" | "email" | "whatsapp";
  href: string;
  label: string;
  detail: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  external?: boolean;
};

function contactsOf(lead: { email?: string | null; phone?: string | null }) {
  const contacts: Contact[] = [];
  if (lead.phone) {
    contacts.push({
      channel: "call",
      href: `tel:${lead.phone}`,
      label: "Call",
      detail: formatPhone(lead.phone),
      icon: PhoneIcon,
    });
  }
  if (lead.email) {
    contacts.push({
      channel: "email",
      href: `mailto:${lead.email}`,
      label: "Email",
      detail: lead.email,
      icon: MailIcon,
    });
  }
  if (lead.phone) {
    contacts.push({
      channel: "whatsapp",
      href: whatsappHref(lead.phone),
      label: "WhatsApp",
      detail: formatPhone(lead.phone),
      icon: MessageIcon,
      external: true,
    });
  }
  return contacts;
}

/** Call, Email and WhatsApp links; opening one counts as the first touch and stops the SLA clock. */
export default function LeadContactButtons({
  lead,
  compact = false,
  className,
}: {
  lead: {
    _id: Id<"leads">;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  /** Icon-only below the `sm` breakpoint. */
  compact?: boolean;
  className?: string;
}) {
  const { touch } = useLeadActions();
  const contacts = contactsOf(lead);
  if (contacts.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {contacts.map((contact) => (
        <Tooltip key={contact.channel} content={contact.detail}>
          <a
            href={contact.href}
            target={contact.external ? "_blank" : undefined}
            rel={contact.external ? "noreferrer" : undefined}
            onClick={() => touch(lead, contact.channel)}
            aria-label={`${contact.label} ${lead.name}`}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "gap-2 px-3",
              compact && "max-sm:size-control-sm max-sm:p-0",
            )}
          >
            <contact.icon aria-hidden className="size-3.5" />
            <span className={cn(compact && "max-sm:sr-only")}>
              {contact.label}
            </span>
          </a>
        </Tooltip>
      ))}
    </div>
  );
}
