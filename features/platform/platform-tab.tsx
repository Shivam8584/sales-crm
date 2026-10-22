"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import EmptyState from "@/components/_ui/empty-state";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { MoneyValue } from "@/features/accounts/record-cells";
import {
  HEALTH_BAND_LABEL,
  weakestFactors,
  type FactorTone,
} from "@/lib/domain/health";
import { formatMoney, type Money } from "@/lib/domain/money";
import {
  CAMPAIGN_STATUS_LABEL,
  ORG_ROLE_TITLE,
  type CampaignStatus,
} from "@/lib/domain/platform";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import { HealthRing } from "./health-badge";
import { routes } from "@/lib/routes";

type Data = FunctionReturnType<typeof api.account360.platform>;
type Linked = Extract<Data, { linked: true }>;
type Campaign = Linked["campaigns"][number];

/** The account's life on Hypedrive: health, wallet, campaigns, deposits, listings, team and events. */
export default function PlatformTab({
  accountId,
  accountName,
}: {
  accountId: Id<"accounts">;
  accountName: string;
}) {
  const data = useQuery(api.account360.platform, { accountId });
  if (data === undefined) return <PlatformSkeleton />;
  if (!data.linked) {
    return (
      <LinkOrg
        accountId={accountId}
        accountName={accountName}
        canSync={data.syncMode !== null}
      />
    );
  }
  return <PlatformView accountId={accountId} data={data} />;
}

function PlatformView({
  accountId,
  data,
}: {
  accountId: Id<"accounts">;
  data: Linked;
}) {
  return (
    <div className="flex flex-col gap-10">
      <HeaderStrip accountId={accountId} data={data} />
      <Campaigns campaigns={data.campaigns} />
      <Deposits deposits={data.deposits} />
      <div className="grid gap-10 md:grid-cols-2 md:gap-8">
        <Listings listings={data.listings} />
        <Team members={data.members} />
      </div>
      <Events events={data.events} />
    </div>
  );
}

function Section({
  title,
  count,
  meta,
  action,
  children,
}: {
  title: string;
  count?: number;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-4">
      <div className="min-h-control-md flex items-center justify-between gap-3">
        <h3 className="text-fg-secondary flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">{title}</span>
          {count !== undefined && count > 0 && <CountBadge>{count}</CountBadge>}
        </h3>
        {meta && (
          <span className="caption-style text-fg-tertiary min-w-0 truncate">
            {meta}
          </span>
        )}
        {action}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-fg-tertiary text-sm leading-snug">{children}</p>;
}

function When({ at, className }: { at: number; className?: string }) {
  return (
    <Tooltip content={dateTime(at)}>
      <time
        tabIndex={0}
        dateTime={new Date(at).toISOString()}
        className={cn("rounded-sm tabular-nums", className)}
      >
        {relativeTime(at)}
      </time>
    </Tooltip>
  );
}

const FACTOR_DOT: Record<FactorTone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
};

const WALLET_TONE = {
  ok: undefined,
  low: "text-warning",
  negative: "text-danger",
} as const;

