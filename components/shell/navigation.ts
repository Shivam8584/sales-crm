import type { ComponentType, SVGProps } from "react";
import { ROLE_RANK, type Role } from "@/lib/domain/enums";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import InboxIcon from "@/public/assets/icons/inbox.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import AlertTriangleIcon from "@/public/assets/icons/alert-triangle.svg";
import BarChartIcon from "@/public/assets/icons/bar-chart-10.svg";
import SettingsIcon from "@/public/assets/icons/settings.svg";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import MessageQuestionIcon from "@/public/assets/icons/message-question.svg";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Key pressed after `G` to jump here. */
  shortcut: string;
  /** Hidden from roles below this one. */
  minRole?: Role;
};

export type NavSection = { title?: string; items: NavItem[] };

/** Sidebar order: personal work, then pipeline, then records, then insight. */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/today", label: "Today", icon: ActivityIcon, shortcut: "T" },
      { href: "/inbox", label: "Inbox", icon: InboxIcon, shortcut: "I" },
      { href: "/tasks", label: "Tasks", icon: CheckSquareIcon, shortcut: "K" },
    ],
  },
  {
    title: "Pipeline",
    items: [
      {
        href: "/prospecting",
        label: "Prospecting",
        icon: EyeIcon,
        shortcut: "O",
      },
      { href: "/leads", label: "Leads", icon: TargetIcon, shortcut: "L" },
      { href: "/deals", label: "Deals", icon: ClipboardIcon, shortcut: "D" },
      {
        href: "/activation",
        label: "Activation",
        icon: AlertTriangleIcon,
        shortcut: "V",
        minRole: "manager",
      },
      {
        href: "/automations",
        label: "Sequences",
        icon: AutomationIcon,
        shortcut: "U",
      },
    ],
  },
  {
    title: "Records",
    items: [
      {
        href: "/accounts",
        label: "Accounts",
        icon: BuildingIcon,
        shortcut: "A",
      },
      { href: "/people", label: "People", icon: UsersIcon, shortcut: "P" },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: BarChartIcon, shortcut: "R" },
      { href: "/activity", label: "Activity", icon: ClockIcon, shortcut: "Y" },
      {
        href: "/playbook",
        label: "Playbook",
        icon: MessageQuestionIcon,
        shortcut: "B",
      },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
  shortcut: "S",
};

export const canSee = (item: NavItem, role: Role) =>
  !item.minRole || ROLE_RANK[role] >= ROLE_RANK[item.minRole];

/** The sidebar sections a role sees. */
export function navSections(role: Role): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canSee(item, role)),
  })).filter((section) => section.items.length > 0);
}

/** Every item a role can reach with `G` then a key, including settings. */
export function navItems(role: Role): NavItem[] {
  return [
    ...navSections(role).flatMap((section) => section.items),
    SETTINGS_ITEM,
  ];
}

export const SETTINGS_PAGES = [
  { href: "/settings/profile", label: "Profile", adminOnly: false },
  { href: "/settings/team", label: "Team", adminOnly: false },
  { href: "/settings/workspace", label: "Workspace", adminOnly: true },
  { href: "/settings/fields", label: "Custom fields", adminOnly: true },
  { href: "/settings/targets", label: "Targets", adminOnly: true },
  {
    href: "/settings/duplicates",
    label: "Duplicates",
    adminOnly: false,
    minRole: "manager",
  },
  { href: "/settings/integrations", label: "Integrations", adminOnly: true },
  { href: "/settings/system", label: "System", adminOnly: true },
] as const;

export function canOpenSetting(
  page: (typeof SETTINGS_PAGES)[number],
  role: Role,
) {
  if (page.adminOnly) return role === "admin";
  return ROLE_RANK[role] >= ROLE_RANK["minRole" in page ? page.minRole : "rep"];
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
