"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import { MoneyValue } from "@/features/accounts/record-cells";
import {
  type FactorTone,
  HEALTH_BAND_LABEL,
  weakestFactors,
} from "@/lib/domain/health";
import { formatMoney } from "@/lib/domain/money";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import { HealthRing } from "./health-badge";
import { When, type Linked } from "./platform-shared";

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

export function HeaderStrip({
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

export function useSync(accountId: Id<"accounts">) {
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
