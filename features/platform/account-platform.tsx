"use client";

import { useId, useState } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { DetailSection } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import {
  HEALTH_BAND_LABEL,
  weakestFactors,
  type FactorTone,
} from "@/lib/domain/health";
import { formatMoney, type Money } from "@/lib/domain/money";
import {
  CAMPAIGN_STATUS_LABEL,
  type CampaignStatus,
} from "@/lib/domain/platform";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import { HEALTH_TONE, HealthRing } from "./health-badge";

type Linked = Extract<
  FunctionReturnType<typeof api.platform.forAccount>,
  { steps: unknown }
>;
type Campaign = Linked["campaigns"][number];

/** Hypedrive usage and health for a linked account, in the account sidebar and peek. */
export default function AccountPlatform({
  accountId,
  className,
  divider,
}: {
  accountId: Id<"accounts">;
  className?: string;
  divider?: boolean;
}) {
  const data = useQuery(api.platform.forAccount, { accountId });
  const linked = data && data.orgId !== null ? (data as Linked) : null;

  return (
    <DetailSection
      title="Platform"
      className={className}
      divider={divider}
      action={
        linked?.syncMode && (
          <SyncButton accountId={accountId} snapshot={linked.snapshot} />
        )
      }
    >
      {data === undefined ? (
        <div aria-busy className="-mt-2 flex flex-col gap-3 py-1">
          <span className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <span className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-36" />
            </span>
          </span>
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-3 w-40" />
        </div>
      ) : !linked ? (
        <p className="text-fg-tertiary -mt-2 text-sm">Not on Hypedrive yet</p>
      ) : (
        <div className="-mt-2 flex flex-col gap-4">
          <HealthSummary data={linked} />
          <Properties>
            <PlatformDetails data={linked} />
          </Properties>
        </div>
      )}
    </DetailSection>
  );
}

function SyncButton({
  accountId,
  snapshot,
}: {
  accountId: Id<"accounts">;
  snapshot: Linked["snapshot"];
}) {
  const syncNow = useAction(api.platformSync.syncNow);
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const result = await syncNow({ accountId });
      if (!result.ok) {
        toast(result.error, { tone: "danger" });
        return;
      }
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

  return (
    <Tooltip
      content={
        snapshot
          ? `Last synced ${dateTime(snapshot.fetchedAt)}${snapshot.source === "sandbox" ? " (sandbox)" : ""}`
          : "Read balance, campaigns, listings and team from Hypedrive"
      }
    >
      <Button
        variant="ghost"
        size="xs"
        loading={busy}
        onClick={() => void sync()}
      >
        Sync now
      </Button>
    </Tooltip>
  );
}

const FACTOR_DOT: Record<FactorTone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
};

function HealthSummary({ data }: { data: Linked }) {
  const { health } = data;
  const weak = weakestFactors(health);
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <section aria-label="Account health" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center">
          <HealthRing
            score={health.score}
            band={health.band}
            size={44}
            stroke={4}
            className="absolute inset-0"
          />
          <span className="text-sm font-semibold tabular-nums">
            {health.score}
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="lead-style font-medium">Health</span>
            <Tag tone={HEALTH_TONE[health.band]} size="xs">
              {HEALTH_BAND_LABEL[health.band]}
            </Tag>
          </span>
          <span className="caption-style text-fg-tertiary truncate">
            {weak.length
              ? `Weakest: ${weak.map((factor) => factor.label.toLowerCase()).join(", ")}`
              : "Every factor looks good"}
          </span>
        </span>
      </div>

      <ul
        id={listId}
        aria-label="Health factors"
        className={cn("flex flex-col gap-1.5", !open && "sr-only")}
      >
        {health.factors.map((factor) => (
          <li
            key={factor.id}
            className="caption-style grid grid-cols-[0.375rem_6.5rem_minmax(0,1fr)_auto] items-center gap-2"
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", FACTOR_DOT[factor.tone])}
            />
            <span className="text-fg-secondary truncate">{factor.label}</span>
            <span className="text-fg-tertiary truncate" title={factor.detail}>
              {factor.detail}
            </span>
            <span className="text-fg-tertiary tabular-nums">
              {Math.round(factor.points)}/{factor.weight}
            </span>
          </li>
        ))}
      </ul>
      <Button
        variant="link"
        size="none"
        aria-expanded={open}
        aria-controls={listId}
        className="caption-style text-fg-secondary self-start"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide factors" : "How it's scored"}
      </Button>

      {health.signals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="caption-style text-fg-tertiary">
            Expansion signals
          </span>
          <span className="flex flex-wrap gap-1">
            {health.signals.map((signal) => (
              <Tooltip key={signal.id} content={signal.detail}>
                <Tag tone="green" size="xs" tabIndex={0}>
                  {signal.label}
                </Tag>
              </Tooltip>
            ))}
          </span>
        </div>
      )}
    </section>
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
];

