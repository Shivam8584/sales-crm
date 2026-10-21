"use client";

import Button, { buttonVariants } from "@/components/_ui/button";
import { cn } from "@/lib/utils";
import MailIcon from "@/public/assets/icons/mail-04.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";

export function whatsappHref(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

/** Call, email and WhatsApp shortcuts for whichever contact details exist. */
export default function ContactActions({
  person,
  className,
}: {
  person: { email: string | null; phone: string | null };
  className?: string;
}) {
  if (!person.email && !person.phone) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {person.phone && (
        <Button variant="subtle" size="xs" href={`tel:${person.phone}`}>
          <PhoneIcon aria-hidden className="size-3" />
          Call
        </Button>
      )}
      {person.email && (
        <Button variant="subtle" size="xs" href={`mailto:${person.email}`}>
          <MailIcon aria-hidden className="size-3" />
          Email
        </Button>
      )}
      {person.phone && (
        <a
          href={whatsappHref(person.phone)}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "subtle", size: "xs" })}
        >
          <MessageIcon aria-hidden className="size-3" />
          WhatsApp
        </a>
      )}
    </div>
  );
}
