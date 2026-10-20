import type { ComponentType, SVGProps } from "react";
import BuildingIcon from "@/public/assets/icons/building.svg";
import UsersIcon from "@/public/assets/icons/users.svg";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  shortcut: string;
};

/** Primary sections, in sidebar order. `shortcut` is the key after `G`. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/accounts", label: "Accounts", icon: BuildingIcon, shortcut: "A" },
  { href: "/people", label: "People", icon: UsersIcon, shortcut: "P" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
