"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Tooltip from "@/components/_ui/tooltip";
import { HEALTH_BAND_LABEL, weakestFactors } from "@/lib/domain/health";
import { formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import { HealthRing } from "./health-badge";
import { routes } from "@/lib/routes";

type Linked = Extract<
  FunctionReturnType<typeof api.platform.forAccount>,
  { steps: unknown }
>;

const WALLET_TONE = {
  ok: "text-foreground",
  low: "text-warning",
  negative: "text-danger",
} as const;

/** One line of Hypedrive health and wallet balance for a peek; nothing when the account isn't linked. */
export default function PlatformHealthLine({
  accountId,
  onNavigate,
}: {
  accountId: Id<"accounts">;
  onNavigate?: () => void;
}) {
  const data = useQuery(api.platform.forAccount, { accountId });
  if (!data || data.orgId === null) return null;
  const { health, wallet } = data as Linked;
  const [weakest] = weakestFactors(health, 1);

  return (
    <div className="shadow-divider flex min-w-0 items-center gap-3 px-6 py-3.5 text-sm">
      <Tooltip
        content={
          weakest
            ? `Weakest: ${weakest.label}, ${weakest.detail}`
            : "Every factor looks good"
        }
      >
        <span
          tabIndex={0}
          aria-label={`Health ${health.score} of 100, ${HEALTH_BAND_LABEL[health.band]}`}
          className="focus-visible:ring-ring flex shrink-0 items-center gap-1.5 rounded-sm tabular-nums outline-none focus-visible:ring-2"
        >
          <HealthRing score={health.score} band={health.band} />
          <span className="font-medium">{health.score}</span>
          <span className="text-fg-secondary">
            {HEALTH_BAND_LABEL[health.band]}
          </span>
        </span>
      </Tooltip>
      <span aria-hidden className="bg-border h-4 w-px shrink-0" />
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="caption-style text-fg-tertiary shrink-0">Balance</span>
        <span
          className={cn(
            "truncate tabular-nums",
            wallet.balance ? WALLET_TONE[wallet.status] : "text-fg-tertiary",
          )}
        >
          {wallet.balance
            ? formatMoney(wallet.balance)
            : wallet.status === "negative"
              ? "Negative"
              : wallet.status === "low"
                ? "Low"
                : "Not synced"}
        </span>
        {wallet.held && wallet.held.amount > 0 && (
          <span className="caption-style text-fg-tertiary truncate max-sm:hidden">
            {formatMoney(wallet.held)} held
          </span>
        )}
      </span>
      <Link
        href={`${routes.account(accountId)}?tab=platform`}
        onClick={onNavigate}
        className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring ml-auto flex shrink-0 items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
      >
        Platform
        <ArrowRightIcon aria-hidden className="size-3" />
      </Link>
    </div>
  );
}
