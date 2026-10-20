import type { ComponentType, SVGProps } from "react";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  shortcut: string;
};

/** Primary sections, in sidebar order. `shortcut` is the key after `G`. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", icon: ActivityIcon, shortcut: "T" },
  { href: "/leads", label: "Leads", icon: TargetIcon, shortcut: "L" },
  { href: "/accounts", label: "Accounts", icon: BuildingIcon, shortcut: "A" },
  { href: "/people", label: "People", icon: UsersIcon, shortcut: "P" },
  { href: "/deals", label: "Deals", icon: ClipboardIcon, shortcut: "D" },
  { href: "/tasks", label: "Tasks", icon: CheckSquareIcon, shortcut: "K" },
];

/** Workspace settings, shown at the bottom of the sidebar. */
export const TEAM_ITEM: NavItem = {
  href: "/team",
  label: "Team",
  icon: UsersIcon,
  shortcut: "M",
};

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
