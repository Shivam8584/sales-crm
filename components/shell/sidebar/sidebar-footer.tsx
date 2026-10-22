"use client";

import { usePathname } from "next/navigation";
import { useViewer } from "@/hooks/use-viewer";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import HelpIcon from "@/public/assets/icons/message-question.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import { SETTINGS_ITEM, isActive } from "../navigation";
import SidebarNavItem from "./sidebar-nav-item";

/** Settings, invites and help as one compact row right after the nav. */
export default function SidebarFooter({
  collapsed = false,
  onNavigate,
  indicator,
  className,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  indicator?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <ul
      aria-label="Workspace"
      className={cn(
        "collapsed:flex-col collapsed:items-stretch flex items-center gap-0.5 px-3 [&>li:first-child]:flex-1",
        className,
      )}
    >
      <SidebarNavItem
        href={SETTINGS_ITEM.href}
        icon={SETTINGS_ITEM.icon}
        label={SETTINGS_ITEM.label}
        shortcut={SETTINGS_ITEM.shortcut}
        collapsed={collapsed}
        active={isActive(pathname, SETTINGS_ITEM.href)}
        onClick={onNavigate}
        indicator={indicator}
      />
      {viewer.role === "admin" && (
        <SidebarNavItem
          href={`${routes.team}?invite=1`}
          icon={UserPlusIcon}
          label="Invite teammates"
          onClick={onNavigate}
          iconOnly
          indicator={indicator}
        />
      )}
      <SidebarNavItem
        icon={HelpIcon}
        label="Help & shortcuts"
        onClick={() => {
          onNavigate?.();
          setShortcutsOpen(true);
        }}
        iconOnly
        indicator={indicator}
        tour="help"
      />
    </ul>
  );
}
