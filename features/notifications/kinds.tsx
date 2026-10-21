import type { ComponentType, SVGProps } from "react";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import BellIcon from "@/public/assets/icons/bell.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import CalendarIcon from "@/public/assets/icons/calendar.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const KIND_ICON: Record<string, Icon> = {
  lead_new: TargetIcon,
  lead_assigned: UserPlusIcon,
  lead_repeat: MessageIcon,
  lead_signup: TargetIcon,
  lead_sla: AlertIcon,
  demo_booked: CalendarIcon,
  demo_rescheduled: CalendarIcon,
  demo_cancelled: CalendarIcon,
  platform_org: BuildingIcon,
  proposal_approval: ClipboardIcon,
};

export function KindIcon({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  const Icon = KIND_ICON[kind] ?? BellIcon;
  return <Icon aria-hidden className={className} />;
}

export const isUrgentKind = (kind: string) => kind === "lead_sla";

/** Inbox filter groups; each maps to the notification kinds it covers. */
export const KIND_GROUPS = [
  {
    value: "leads",
    label: "Leads",
    kinds: ["lead_new", "lead_assigned", "lead_repeat", "lead_signup"],
  },
  { value: "sla", label: "SLA alerts", kinds: ["lead_sla"] },
  {
    value: "demos",
    label: "Demos",
    kinds: ["demo_booked", "demo_rescheduled", "demo_cancelled"],
  },
  { value: "approvals", label: "Approvals", kinds: ["proposal_approval"] },
  { value: "platform", label: "Platform", kinds: ["platform_org"] },
] as const;
