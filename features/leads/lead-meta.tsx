import Avatar from "@/components/_ui/avatar";
import type { TagTone } from "@/components/_ui/tag";
import ToneDot from "@/components/board/tone-dot";
import Tooltip from "@/components/_ui/tooltip";
import type { Option } from "@/components/fields/option-picker";
import type { LeadStatus } from "@/lib/domain/enums";
import { LEAD_STATUS_LABEL } from "@/lib/domain/labels";
import { scoreBand, type LeadBand } from "@/lib/domain/scoring";
import { cellDate } from "@/features/accounts/record-cells";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<LeadStatus, TagTone> = {
  new: "blue",
  contacted: "purple",
  qualified: "green",
  nurture: "amber",
  disqualified: "neutral",
  converted: "teal",
};

export function StatusTag({ status }: { status: LeadStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ToneDot tone={STATUS_TONE[status]} />
      {LEAD_STATUS_LABEL[status]}
    </span>
  );
}

const BAND_LABEL: Record<LeadBand, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};
const BAND_TEXT: Record<LeadBand, string> = {
  hot: "text-danger",
  warm: "text-foreground",
  cold: "text-fg-tertiary",
};

/** "Hot 82" with the reasons behind the score in a tooltip. */
export function ScoreTag({
  score,
  reasons,
}: {
  score: number | null | undefined;
  reasons?: string[];
}) {
  if (score === null || score === undefined) return null;
  const band = scoreBand(score);
  return (
    <Tooltip
      side="top"
      disabled={!reasons?.length}
      content={
        <span className="flex flex-col gap-0.5">
          {reasons?.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </span>
      }
    >
      <span className={cn("shrink-0 tabular-nums", BAND_TEXT[band])}>
        {BAND_LABEL[band]} {score}
      </span>
    </Tooltip>
  );
}

const DEMO_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function DemoTag({ at }: { at: number }) {
  return (
    <span
      className="text-fg-secondary tabular-nums"
      title={`Demo on ${DEMO_TIME.format(at)}`}
    >
      Demo {DEMO_TIME.format(at)}
    </span>
  );
}

/** UTM source with the medium beside it; otherwise the referrer or entry point. */
export function SourceTag({
  utm,
  channel,
}: {
  utm: { source?: string; medium?: string };
  channel: string;
}) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5" title={channel}>
      <span className="truncate">{utm.source ?? channel}</span>
      {utm.source && utm.medium && (
        <span className="text-fg-tertiary truncate">{utm.medium}</span>
      )}
    </span>
  );
}

const DEMO_CLOCK = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
});

/** "23 Oct, 3:30 pm", muted once the demo has passed. */
export function DemoCell({ at, now }: { at: number | null; now: number }) {
  if (!at) return <span className="text-fg-tertiary">—</span>;
  return (
    <span
      title={`Demo on ${DEMO_TIME.format(at)}`}
      className={cn("truncate tabular-nums", at < now && "text-fg-tertiary")}
    >
      {cellDate(at)}, {DEMO_CLOCK.format(at)}
    </span>
  );
}

export function OwnerCell({ owner }: { owner: { name: string } | null }) {
  if (!owner) return <span className="text-fg-tertiary">Unassigned</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar name={owner.name} />
      <span className="truncate">{owner.name}</span>
    </span>
  );
}

/** "45s", "12m", "3h 5m", "2d". */
export function compactSpan(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function whatsappHref(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

/** Active teammates, plus the current owner when they have since left the team. */
export function ownerOptions(
  members: { _id: string; name: string }[] | undefined,
  owner: { _id: string; name: string } | null,
): Option[] {
  const options: Option[] = (members ?? []).map((member) => ({
    value: member._id,
    label: member.name,
    icon: <Avatar name={member.name} />,
  }));
  if (owner && !options.some((option) => option.value === owner._id)) {
    options.unshift({
      value: owner._id,
      label: owner.name,
      icon: <Avatar name={owner.name} />,
    });
  }
  return options;
}
