import type { ComponentType, SVGProps } from "react";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import AtSignIcon from "@/public/assets/icons/at-sign.svg";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import BellIcon from "@/public/assets/icons/bell.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import MailIcon from "@/public/assets/icons/mail-03.svg";
import MergeIcon from "@/public/assets/icons/merge.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";
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
  platform_wallet_negative: WalletIcon,
  platform_campaign_status_changed: AlertIcon,
  platform_campaign_slots_filled: CheckCircleIcon,
  proposal_approval: ClipboardIcon,
  proposal_decision: ClipboardIcon,
  automation: AutomationIcon,
  email_log: MailIcon,
  merge: MergeIcon,
  survey_detractor: AlertIcon,
  survey_promoter: MessageIcon,
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
