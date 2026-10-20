"use client";

import { useEffect, useRef, useState } from "react";
import Skeleton from "@/components/_ui/skeleton";
import { formatPhone } from "@/lib/domain/normalize";
import { cn } from "@/lib/utils";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import PhoneIcon from "@/public/assets/icons/phone-call.svg";

export type SubmittedLead = {
  leadId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string;
};

const CALCOM_LINK = process.env.NEXT_PUBLIC_CALCOM_LINK?.trim();

/** Cal.com booking page with the lead prefilled; `metadata[leadId]` comes back on the webhook. */
function bookingUrl(link: string, lead: SubmittedLead) {
  const url = new URL(
    /^https?:\/\//i.test(link)
      ? link
      : `https://cal.com/${link.replace(/^\/+/, "")}`,
  );
  url.searchParams.set("embed", "true");
  url.searchParams.set(
    "theme",
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  url.searchParams.set("name", lead.name);
  if (lead.email) url.searchParams.set("email", lead.email);
  if (lead.phone) url.searchParams.set("attendeePhoneNumber", lead.phone);
  if (lead.leadId) url.searchParams.set("metadata[leadId]", lead.leadId);
  return url.toString();
}

export default function DemoBooking({
  lead,
  embed,
}: {
  lead: SubmittedLead;
  embed: boolean;
}) {
  const firstName = lead.name.split(/\s+/)[0];
  const [loaded, setLoaded] = useState(false);
  const [src] = useState(() =>
    CALCOM_LINK ? bookingUrl(CALCOM_LINK, lead) : null,
  );
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  return (
    <section
      aria-labelledby="demo-done-title"
      className={cn(
        "flex flex-col gap-6",
        !embed && "bg-card shadow-card rounded-2xl p-5 sm:p-7",
      )}
    >
      <div role="status" className="flex items-start gap-3.5">
        <span className="bg-muted shadow-hairline flex size-10 shrink-0 items-center justify-center rounded-full">
          <CheckCircleIcon aria-hidden className="text-success size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-2 pt-0.5">
          <h2
            id="demo-done-title"
            ref={heading}
            tabIndex={-1}
            className="text-lg leading-6 font-semibold outline-none"
          >
            Thanks, {firstName}. We have your request.
          </h2>
          <p className="text-fg-secondary">
            A Hypedrive specialist is now assigned to {lead.companyName}.
          </p>
        </div>
      </div>

      {src ? (
        <div className="flex flex-col gap-3">
          <h3>Pick a time that suits you</h3>
          <div className="border-border relative h-[min(720px,80dvh)] overflow-hidden rounded-xl border">
            {!loaded && (
              <div className="absolute inset-0 flex flex-col gap-3 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-full w-full" />
              </div>
            )}
            <iframe
              src={src}
              title="Book a demo with Hypedrive"
              onLoad={() => setLoaded(true)}
              className="relative size-full"
            />
          </div>
        </div>
      ) : (
        <div className="bg-raised shadow-hairline flex items-start gap-3 rounded-xl p-4">
          <PhoneIcon
            aria-hidden
            className="text-fg-secondary mt-px size-4 shrink-0"
          />
          <div className="flex flex-col gap-2">
            <p className="font-medium">
              A specialist will call you within one business hour.
            </p>
            <p className="text-fg-secondary">
              {lead.phone
                ? `We'll call ${formatPhone(lead.phone)} or message you on WhatsApp.`
                : `We'll write to ${lead.email}.`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
