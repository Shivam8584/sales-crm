import Avatar from "@/components/_ui/avatar";
import Tag, { type TagTone } from "@/components/_ui/tag";
import type { Option } from "@/components/fields/option-picker";
import type { LeadStatus } from "@/lib/domain/enums";
import { LEAD_STATUS_LABEL } from "@/lib/domain/labels";
import { cellDate, tagTone } from "@/features/accounts/record-cells";
import { cn } from "@/lib/utils";
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";

export const STATUS_TONE: Record<LeadStatus, TagTone> = {
  new: "blue",
  contacted: "purple",
  qualified: "green",
  nurture: "amber",
  disqualified: "neutral",
  converted: "teal",
};

/** Statuses a rep picks directly; disqualify needs a reason and convert has its own action. */

export function StatusTag({ status }: { status: LeadStatus }) {
  return (
    <Tag tone={STATUS_TONE[status]} size="sm">
      {LEAD_STATUS_LABEL[status]}
    </Tag>
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
    <Tag tone="purple" size="xs" title={`Demo on ${DEMO_TIME.format(at)}`}>
      <CalendarIcon aria-hidden className="size-3" />
      {DEMO_TIME.format(at)}
    </Tag>
  );
}

/** UTM source as a coloured tag with the medium beside it; otherwise the referrer or entry point. */
export function SourceTag({
  utm,
  channel,
}: {
  utm: { source?: string; medium?: string };
  channel: string;
}) {
  if (!utm.source) {
    return (
      <Tag
        tone="neutral"
        size="sm"
        title={channel}
        className="max-w-full min-w-0"
      >
        <span className="truncate">{channel}</span>
      </Tag>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={channel}>
      <Tag tone={tagTone(utm.source)} size="sm" className="min-w-0 shrink">
        <span className="truncate">{utm.source}</span>
      </Tag>
      {utm.medium && (
        <span className="text-fg-tertiary truncate text-sm">{utm.medium}</span>
      )}
    </span>
  );
}

const DEMO_CLOCK = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
});

/** "📅 23 Oct | 3:30 pm", muted once the demo has passed. */
export function DemoCell({ at, now }: { at: number | null; now: number }) {
  if (!at) return <span className="text-fg-tertiary">—</span>;
  return (
    <span
      title={`Demo on ${DEMO_TIME.format(at)}`}
      className={cn(
        "flex min-w-0 items-center gap-1 tabular-nums",
        at < now && "text-fg-tertiary",
      )}
    >
      <CalendarIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="w-12.5 shrink-0">{cellDate(at)}</span>
      <span aria-hidden className="bg-overlay-4 mx-0.75 h-2 w-px shrink-0" />
      <span className="truncate">{DEMO_CLOCK.format(at)}</span>
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