const STATUS_TONE: Partial<
  Record<CampaignStatus, Parameters<typeof Tag>[0]["tone"]>
> = {
  live: "green",
  paused: "amber",
  changes_requested: "amber",
  pending_review: "blue",
  scheduled: "blue",
  ended: "neutral",
};

function campaignTitle(campaign: Campaign) {
  return campaign.title || "Untitled campaign";
}

function Campaigns({ campaigns }: { campaigns: Campaign[] }) {
  const open = campaigns
    .filter((item) => item.status !== "archived" && item.status !== "discarded")
    .sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
    );
  if (open.length === 0) {
    return <span className="text-fg-tertiary text-sm">None yet</span>;
  }
  const shown = open.slice(0, 4);
  return (
    <ul className="flex w-full min-w-0 flex-col gap-1.5 py-1.5">
      {shown.map((campaign) => {
        const status = campaign.status as CampaignStatus;
        const starved =
          status === "paused" && campaign.pauseReason === "insufficient_funds";
        return (
          <li
            key={campaign.id}
            className="flex min-w-0 items-center justify-between gap-2 text-sm"
          >
            <span className="truncate" title={campaignTitle(campaign)}>
              {campaignTitle(campaign)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {campaign.fillPct !== null && status !== "ended" && (
                <span className="caption-style text-fg-tertiary tabular-nums">
                  {Math.round(campaign.fillPct)}%
                </span>
              )}
              <Tag
                tone={starved ? "red" : (STATUS_TONE[status] ?? "neutral")}
                size="xs"
                title={
                  starved
                    ? "Paused for insufficient funds; it won't resume on its own"
                    : undefined
                }
              >
                {starved
                  ? "No funds"
                  : (CAMPAIGN_STATUS_LABEL[status] ?? status)}
              </Tag>
            </span>
          </li>
        );
      })}
      {open.length > shown.length && (
        <li className="caption-style text-fg-tertiary">
          +{open.length - shown.length} more
        </li>
      )}
    </ul>
  );
}

const money = (value: Money) => formatMoney(value);

