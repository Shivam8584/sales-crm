"use client";

import Tooltip from "@/components/_ui/tooltip";
import AccountLogo from "@/features/accounts/account-logo";
import { dash } from "@/features/accounts/record-cells";
import {
  SCORE_BAND_LABEL,
  formatCount,
  marketplaceName,
  scoreBand,
} from "@/lib/domain/prospecting";
import { cn } from "@/lib/utils";

export function MarketplaceTag({ slug }: { slug: string }) {
  return <span className="truncate">{marketplaceName(slug)}</span>;
}

/** At most `max` names in all, the last one a "+N" when some don't fit. */
export function MarketplaceChips({
  slugs,
  max = 2,
}: {
  slugs: string[];
  max?: number;
}) {
  const room = slugs.length > max ? max - 1 : max;
  const hidden = slugs.slice(room);
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate">
        {slugs.slice(0, room).map(marketplaceName).join(", ")}
      </span>
      {hidden.length > 0 && (
        <Tooltip content={hidden.map(marketplaceName).join(", ")}>
          <span className="text-fg-tertiary shrink-0">+{hidden.length}</span>
        </Tooltip>
      )}
    </span>
  );
}

/** Prospect score with its band; the tooltip carries the reasons. */
export function ScoreTag({
  score,
  reasons = [],
}: {
  score: number | null;
  reasons?: string[];
}) {
  if (score === null) {
    return (
      <Tooltip content="Needs at least three rated products in the source to compare">
        <span className="text-fg-tertiary">Not scored</span>
      </Tooltip>
    );
  }
  const band = scoreBand(score);
  const text = (
    <span
      className={cn(
        "flex shrink-0 gap-1 tabular-nums",
        band === "hot" ? "text-danger" : "text-foreground",
      )}
    >
      {score}
      <span className="text-fg-tertiary">{SCORE_BAND_LABEL[band]}</span>
    </span>
  );
  if (reasons.length === 0) return text;
  return (
    <Tooltip
      content={
        <ul className="flex max-w-72 flex-col gap-1 py-0.5">
          {reasons.map((reason) => (
            <li key={reason} className="leading-snug">
              {reason}
            </li>
          ))}
        </ul>
      }
    >
      {text}
    </Tooltip>
  );
}

/** "105 / 2,164": ratings against the category benchmark. */
export function GapCell({
  ratings,
  benchmark,
  className,
}: {
  ratings: number | null;
  benchmark: number | null;
  className?: string;
}) {
  if (ratings === null) return dash;
  if (benchmark === null) {
    return <span className="tabular-nums">{formatCount(ratings)}</span>;
  }
  const percent = Math.min(100, Math.round((ratings / benchmark) * 100));
  return (
    <Tooltip
      content={`${formatCount(ratings)} ratings, ${percent}% of the ${formatCount(benchmark)} benchmark`}
    >
      <span className={cn("truncate tabular-nums", className)}>
        {formatCount(ratings)}
        <span className="text-fg-tertiary"> / {formatCount(benchmark)}</span>
      </span>
    </Tooltip>
  );
}

/** Ratings a week; the tooltip has the recent total. */
export function VelocityCell({
  velocity,
  gains,
}: {
  velocity: number | null;
  gains: number[];
}) {
  const total = gains.reduce((sum, value) => sum + value, 0);
  return (
    <Tooltip
      content={
        velocity === null
          ? "Pace shows after a day of history"
          : `${velocity} ratings a week · ${formatCount(total)} in the last ${gains.length} days`
      }
    >
      <span className="tabular-nums">
        {velocity === null ? dash : `${velocity}/wk`}
      </span>
    </Tooltip>
  );
}

export function RatingValue({
  rating,
  count,
}: {
  rating: number | null;
  count?: number | null;
}) {
  if (rating === null) return dash;
  return (
    <span className="flex items-center gap-1 tabular-nums">
      <span aria-hidden className="text-fg-tertiary">
        ★
      </span>
      {rating.toFixed(1)}
      {count != null && (
        <span className="text-fg-tertiary">({formatCount(count)})</span>
      )}
    </span>
  );
}

type Match = {
  via: "linked" | "matched";
  _id: string;
  name: string;
  domain: string | null;
  logoUrl: string | null;
} | null;

/** The CRM account a brand maps to, its lead, or "New"; `inbound` marks public review-gap checks. */
export function MatchCell({
  account,
  lead,
  inbound = false,
}: {
  account: Match;
  lead?: { name: string; open: boolean } | null;
  inbound?: boolean;
}) {
  if (account) {
    return (
      <Tooltip
        content={
          account.via === "linked"
            ? `Linked to ${account.name}`
            : `Matched ${account.name} by name or website`
        }
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <AccountLogo account={account} size="xs" />
          <span className="truncate">{account.name}</span>
        </span>
      </Tooltip>
    );
  }
  if (lead) {
    return (
      <span className="truncate">
        {inbound ? "Public check · " : ""}
        {lead.open ? "Lead" : "Lead closed"}
      </span>
    );
  }
  return <span className="text-fg-tertiary">New</span>;
}
