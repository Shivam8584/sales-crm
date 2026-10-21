"use client";

import Tag, { type TagTone } from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import SegmentBar from "@/components/_common/segment-bar";
import Sparkline from "@/components/_common/sparkline";
import AccountLogo from "@/features/accounts/account-logo";
import { dash } from "@/features/accounts/record-cells";
import {
  SCORE_BAND_LABEL,
  formatCount,
  marketplaceName,
  scoreBand,
} from "@/lib/domain/prospecting";
import { cn } from "@/lib/utils";

const MARKETPLACE_TONE: Record<string, TagTone> = {
  amazon: "amber",
  flipkart: "blue",
  myntra: "red",
  nykaa: "purple",
  ajio: "teal",
  meesho: "purple",
  purplle: "moss",
  tatacliq: "neutral",
  jiomart: "blue",
  bigbasket: "green",
  blinkit: "yellow",
  zepto: "purple",
  croma: "teal",
};

export function MarketplaceTag({ slug }: { slug: string }) {
  return (
    <Tag tone={MARKETPLACE_TONE[slug] ?? "neutral"} size="sm">
      {marketplaceName(slug)}
    </Tag>
  );
}

/** At most `max` chips in all, the last one a "+N" when some don't fit. */
export function MarketplaceChips({
  slugs,
  max = 2,
}: {
  slugs: string[];
  max?: number;
}) {
  const room = slugs.length > max ? max - 1 : max;
  const visible = slugs.slice(0, room);
  const hidden = slugs.slice(room);
  return (
    <span className="flex min-w-0 items-center gap-0.75">
      {visible.map((slug) => (
        <MarketplaceTag key={slug} slug={slug} />
      ))}
      {hidden.length > 0 && (
        <Tooltip content={hidden.map(marketplaceName).join(", ")}>
          <Tag tone="neutral" size="sm">
            +{hidden.length}
          </Tag>
        </Tooltip>
      )}
    </span>
  );
}

const BAND_TONE = { hot: "orange", warm: "amber", cool: "neutral" } as const;

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
  const tag = (
    <Tag tone={BAND_TONE[band]} size="sm" className="gap-1 tabular-nums">
      <span className="font-medium">{score}</span>
      <span className="opacity-80">{SCORE_BAND_LABEL[band]}</span>
    </Tag>
  );
  if (reasons.length === 0) return tag;
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
      <span className="flex">{tag}</span>
    </Tooltip>
  );
}

/** "105 / 2,164" with a bar for the share of the benchmark reached. */
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
      <span
        className={cn(
          "flex min-w-0 items-center gap-2 tabular-nums",
          className,
        )}
      >
        <SegmentBar percent={percent} segments={12} className="w-12 shrink-0" />
        <span className="truncate">
          {formatCount(ratings)}
          <span className="text-fg-tertiary"> / {formatCount(benchmark)}</span>
        </span>
      </span>
    </Tooltip>
  );
}

/** Ratings a week, then a sparkline of daily gains. */
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
      <span className="flex items-center gap-2 tabular-nums">
        <span
          role="img"
          aria-label={`${formatCount(total)} new ratings in the last ${gains.length} days`}
          className="flex h-5 items-center"
        >
          <Sparkline values={gains} />
        </span>
        <span className="min-w-[6ch] text-right">
          {velocity === null ? dash : `${velocity}/wk`}
        </span>
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
      <span aria-hidden className="text-warning">
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

/** The CRM account a brand maps to, its lead, or a "New" chip; `inbound` marks public review-gap checks. */
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
      <Tag tone="blue" size="sm">
        {inbound ? "Public check · " : ""}
        {lead.open ? "Lead" : "Lead closed"}
      </Tag>
    );
  }
  return (
    <Tag tone="green" size="sm">
      New
    </Tag>
  );
}
