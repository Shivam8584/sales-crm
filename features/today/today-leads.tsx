"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import { DemoTag } from "@/features/leads/lead-meta";
import SlaIndicator from "@/features/leads/sla";

const VISIBLE = 5;

/** The viewer's new leads with their speed-to-lead clock; hidden when there are none. */
export default function TodayLeads() {
  const data = useQuery(api.leads.waiting, {});
  if (!data || data.leads.length === 0) return null;
  const { leads, slaMs } = data;

  return (
    <section
      aria-labelledby="today-leads-title"
      className="flex flex-col gap-3"
    >
      <div className="flex h-7 items-center gap-2">
        <h2 id="today-leads-title" className="lead-style font-medium">
          Leads waiting on you
        </h2>
        <span className="caption-style text-fg-tertiary tabular-nums">
          {leads.length}
        </span>
        <Link
          href="/leads?owner=mine"
          className="caption-style text-fg-tertiary hover:text-foreground focus-visible:ring-ring ml-auto rounded-sm outline-none focus-visible:ring-2"
        >
          {leads.length > VISIBLE ? `See all ${leads.length}` : "All leads"}
        </Link>
      </div>
      <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-xl border">
        {leads.slice(0, VISIBLE).map((lead) => (
          <li key={lead._id}>
            <Link
              href={`/leads?lead=${lead._id}`}
              className="hover:bg-overlay-1 focus-visible:bg-overlay-1 duration-fast flex items-center gap-3 px-3 py-2.5 transition-colors outline-none"
            >
              <Avatar name={lead.name} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="lead-style truncate leading-snug font-medium">
                  {lead.name}
                </span>
                <span className="caption-style text-fg-tertiary truncate">
                  {lead.companyName} · {LEAD_KIND_LABEL[lead.kind]}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                {lead.demoAt && <DemoTag at={lead.demoAt} />}
                <SlaIndicator lead={lead} slaMs={slaMs} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
