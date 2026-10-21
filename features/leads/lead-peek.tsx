"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import Skeleton from "@/components/_ui/skeleton";
import { Properties, Property } from "@/components/record/properties";
import Timeline from "@/features/timeline/timeline";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import XIcon from "@/public/assets/icons/x.svg";
import LeadContactButtons from "./lead-contact";
import {
  LeadMessage,
  LeadOwnerPicker,
  LeadStatusControl,
  Value,
  When,
  conversionPreview,
  type Lead,
} from "./lead-fields";
import { DemoTag } from "./lead-meta";
import LeadStatusMenu from "./lead-status-menu";
import SlaIndicator from "./sla";
import { useLeadActions } from "./use-lead-actions";

/** Quick look at a lead from the list: triage, contact and convert without leaving it. */
export default function LeadPeek({
  id,
  onClose,
}: {
  id: Id<"leads">;
  onClose: () => void;
}) {
  const lead = useQuery(api.leads.get, { id });

  return (
    <>
      <SheetHeader>
        <SheetTitle>Lead</SheetTitle>
        <SheetDescription className="sr-only">
          Contact details, status and activity for this lead
        </SheetDescription>
        <div className="-mr-2 flex items-center gap-1">
          {lead && (
            <Button
              variant="ghost"
              size="xs"
              href={`/leads/${lead._id}`}
              onClick={onClose}
            >
              Open page
            </Button>
          )}
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <XIcon aria-hidden className="size-3.5" />
            </Button>
          </SheetClose>
        </div>
      </SheetHeader>
      {lead === undefined ? (
        <div aria-busy className="flex flex-col gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <span className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </span>
          </div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : lead === null ? (
        <p className="text-fg-secondary px-6 py-6">
          This lead no longer exists.
        </p>
      ) : (
        <PeekBody key={lead._id} lead={lead} onClose={onClose} />
      )}
    </>
  );
}

function PeekBody({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { setStatus, convert } = useLeadActions();
  const [converting, setConverting] = useState(false);
  const converted = lead.status === "converted";

  async function runConvert() {
    setConverting(true);
    if (await convert(lead)) onClose();
    else setConverting(false);
  }

  return (
    <>
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-6 pt-6 pb-5">
          <div className="flex items-start gap-3.5">
            <Avatar name={lead.name} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h2 className="truncate text-lg leading-6 font-semibold">
                {lead.name}
              </h2>
              <p className="caption-style text-fg-secondary truncate">
                {lead.companyName} · {LEAD_KIND_LABEL[lead.kind]}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
                <LeadStatusControl lead={lead} />
                <SlaIndicator lead={lead} slaMs={lead.slaMs} />
                {lead.demoAt && <DemoTag at={lead.demoAt} />}
              </div>
            </div>
          </div>
          <LeadContactButtons lead={lead} />
        </div>

        <div className="border-border flex flex-col gap-5 border-t px-6 py-5">
          <Properties>
            <Property label="Owner">
              <LeadOwnerPicker lead={lead} />
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
            <Property label="Source">
              <Value>{lead.channel}</Value>
            </Property>
            <Property label="Received">
              <When at={lead._creationTime} />
            </Property>
          </Properties>
          {lead.message && <LeadMessage message={lead.message} />}
          {!converted && (
            <p className="caption-style text-fg-tertiary leading-snug">
              Convert: {conversionPreview(lead)}
            </p>
          )}
        </div>

        <div className="border-border flex flex-col gap-3 border-t px-6 py-5">
          <h3 className="caption-style text-fg-tertiary font-medium">
            Activity
          </h3>
          <Timeline target={{ leadId: lead._id }} />
        </div>
      </div>

      <SheetFooter>
        {converted ? (
          lead.account && (
            <Button
              variant="primary"
              size="sm"
              href={`/accounts/${lead.account._id}`}
              onClick={onClose}
              className="ml-auto max-w-full min-w-0"
            >
              <span className="truncate">Open {lead.account.name}</span>
            </Button>
          )
        ) : (
          <>
            {lead.status === "disqualified" ? (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2.25"
                onClick={() => void setStatus(lead, "nurture")}
              >
                Move to nurture
              </Button>
            ) : (
              <LeadStatusMenu
                status={lead.status}
                disqualifyOnly
                side="top"
                onChange={(status, reason) =>
                  void setStatus(lead, status, reason)
                }
              >
                <Button variant="ghost" size="sm" className="group -ml-2.25">
                  Disqualify
                  <ChevronDownIcon
                    aria-hidden
                    className="duration-base size-2.5 transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </LeadStatusMenu>
            )}
            <Button
              variant="primary"
              size="sm"
              loading={converting}
              onClick={() => void runConvert()}
            >
              Convert
            </Button>
          </>
        )}
      </SheetFooter>
    </>
  );
}
