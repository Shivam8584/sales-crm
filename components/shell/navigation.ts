import type { ComponentType, SVGProps } from "react";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import InboxIcon from "@/public/assets/icons/inbox.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import AlertTriangleIcon from "@/public/assets/icons/alert-triangle.svg";
import BarChartIcon from "@/public/assets/icons/bar-chart-10.svg";
import SettingsIcon from "@/public/assets/icons/settings.svg";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Key pressed after `G` to jump here. */
  shortcut: string;
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
      { href: "/leads", label: "Leads", icon: TargetIcon, shortcut: "L" },
      { href: "/deals", label: "Deals", icon: ClipboardIcon, shortcut: "D" },
      {
        href: "/activation",
        label: "Activation",
        icon: AlertTriangleIcon,
        shortcut: "V",
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
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
  shortcut: "S",
};

const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Every item reachable with `G` then a key, including settings. */
export const ALL_NAV_ITEMS: NavItem[] = [...NAV_ITEMS, SETTINGS_ITEM];

export const SETTINGS_PAGES = [
  { href: "/settings/profile", label: "Profile", adminOnly: false },
  { href: "/settings/team", label: "Team", adminOnly: false },
  { href: "/settings/workspace", label: "Workspace", adminOnly: true },
  { href: "/settings/integrations", label: "Integrations", adminOnly: true },
] as const;

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
