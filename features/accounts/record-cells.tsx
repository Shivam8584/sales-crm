"use client";

import Avatar from "@/components/_ui/avatar";
import Tag, { type TagTone } from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import SegmentBar from "@/components/_common/segment-bar";
import Sparkline from "@/components/_common/sparkline";
import { KIND_META } from "@/features/timeline/kinds";
import type { LifecycleStage, TimelineKind } from "@/lib/domain/enums";
import { STAGE_LABEL } from "@/lib/domain/labels";
import {
  CURRENCIES,
  formatMoney,
  sumMoney,
  toMajor,
  type Money,
} from "@/lib/domain/money";
import { ACTIVATION_STAGES } from "@/lib/domain/platform";
import { dateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";
import { StageTag } from "./stage";

export const dash = <span className="text-fg-tertiary">—</span>;

const TAG_TONES: TagTone[] = [
  "blue",
  "green",
  "purple",
  "orange",
  "teal",
  "amber",
  "moss",
  "red",
  "yellow",
];

/** A tag keeps one colour everywhere, derived from its text. */
export function tagTone(tag: string): TagTone {
  let hash = 0;
  for (const char of tag.toLowerCase())
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TAG_TONES[hash % TAG_TONES.length];
}

/** Stage tag, then tags up to `max` chips in total, then "+N". */
export function StageAndTags({
  stage,
  tags,
  max = 2,
}: {
  stage?: LifecycleStage;
  tags: string[];
  max?: number;
}) {
  const room = Math.max(0, max - (stage ? 1 : 0));
  const visible = tags.slice(0, room);
  const hidden = tags.slice(room);
  return (
    <span className="flex min-w-0 items-center gap-0.75">
      {stage && <StageTag stage={stage} />}
      {visible.map((tag) => (
        <Tag
          key={tag}
          tone={tagTone(tag)}
          size="sm"
          title={tag}
          className="max-w-28 min-w-0 shrink"
        >
          <span className="truncate">{tag}</span>
        </Tag>
      ))}
      {hidden.length > 0 && (
        <Tooltip content={hidden.join(", ")}>
          <Tag tone="neutral" size="sm">
            +{hidden.length}
          </Tag>
        </Tooltip>
      )}
    </span>
  );
}

export function OwnerCell({ owner }: { owner: { name: string } | null }) {
  if (!owner) return <span className="text-fg-tertiary">No owner</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar name={owner.name} />
      <span className="truncate">{owner.name}</span>
    </span>
  );
}

function moneyLocale(currency: Money["currency"]) {
  return currency === "INR" ? "en-IN" : "en-US";
}

/** Splits money into its symbol and digits so the symbol can be muted. */
export function moneyParts(value: Money, compact = false) {
  const parts = new Intl.NumberFormat(moneyLocale(value.currency), {
    style: "currency",
    currency: value.currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).formatToParts(toMajor(value));
  return {
    symbol: parts.find((part) => part.type === "currency")?.value ?? "",
    digits: parts
      .filter((part) => part.type !== "currency" && part.type !== "literal")
      .map((part) => part.value)
      .join(""),
  };
}

/**
 * Totals per currency, largest share of deals first: the first is the
 * "main" currency shown, the rest are counted as "+N".
 */
export function rankTotals(values: Money[]) {
  const counts = new Map<string, number>();
  for (const value of values)
    counts.set(value.currency, (counts.get(value.currency) ?? 0) + 1);
  return sumMoney(values)
    .filter((total) => total.amount > 0)
    .sort(
      (a, b) =>
        (counts.get(b.currency) ?? 0) - (counts.get(a.currency) ?? 0) ||
        CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency),
    );
}

/** Muted currency symbol, tabular digits, "+N" for other currencies. */
export function MoneyValue({
  totals,
  compact = false,
  className,
}: {
  totals: Money[];
  compact?: boolean;
  className?: string;
}) {
  const [main, ...rest] = totals;
  if (!main) return dash;
  const { symbol, digits } = moneyParts(main, compact);
  const value = (
    <span
      className={cn("flex items-baseline gap-0.75 tabular-nums", className)}
    >
      <span className="text-fg-tertiary">{symbol}</span>
      {digits}
      {rest.length > 0 && (
        <span className="text-fg-tertiary ml-0.5">+{rest.length}</span>
      )}
    </span>
  );
  if (rest.length === 0) return value;
  return (
    <Tooltip content={totals.map((total) => formatMoney(total)).join(" · ")}>
      {value}
    </Tooltip>
  );
}

/** Steps done on the activation path, 0–6, or null when not on the platform. */
export function activationSteps(onPlatform: boolean, stage: LifecycleStage) {
  if (!onPlatform) return null;
  if (stage === "expanding") return ACTIVATION_STAGES.length;
  return (ACTIVATION_STAGES as readonly string[]).indexOf(stage) + 1;
}

export function activationPercent(steps: number) {
  return Math.round((steps / ACTIVATION_STAGES.length) * 100);
}

export function ActivationCell({ steps }: { steps: number | null }) {
  if (steps === null) return dash;
  const total = ACTIVATION_STAGES.length;
  const percent = activationPercent(steps);
  return (
    <Tooltip
      content={
        steps
          ? `${STAGE_LABEL[ACTIVATION_STAGES[steps - 1]]} · ${steps} of ${total} steps`
          : `On Hypedrive · 0 of ${total} steps`
      }
    >
      <span className="flex items-center gap-2 tabular-nums">
        <SegmentBar percent={percent} segments={total * 3} className="w-18.5" />
        <span className="w-[4ch] text-right">{percent}%</span>
      </span>
    </Tooltip>
  );
}

export function TrendCell({
  values,
  days = values.length,
}: {
  values: number[];
  days?: number;
}) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return (
    <Tooltip
      content={`${total} ${total === 1 ? "entry" : "entries"} in the last ${days} days`}
    >
      <span
        role="img"
        aria-label={`${total} timeline entries in the last ${days} days`}
        className="flex h-5 items-center pl-3"
      >
        <Sparkline values={values} />
      </span>
    </Tooltip>
  );
}

const DAY_MONTH = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});
const MONTH_YEAR = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "2-digit",
});

/** "9 Oct" this year, "Oct 25" before, so the cell keeps a fixed width. */
export function cellDate(at: number) {
  const date = new Date(at);
  return date.getFullYear() === new Date().getFullYear()
    ? DAY_MONTH.format(date)
    : MONTH_YEAR.format(date);
}

export type LastInteraction = {
  at: number;
  kind: TimelineKind;
  subject: string | null;
} | null;

export function interactionLabel(last: NonNullable<LastInteraction>) {
  return last.subject ?? KIND_META[last.kind].label;
}

export function LastInteractionCell({ last }: { last: LastInteraction }) {
  if (!last) return dash;
  const label = interactionLabel(last);
  return (
    <Tooltip content={`${KIND_META[last.kind].label} · ${dateTime(last.at)}`}>
      <span className="flex min-w-0 items-center gap-1">
        <CalendarIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="w-12.5 shrink-0 tabular-nums">
          {cellDate(last.at)}
        </span>
        <span aria-hidden className="bg-overlay-4 mx-0.75 h-2 w-px shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    </Tooltip>
  );
}
