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
import { DetailHero, DetailSection } from "@/components/record/detail";
import { PeekSkeleton } from "@/features/accounts/account-peek";
import Timeline from "@/features/timeline/timeline";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import XIcon from "@/public/assets/icons/x.svg";
import { LeadStatusControl, type Lead } from "./lead-fields";
import { DemoTag, SourceTag } from "./lead-meta";
import {
  LeadAttribution,
  LeadConsent,
  LeadConversion,
  LeadDetails,
  LeadMessageSection,
  LeadSummary,
  SpeedToLead,
} from "./lead-sections";
import LeadStatusMenu from "./lead-status-menu";
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
        <div className="flex min-w-0 items-center gap-2">
          <TargetIcon aria-hidden className="text-icon size-3.5 shrink-0" />
          <SheetTitle>Lead details</SheetTitle>
        </div>
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
              <ArrowRightIcon aria-hidden className="size-3" />
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
        <PeekSkeleton />
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
        <LeadHero lead={lead} />
        <LeadSummary lead={lead} />
        <SpeedToLead lead={lead} />
        <LeadDetails lead={lead} />
        {lead.message && <LeadMessageSection message={lead.message} />}
        <LeadConversion lead={lead} onNavigate={onClose} />
        <LeadAttribution lead={lead} />
        <LeadConsent lead={lead} />
        <DetailSection title="Recent activity" divider={false}>
          <Timeline target={{ leadId: lead._id }} compact />
        </DetailSection>
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

/** Avatar, name, status, source and demo, then the company. */
function LeadHero({ lead }: { lead: Lead }) {
  return (
    <DetailHero
      visual={<Avatar name={lead.name} size="xl" />}
      title={lead.name}
    >
      <LeadStatusControl lead={lead} />
      <SourceTag utm={lead.utm} channel={lead.channel} />
      {lead.demoAt && <DemoTag at={lead.demoAt} />}
      <span className="caption-style text-fg-secondary basis-full truncate">
        {lead.companyName} · {LEAD_KIND_LABEL[lead.kind]}
      </span>
    </DetailHero>
  );
}
