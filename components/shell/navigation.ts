import type { ComponentType, SVGProps } from "react";
import { ROLE_RANK, type Role } from "@/lib/domain/enums";
import { routes } from "@/lib/routes";
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

export type NavCount = {
  key: "accounts" | "leads" | "tasks" | "inbox";
  /** Read after the number by screen readers. */
  label: string;
  /** Also flagged as a dot when the sidebar is collapsed. */
  alert: boolean;
};

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Key pressed after `G` to jump here. */
  shortcut: string;
  /** Hidden from roles below this one. */
  minRole?: Role;
  /** Pinned to the phone tab bar; every other item sits behind "More". */
  tab?: boolean;
  count?: NavCount;
  /** `data-tour` target for the product tour. */
  tour?: string;
};

/** The title is never drawn in the sidebar; it names the group for screen readers and the phone sheet. */
export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Work",
    items: [
      {
        href: routes.today,
        label: "Today",
        icon: ActivityIcon,
        shortcut: "T",
        tab: true,
        tour: "today",
      },
      {
        href: routes.inbox,
        label: "Inbox",
        icon: InboxIcon,
        shortcut: "I",
        tab: true,
        count: { key: "inbox", label: "unread", alert: true },
        tour: "inbox",
      },
      {
        href: routes.tasks,
        label: "Tasks",
        icon: CheckSquareIcon,
        shortcut: "K",
        tab: true,
        count: { key: "tasks", label: "overdue", alert: true },
      },
    ],
  },
  {
    title: "Pipeline",
    items: [
      {
        href: routes.prospecting,
        label: "Prospecting",
        icon: EyeIcon,
        shortcut: "O",
      },
      {
        href: routes.leads,
        label: "Leads",
        icon: TargetIcon,
        shortcut: "L",
        tab: true,
        count: { key: "leads", label: "new", alert: true },
      },
      {
        href: routes.deals,
        label: "Deals",
        icon: ClipboardIcon,
        shortcut: "D",
      },
      {
        href: routes.activation,
        label: "Activation",
        icon: AlertTriangleIcon,
        shortcut: "V",
        minRole: "manager",
      },
      {
        href: routes.sequences,
        label: "Sequences",
        icon: AutomationIcon,
        shortcut: "U",
      },
    ],
  },
  {
    title: "Records and insights",
    items: [
      {
        href: routes.accounts,
        label: "Accounts",
        icon: BuildingIcon,
        shortcut: "A",
        count: { key: "accounts", label: "accounts", alert: false },
      },
      {
        href: routes.people,
        label: "People",
        icon: UsersIcon,
        shortcut: "P",
      },
      {
        href: routes.reports,
        label: "Reports",
        icon: BarChartIcon,
        shortcut: "R",
      },
      {
        href: routes.activity,
        label: "Activity",
        icon: ClockIcon,
        shortcut: "Y",
      },
      {
        href: routes.playbook,
        label: "Playbook",
        icon: MessageQuestionIcon,
        shortcut: "B",
      },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  href: routes.settings,
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
  { href: routes.profile, label: "Profile", adminOnly: false },
  { href: routes.team, label: "Team", adminOnly: false },
  { href: routes.workspace, label: "Workspace", adminOnly: true },
  { href: routes.fields, label: "Custom fields", adminOnly: true },
  { href: routes.targets, label: "Targets", adminOnly: true },
  {
    href: routes.duplicates,
    label: "Duplicates",
    adminOnly: false,
    minRole: "manager",
  },
  {
    href: routes.audit,
    label: "Audit log",
    adminOnly: false,
    minRole: "manager",
  },
  { href: routes.integrations, label: "Integrations", adminOnly: true },
  { href: routes.system, label: "System", adminOnly: true },
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
