"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { DetailSection } from "@/components/record/detail";
import type { Channel } from "@/lib/domain/enums";
import { dateTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const CHANNEL: Record<Channel, string> = {
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
};

/** What the person agreed to be contacted on, with the exact wording they saw. */
export default function ConsentRecords({
  personId,
  className,
  divider,
}: {
  personId: Id<"people">;
  className?: string;
  divider?: boolean;
}) {
  const consents = useQuery(api.people.consents, { personId });

  return (
    <DetailSection
      title="Consent"
      className={cn("gap-2", className)}
      divider={divider}
    >
      {consents === undefined ? (
        <div aria-busy className="flex flex-col gap-2 py-1">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : consents.length === 0 ? (
        <p className="text-fg-tertiary text-sm leading-8">
          No consent recorded
        </p>
      ) : (
        <ul className="flex flex-col">
          {consents.map((consent) => (
            <li key={consent._id}>
              <Tooltip
                content={
                  <span className="flex max-w-72 flex-col gap-1 leading-snug">
                    <span>“{consent.text}”</span>
                    <span className="text-fg-tertiary">
                      {dateTime(consent.recordedAt)} · {consent.source}
                    </span>
                  </span>
                }
              >
                <button
                  type="button"
                  aria-label={`${CHANNEL[consent.channel]} ${consent.granted ? "granted" : "withdrawn"} ${shortDate(consent.recordedAt)} via ${consent.source}: ${consent.text}`}
                  className="hover:bg-overlay-1 focus-visible:ring-ring -mx-1.5 grid w-[calc(100%+0.75rem)] grid-cols-[5rem_auto_minmax(0,1fr)] items-center gap-2 rounded-md px-1.5 py-1.5 text-left outline-none focus-visible:ring-2"
                >
                  <span className="text-sm">{CHANNEL[consent.channel]}</span>
                  <Tag tone={consent.granted ? "green" : "red"} size="xs">
                    {consent.granted ? "Granted" : "Withdrawn"}
                  </Tag>
                  <span className="caption-style text-fg-tertiary truncate text-right">
                    {shortDate(consent.recordedAt)} · {consent.source}
                  </span>
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
