import type { ComponentType, SVGProps } from "react";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import AtSignIcon from "@/public/assets/icons/at-sign.svg";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import BellIcon from "@/public/assets/icons/bell.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import CalendarIcon from "@/public/assets/icons/calendar.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const KIND_ICON: Record<string, Icon> = {
  mention: AtSignIcon,
  follow: EyeIcon,
  lead_new: TargetIcon,
  lead_assigned: UserPlusIcon,
  lead_repeat: MessageIcon,
  lead_signup: TargetIcon,
  lead_sla: AlertIcon,
  demo_booked: CalendarIcon,
  demo_rescheduled: CalendarIcon,
  demo_cancelled: CalendarIcon,
  platform_org: BuildingIcon,
  platform_gst_failed: AlertIcon,
  proposal_approval: ClipboardIcon,
  automation: AutomationIcon,
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
