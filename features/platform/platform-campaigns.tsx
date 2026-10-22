"use client";

import Tooltip from "@/components/_ui/tooltip";
import {
  CAMPAIGN_STATUS_LABEL,
  type CampaignStatus,
} from "@/lib/domain/platform";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Muted, Section, type Campaign } from "./platform-shared";

const STATUS_ORDER: string[] = [
  "paused",
  "live",
  "changes_requested",
  "pending_review",
  "scheduled",
  "draft",
  "ended",
  "rejected",
  "archived",
  "discarded",
];

const STATUS_TEXT: Partial<Record<CampaignStatus, string>> = {
  live: "text-success",
  paused: "text-warning",
  changes_requested: "text-warning",
  rejected: "text-danger",
};

function CampaignStatusTag({ campaign }: { campaign: Campaign }) {
  const status = campaign.status as CampaignStatus;
  const label = CAMPAIGN_STATUS_LABEL[status] ?? campaign.status;
  if (status === "paused" && campaign.pauseReason) {
    const starved = campaign.pauseReason === "insufficient_funds";
    return (
      <Tooltip
        content={
          starved
            ? "Paused automatically when the wallet ran out. It won't resume on its own after a top-up."
            : "Paused by the brand"
        }
      >
        <span
          tabIndex={0}
          className={cn("rounded-sm", starved ? "text-danger" : "text-warning")}
        >
          {starved ? "Paused · no funds" : "Paused by brand"}
        </span>
      </Tooltip>
    );
  }
  return (
    <span className={STATUS_TEXT[status] ?? "text-fg-secondary"}>{label}</span>
  );
}

function Fill({ campaign }: { campaign: Campaign }) {
  if (campaign.fillPct === null) {
    return <span className="text-fg-tertiary">—</span>;
  }
  return <span className="tabular-nums">{Math.round(campaign.fillPct)}%</span>;
}

function Enrolled({ campaign }: { campaign: Campaign }) {
  if (campaign.enrolled === null) {
    return <span className="text-fg-tertiary">Not synced</span>;
  }
  return (
    <span className="flex flex-col items-end gap-1 tabular-nums">
      <span>
        {campaign.enrolled}
        {campaign.max !== null && (
          <span className="text-fg-tertiary">/{campaign.max}</span>
        )}
      </span>
      <span className="caption-style text-fg-tertiary">
        {campaign.approved ?? 0} approved
      </span>
    </span>
  );
}

function endAt(campaign: Campaign) {
  if (campaign.endedAt) return campaign.endedAt;
  return campaign.endDate
    ? Date.parse(`${campaign.endDate}T00:00:00+05:30`)
    : null;
}

function Dates({ campaign }: { campaign: Campaign }) {
  const start = campaign.startedAt;
  const end = endAt(campaign);
  if (!start && !end) {
    return campaign.submittedAt ? (
      <span className="text-fg-secondary">
        Submitted {shortDate(campaign.submittedAt)}
      </span>
    ) : (
      <span className="text-fg-tertiary">—</span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      <span className={cn(!start && "text-fg-tertiary")}>
        {start ? shortDate(start) : "Not started"}
      </span>
      <span aria-hidden className="text-fg-tertiary">
        →
      </span>
      <span className="sr-only">to</span>
      <span className={cn(!end && "text-fg-tertiary")}>
        {end ? shortDate(end) : "No end date"}
      </span>
    </span>
  );
}

function Reviews({ campaign }: { campaign: Campaign }) {
  if (campaign.staleReviews === 0) {
    return <span className="text-fg-tertiary">—</span>;
  }
  const days = campaign.oldestReviewDays ?? 3;
  return (
    <Tooltip content={`Oldest has waited ${days} days`}>
      <span
        tabIndex={0}
        className={cn(
          "rounded-sm tabular-nums",
          days >= 14 ? "text-danger" : "text-warning",
        )}
      >
        {campaign.staleReviews} · {days}d
      </span>
    </Tooltip>
  );
}

export function Campaigns({ campaigns }: { campaigns: Campaign[] }) {
  const sorted = [...campaigns].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      (b.startedAt ?? b.submittedAt ?? 0) - (a.startedAt ?? a.submittedAt ?? 0),
  );
  const live = campaigns.filter((item) => item.status === "live").length;
  return (
    <Section
      title="Campaigns"
      count={campaigns.length}
      meta={campaigns.length > 0 && `${live} live`}
    >
      {sorted.length === 0 ? (
        <Muted>
          No campaigns yet. Once the brand submits one on Hypedrive it shows up
          here with its fill and review backlog.
        </Muted>
      ) : (
        <>
          <div className="max-sm:hidden">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">Campaigns on Hypedrive</caption>
              <thead>
                <tr className="caption-style text-fg-tertiary h-9 text-left">
                  <th scope="col" className="px-3 font-normal">
                    Campaign
                  </th>
                  <th scope="col" className="w-34 px-3 font-normal">
                    Status
                  </th>
                  <th scope="col" className="w-34 px-3 font-normal">
                    Fill
                  </th>
                  <th scope="col" className="w-24 px-3 text-right font-normal">
                    Enrolled
                  </th>
                  <th
                    scope="col"
                    className="w-28 px-3 text-right font-normal whitespace-nowrap"
                  >
                    <Tooltip content="Creator results waiting 3+ days for the brand's review">
                      <span tabIndex={0} className="rounded-sm">
                        Stale reviews
                      </span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {sorted.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className={cn(
                      "h-13",
                      (campaign.status === "archived" ||
                        campaign.status === "ended") &&
                        "text-fg-secondary",
                    )}
                  >
                    <th scope="row" className="px-3 text-left font-normal">
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="truncate" title={campaign.title}>
                          {campaign.title}
                        </span>
                        <span className="caption-style text-fg-tertiary">
                          <Dates campaign={campaign} />
                        </span>
                      </span>
                    </th>
                    <td className="px-3">
                      <CampaignStatusTag campaign={campaign} />
                    </td>
                    <td className="px-3">
                      <Fill campaign={campaign} />
                    </td>
                    <td className="px-3 text-right">
                      <Enrolled campaign={campaign} />
                    </td>
                    <td className="px-3 text-right">
                      <Reviews campaign={campaign} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-border flex flex-col divide-y sm:hidden">
            {sorted.map((campaign) => (
              <li
                key={campaign.id}
                className="flex flex-col gap-3 py-3.5 text-sm"
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium">{campaign.title}</span>
                  <CampaignStatusTag campaign={campaign} />
                </span>
                <span className="flex items-center justify-between gap-3">
                  <Fill campaign={campaign} />
                  <Enrolled campaign={campaign} />
                </span>
                <span className="caption-style text-fg-secondary flex items-center justify-between gap-3">
                  <Dates campaign={campaign} />
                  {campaign.staleReviews > 0 && (
                    <span className="flex items-center gap-1">
                      Stale <Reviews campaign={campaign} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
