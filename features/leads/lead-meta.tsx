import Avatar from "@/components/_ui/avatar";
import Tag, { type TagTone } from "@/components/_ui/tag";
import ToneDot from "@/components/board/tone-dot";
import type { Option } from "@/components/fields/option-picker";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/domain/enums";
import { LEAD_STATUS_LABEL } from "@/lib/domain/labels";
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
export const WORKING_STATUS_OPTIONS: Option[] = LEAD_STATUSES.filter(
  (status) => status !== "disqualified" && status !== "converted",
).map((status) => ({
  value: status,
  label: LEAD_STATUS_LABEL[status],
  icon: <ToneDot tone={STATUS_TONE[status]} />,
}));

export function StatusTag({ status }: { status: LeadStatus }) {
  return (
    <Tag tone={STATUS_TONE[status]} size="sm">
      {LEAD_STATUS_LABEL[status]}
    </Tag>
  );
}

export function ChannelTag({ channel }: { channel: string }) {
  return (
    <Tag size="xs" className="max-w-full min-w-0">
      <span className="truncate">{channel}</span>
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
