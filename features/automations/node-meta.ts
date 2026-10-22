import type { ComponentType, SVGProps } from "react";
import type { TagTone } from "@/components/_ui/tag";
import {
  NODE_LABEL,
  type AutomationStatus,
  type EnrollmentStatus,
  type NodeKind,
} from "@/lib/domain/automations";
import BellIcon from "@/public/assets/icons/bell.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import LogOutIcon from "@/public/assets/icons/log-out.svg";
import WhatsAppIcon from "@/public/assets/icons/whatsapp.svg";
import BoltIcon from "@/public/assets/icons/automations/bolt.svg";
import BranchIcon from "@/public/assets/icons/automations/git-branch.svg";
import HistoryIcon from "@/public/assets/icons/automations/history.svg";
import MailIcon from "@/public/assets/icons/automations/mail.svg";
import RotateIcon from "@/public/assets/icons/automations/rotate.svg";
import UsersPlusIcon from "@/public/assets/icons/automations/users-plus.svg";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export type NodeMeta = {
  label: string;
  hint: string;
  Icon: Icon;
};

export const NODE_META: Record<NodeKind, NodeMeta> = {
  trigger: {
    label: NODE_LABEL.trigger,
    hint: "What enrols a record",
    Icon: BoltIcon,
  },
  wait: {
    label: NODE_LABEL.wait,
    hint: "A delay, a weekday time or an event",
    Icon: HistoryIcon,
  },
  condition: {
    label: NODE_LABEL.condition,
    hint: "Split into YES and NO",
    Icon: BranchIcon,
  },
  create_task: {
    label: NODE_LABEL.create_task,
    hint: "Give a teammate something to do",
    Icon: CheckSquareIcon,
  },
  send_email: {
    label: NODE_LABEL.send_email,
    hint: "A templated email, consent checked",
    Icon: MailIcon,
  },
  send_whatsapp: {
    label: NODE_LABEL.send_whatsapp,
    hint: "An approved Meta template",
    Icon: WhatsAppIcon,
  },
  notify: {
    label: NODE_LABEL.notify,
    hint: "An in-app notification",
    Icon: BellIcon,
  },
  update_field: {
    label: NODE_LABEL.update_field,
    hint: "Stage, status, owner or tags",
    Icon: RotateIcon,
  },
  automation: {
    label: NODE_LABEL.automation,
    hint: "Add to or remove from one",
    Icon: UsersPlusIcon,
  },
  exit: {
    label: NODE_LABEL.exit,
    hint: "End the run here",
    Icon: LogOutIcon,
  },
};

export const ACTION_GROUPS: { label: string; kinds: NodeKind[] }[] = [
  { label: "Messages", kinds: ["send_email", "send_whatsapp"] },
  { label: "Team", kinds: ["create_task", "notify"] },
  { label: "Data", kinds: ["update_field", "automation"] },
  { label: "Flow", kinds: ["wait", "condition", "exit"] },
];

export const STATUS_TONE: Record<AutomationStatus, TagTone> = {
  draft: "neutral",
  active: "green",
  paused: "amber",
};

export const ENROLLMENT_TONE: Record<EnrollmentStatus, TagTone> = {
  running: "neutral",
  waiting: "neutral",
  completed: "neutral",
  exited: "neutral",
  failed: "red",
};