function PlatformDetails({ data }: { data: Linked }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.orgId);
      toast("Org ID copied");
    } catch {
      toast("Couldn't copy the org ID", { tone: "danger" });
    }
  }

  const { wallet, snapshot } = data;
  const walletTone =
    wallet.status === "negative"
      ? "text-danger"
      : wallet.status === "low"
        ? "text-warning"
        : undefined;

  return (
    <>
      <Property label="Balance">
        {wallet.balance ? (
          <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
            <span className={cn("tabular-nums", walletTone)}>
              {money(wallet.balance)}
            </span>
            {wallet.held && wallet.held.amount > 0 && (
              <span className="caption-style text-fg-tertiary truncate">
                {money(wallet.held)} held
              </span>
            )}
          </span>
        ) : (
          <span className={cn("text-sm", walletTone ?? "text-fg-tertiary")}>
            {wallet.status === "negative"
              ? "Negative"
              : wallet.status === "low"
                ? "Low"
                : "Not synced yet"}
          </span>
        )}
      </Property>
      <Property label="Deposits">
        {data.topups > 0 ? (
          <Tooltip
            content={`${money(data.deposits30d)} in the last 30 days · ${money(data.deposits90d)} in 90`}
          >
            <span
              tabIndex={0}
              className="flex min-w-0 items-baseline gap-1.5 rounded-sm text-sm"
            >
              <span className="tabular-nums">{money(data.deposits)}</span>
              <span className="caption-style text-fg-tertiary truncate">
                {data.topups === 1 ? "1 deposit" : `${data.topups} deposits`}
              </span>
            </span>
          </Tooltip>
        ) : (
          <span className="text-fg-tertiary text-sm">None yet</span>
        )}
      </Property>
      <Property label="Campaigns">
        <Campaigns campaigns={data.campaigns} />
      </Property>
      <Property label="Reviews waiting">
        <span
          className={cn(
            "text-sm tabular-nums",
            data.reviews.count === 0 && "text-fg-tertiary",
            (data.reviews.oldestDays ?? 0) >= 14 && "text-danger",
          )}
        >
          {data.reviews.count === 0
            ? "None"
            : `${data.reviews.count}, oldest ${data.reviews.oldestDays ?? 3} days`}
        </span>
      </Property>
      {data.disputes > 0 && (
        <Property label="Disputes">
          <span className="text-warning text-sm tabular-nums">
            {data.disputes} open
          </span>
        </Property>
      )}
      <Property label="Marketplaces">
        {data.marketplaces.length ? (
          <span className="flex min-w-0 flex-wrap gap-1 py-1.5">
            {data.marketplaces.map((market) => (
              <Tag
                key={market.slug}
                size="xs"
                title={`${market.count} ${market.count === 1 ? "listing" : "listings"}`}
              >
                {market.label}
                <span className="text-fg-tertiary">{market.count}</span>
              </Tag>
            ))}
          </span>
        ) : (
          <span className="text-fg-tertiary text-sm">No listings yet</span>
        )}
      </Property>
      {data.members !== null && (
        <Property label="Team">
          <span className="text-sm tabular-nums">
            {data.members} {data.members === 1 ? "member" : "members"}
          </span>
        </Property>
      )}
      <Property label="Last seen">
        {data.lastEventAt ? (
          <time
            dateTime={new Date(data.lastEventAt).toISOString()}
            title={dateTime(data.lastEventAt)}
            className="text-sm"
          >
            {relativeTime(data.lastEventAt)}
          </time>
        ) : (
          <span className="text-fg-tertiary text-sm">—</span>
        )}
      </Property>
      {data.syncMode && (
        <Property label="Synced">
          {snapshot ? (
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <time
                dateTime={new Date(snapshot.fetchedAt).toISOString()}
                title={dateTime(snapshot.fetchedAt)}
                className={cn(snapshot.error && "text-warning")}
              >
                {relativeTime(snapshot.fetchedAt)}
              </time>
              {snapshot.source === "sandbox" && (
                <Tag size="xs" title="PLATFORM_SANDBOX is on: local test data">
                  Sandbox
                </Tag>
              )}
              {snapshot.error && (
                <Tooltip content={`Last sync failed: ${snapshot.error}`}>
                  <span tabIndex={0} className="caption-style text-warning">
                    Stale
                  </span>
                </Tooltip>
              )}
            </span>
          ) : (
            <span className="text-fg-tertiary text-sm">Never</span>
          )}
        </Property>
      )}
      <Property
        label="Org ID"
        action={
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
        }
      >
        <span
          title={data.orgId}
          className="text-fg-secondary truncate font-mono text-xs"
        >
          {data.orgId}
        </span>
      </Property>
    </>
  );
}