function HeaderStrip({
  accountId,
  data,
}: {
  accountId: Id<"accounts">;
  data: Linked;
}) {
  const { health, wallet, snapshot } = data;
  const weak = weakestFactors(health, 3);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3.5">
            <span className="relative grid size-14 shrink-0 place-items-center">
              <HealthRing
                score={health.score}
                band={health.band}
                size={56}
                stroke={5}
                className="absolute inset-0"
              />
              <span className="font-display text-lg font-medium tabular-nums">
                {health.score}
              </span>
            </span>
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium">
                Health · {HEALTH_BAND_LABEL[health.band]}
              </span>
              <span className="caption-style text-fg-tertiary">
                {health.score} of 100 from six usage factors
              </span>
            </span>
          </div>
          <ul aria-label="Top factors" className="flex flex-col gap-2">
            {(weak.length ? weak : health.factors.slice(0, 1)).map((factor) => (
              <li
                key={factor.id}
                className="caption-style grid grid-cols-[0.375rem_minmax(0,auto)_minmax(0,1fr)] items-center gap-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    FACTOR_DOT[weak.length ? factor.tone : "good"],
                  )}
                />
                <span className="text-fg-secondary truncate">
                  {weak.length ? factor.label : "Every factor looks good"}
                </span>
                {weak.length > 0 && (
                  <span
                    className="text-fg-tertiary truncate"
                    title={factor.detail}
                  >
                    {factor.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {health.signals.length > 0 && (
            <ul className="caption-style text-fg-secondary flex flex-wrap gap-x-3 gap-y-1">
              {health.signals.map((signal) => (
                <li key={signal.id}>
                  <Tooltip content={signal.detail}>
                    <span tabIndex={0} className="rounded-sm">
                      {signal.label}
                    </span>
                  </Tooltip>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-fg-secondary text-sm font-medium">Wallet</span>
          {wallet.balance ? (
            <span
              className={cn(
                "font-display text-2xl leading-none font-medium",
                WALLET_TONE[wallet.status],
              )}
            >
              <MoneyValue totals={[wallet.balance]} />
            </span>
          ) : (
            <span
              className={cn(
                "text-sm",
                WALLET_TONE[wallet.status] ?? "text-fg-tertiary",
              )}
            >
              {wallet.status === "negative"
                ? "Negative balance"
                : wallet.status === "low"
                  ? "Balance low"
                  : "Not synced yet"}
            </span>
          )}
          <dl className="caption-style grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
            <dt className="text-fg-tertiary">Held</dt>
            <dd className="text-fg-secondary truncate tabular-nums">
              {wallet.held ? formatMoney(wallet.held) : "—"}
            </dd>
            <dt className="text-fg-tertiary">Credit</dt>
            <dd className="text-fg-secondary truncate tabular-nums">
              {wallet.creditLimit && wallet.creditLimit.amount > 0
                ? `${formatMoney(wallet.creditLimit)} limit`
                : wallet.paymentMode === "postpaid"
                  ? "Postpaid, no limit"
                  : wallet.paymentMode
                    ? "Prepaid"
                    : "—"}
            </dd>
          </dl>
        </div>

        <SyncCell accountId={accountId} data={data} snapshot={snapshot} />
      </div>
      <OrgFooter accountId={accountId} orgId={data.orgId} />
    </div>
  );
}

function SyncCell({
  accountId,
  data,
  snapshot,
}: {
  accountId: Id<"accounts">;
  data: Linked;
  snapshot: Linked["snapshot"];
}) {
  const sync = useSync(accountId);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <span className="text-fg-secondary text-sm font-medium">Last synced</span>
      {snapshot ? (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <When
            at={snapshot.fetchedAt}
            className={cn(snapshot.error && "text-warning")}
          />
          {snapshot.source === "sandbox" && (
            <Tooltip content="PLATFORM_SANDBOX is on: data derived from local events">
              <span tabIndex={0} className="text-fg-tertiary rounded-sm">
                Sandbox
              </span>
            </Tooltip>
          )}
        </span>
      ) : (
        <span className="text-fg-tertiary text-sm">Never</span>
      )}
      {snapshot?.error ? (
        <p className="caption-style text-warning leading-snug">
          Last attempt failed
          {snapshot.attemptedAt &&
            ` ${relativeTime(snapshot.attemptedAt)}`}: {snapshot.error}
        </p>
      ) : (
        <p className="caption-style text-fg-tertiary leading-snug">
          {data.syncMode
            ? "Balance, campaigns, listings and team refresh nightly."
            : "Sync is off. An admin can set it up in Settings → Integrations."}
        </p>
      )}
      {data.syncMode && (
        <Button
          variant="secondary"
          size="xs"
          className="mt-auto self-start"
          loading={sync.busy}
          onClick={() => void sync.run()}
        >
          Sync now
        </Button>
      )}
    </div>
  );
}

function useSync(accountId: Id<"accounts">) {
  const syncNow = useAction(api.platformSync.syncNow);
  const [busy, setBusy] = useState(false);
  async function run(quiet = false) {
    setBusy(true);
    try {
      const result = await syncNow({ accountId });
      if (!result.ok) {
        toast(result.error, { tone: "danger" });
        return;
      }
      if (quiet) return;
      toast(
        result.peopleAdded
          ? `Synced from Hypedrive · ${result.peopleAdded} new ${result.peopleAdded === 1 ? "person" : "people"} from their team`
          : "Synced from Hypedrive",
      );
    } catch (error) {
      toast(readError(error, "Couldn't sync from Hypedrive").message, {
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

function OrgFooter({
  accountId,
  orgId,
}: {
  accountId: Id<"accounts">;
  orgId: string;
}) {
  const link = useMutation(api.account360.linkOrg);
  const sync = useSync(accountId);

  async function copy() {
    try {
      await navigator.clipboard.writeText(orgId);
      toast("Org ID copied");
    } catch {
      toast("Couldn't copy the org ID", { tone: "danger" });
    }
  }

  async function relink(previous: string | null) {
    try {
      await link({ accountId, orgId: previous });
      if (previous) await sync.run(true);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function unlink() {
    try {
      const { previous } = await link({ accountId, orgId: null });
      toast("Unlinked from Hypedrive", () => void relink(previous));
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  return (
    <div className="caption-style text-fg-tertiary flex min-w-0 items-center gap-2">
      <span className="shrink-0">Organisation</span>
      <span
        title={orgId}
        className="text-fg-secondary min-w-0 truncate font-mono text-[11px]"
      >
        {orgId}
      </span>
      <Tooltip content="Copy org ID">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy org ID"
          onClick={() => void copy()}
        >
          <ClipboardIcon aria-hidden className="size-3" />
        </Button>
      </Tooltip>
      <Button
        variant="ghost"
        size="xs"
        className="ml-auto shrink-0"
        onClick={() => void unlink()}
      >
        Unlink
      </Button>
    </div>
  );
}

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

function Campaigns({ campaigns }: { campaigns: Campaign[] }) {
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

const WEEK_LABEL = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

function Deposits({ deposits }: { deposits: Linked["deposits"] }) {
  const peak = Math.max(...deposits.weeks.map((week) => week.amount.amount));
  const stats: { label: string; value: Money; caption: string }[] = [
    {
      label: "Last 30 days",
      value: deposits.last30,
      caption: "Top-ups and transfers",
    },
    {
      label: "Last 90 days",
      value: deposits.last90,
      caption: `${deposits.count90} ${deposits.count90 === 1 ? "deposit" : "deposits"}`,
    },
    {
      label: "All time",
      value: deposits.lifetime,
      caption: `${deposits.lifetimeCount} ${deposits.lifetimeCount === 1 ? "deposit" : "deposits"}`,
    },
  ];
  const first = deposits.weeks[0];
  const middle = deposits.weeks[Math.floor(deposits.weeks.length / 2)];
  return (
    <Section title="Deposits">
      <div className="grid gap-6 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-8">
        <dl className="grid grid-cols-3 gap-4 md:grid-cols-1 md:gap-5">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col gap-2">
              <dt className="caption-style text-fg-tertiary truncate">
                {stat.label}
              </dt>
              <dd className="flex min-w-0 flex-col gap-1.5">
                <span className="font-display text-lg leading-none font-medium">
                  <MoneyValue totals={[stat.value]} />
                </span>
                <span className="caption-style text-fg-tertiary truncate">
                  {stat.caption}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <figure className="flex min-w-0 flex-col gap-2">
          <figcaption className="caption-style text-fg-tertiary flex items-center justify-between gap-2">
            <span>Weekly, last 12 weeks</span>
            {peak > 0 && (
              <span className="tabular-nums">
                Peak{" "}
                {formatMoney(
                  { amount: peak, currency: "INR" },
                  { compact: true },
                )}
              </span>
            )}
          </figcaption>
          <div
            role="list"
            aria-label="Deposits per week"
            className="border-border flex h-32 items-end gap-1 border-b pb-px sm:gap-1.5"
          >
            {deposits.weeks.map((week) => {
              const height = peak ? (week.amount.amount / peak) * 100 : 0;
              const label = `Week of ${WEEK_LABEL.format(week.start)}: ${
                week.count
                  ? `${formatMoney(week.amount)} in ${week.count} ${week.count === 1 ? "deposit" : "deposits"}`
                  : "no deposits"
              }`;
              return (
                <Tooltip key={week.start} content={label}>
                  <span
                    role="listitem"
                    tabIndex={0}
                    aria-label={label}
                    className="group/bar focus-visible:ring-ring flex h-full min-w-0 flex-1 items-end rounded-xs outline-none focus-visible:ring-2"
                  >
                    <span
                      className={cn(
                        "duration-fast w-full rounded-t-[3px] transition-colors",
                        week.count
                          ? "bg-success/80 group-hover/bar:bg-success"
                          : "bg-overlay-3",
                      )}
                      style={{
                        height: week.count ? `max(${height}%, 4px)` : "2px",
                      }}
                    />
                  </span>
                </Tooltip>
              );
            })}
          </div>
          <div className="caption-style text-fg-tertiary flex justify-between tabular-nums">
            <span>{WEEK_LABEL.format(first.start)}</span>
            <span>{WEEK_LABEL.format(middle.start)}</span>
            <span>This week</span>
          </div>
        </figure>
      </div>
    </Section>
  );
}

function Listings({ listings }: { listings: Linked["listings"] }) {
  const total = listings.reduce((sum, item) => sum + item.count, 0);
  return (
    <Section
      title="Listings"
      count={total}
      meta={
        listings.length > 0 &&
        `${listings.length} ${listings.length === 1 ? "marketplace" : "marketplaces"}`
      }
    >
      {listings.length === 0 ? (
        <Muted>No products listed on Hypedrive yet.</Muted>
      ) : (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {listings.map((market) => (
            <li key={market.slug}>
              <Tooltip
                content={`${market.count} ${market.count === 1 ? "listing" : "listings"} · first ${shortDate(market.firstAt)}, latest ${shortDate(market.latestAt)}`}
              >
                <span
                  tabIndex={0}
                  className="focus-visible:ring-ring flex items-baseline gap-1.5 rounded-sm outline-none focus-visible:ring-2"
                >
                  {market.label}
                  <span className="text-fg-tertiary tabular-nums">
                    {market.count}
                  </span>
                  {market.newMarketplace && (
                    <span className="text-success caption-style">New</span>
                  )}
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Team({ members }: { members: Linked["members"] }) {
  return (
    <Section title="Platform team" count={members.length}>
      {members.length === 0 ? (
        <Muted>Their Hypedrive team appears here after the first sync.</Muted>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {members.map((member) => {
            const name =
              member.person?.name ?? member.name ?? member.email ?? "Unnamed";
            const role = ORG_ROLE_TITLE[member.role] ?? member.role;
            return (
              <li
                key={member.userId}
                className="flex min-h-13 items-center gap-3 py-2"
              >
                <Avatar name={name} size="md" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {member.person ? (
                    <Link
                      href={routes.person(member.person._id)}
                      className="lead-style focus-visible:ring-ring truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="lead-style truncate font-medium">
                      {name}
                    </span>
                  )}
                  <span
                    className="caption-style text-fg-tertiary truncate"
                    title={member.email ?? undefined}
                  >
                    {[
                      member.email,
                      !member.person && "Not in the CRM",
                      member.person &&
                        !member.person.onAccount &&
                        "On another account",
                      member.joinedAt && `joined ${shortDate(member.joinedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className="caption-style text-fg-tertiary shrink-0"
                  title={
                    member.roles.length > 1
                      ? member.roles
                          .map(
                            (item) =>
                              ORG_ROLE_TITLE[
                                item as keyof typeof ORG_ROLE_TITLE
                              ] ?? item,
                          )
                          .join(", ")
                      : undefined
                  }
                >
                  {role}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const EVENT_DOT = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  neutral: "bg-fg-tertiary",
} as const;

function Events({ events }: { events: Linked["events"] }) {
  return (
    <Section
      title="Recent platform events"
      meta={events.length > 0 && `Latest ${events.length}`}
    >
      {events.length === 0 ? (
        <Muted>
          Nothing reported yet. Sign-ups, top-ups and campaign changes appear
          here as the platform sends them.
        </Muted>
      ) : (
        <ol className="flex flex-col">
          {events.map((event) => (
            <li key={event._id} className="flex gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-[0.4rem] size-1.5 shrink-0 rounded-full",
                  EVENT_DOT[event.tone],
                )}
              />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-3">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm">{event.title}</span>
                  {event.detail && (
                    <span
                      className="caption-style text-fg-tertiary truncate leading-snug"
                      title={event.detail}
                    >
                      {event.detail}
                    </span>
                  )}
                </span>
                <When
                  at={event.occurredAt}
                  className="caption-style text-fg-tertiary shrink-0"
                />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** Mirrors the server check so a typo doesn't round-trip. */
const ORG_ID = /^org_[0-9a-z]{26}$/;

function LinkOrg({
  accountId,
  accountName,
  canSync,
}: {
  accountId: Id<"accounts">;
  accountName: string;
  canSync: boolean;
}) {
  const link = useMutation(api.account360.linkOrg);
  const sync = useSync(accountId);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ORG_ID.test(value.trim().toLowerCase())) {
      setError(
        "That isn't a Hypedrive organisation ID. It starts with org_ and has 26 more letters and digits.",
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { previous } = await link({ accountId, orgId: value });
      toast(
        `${accountName} linked to Hypedrive`,
        () => void link({ accountId, orgId: previous }),
      );
      if (canSync) await sync.run(true);
    } catch (caught) {
      const read = readError(caught, "Couldn't link the organisation");
      setError(read.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <EmptyState
        title="Link to a Hypedrive organisation"
        description="Paste the organisation ID from Hypedrive admin to see this brand's health, wallet, campaigns and team here."
        action={
          <form
            onSubmit={(event) => void submit(event)}
            className="flex w-full max-w-md flex-col gap-3 text-left sm:flex-row sm:items-start"
          >
            <Field
              label="Organisation ID"
              htmlFor="platform-org-id"
              error={error}
              className="min-w-0 flex-1 [&_label]:sr-only"
            >
              <Input
                id="platform-org-id"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(undefined);
                }}
                placeholder="org_01jc…"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "platform-org-id-error" : undefined}
                className="font-mono text-xs"
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="control"
              className="h-9 px-3.5"
              loading={busy}
              disabled={!value.trim()}
            >
              Link organisation
            </Button>
          </form>
        }
        className="py-12"
      />
    </div>
  );
}

function PlatformSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-10">
      <Skeleton className="h-52 w-full rounded-xl md:h-36" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    </div>
  );
}
