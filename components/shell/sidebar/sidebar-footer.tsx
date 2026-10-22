"use client";

import { usePathname } from "next/navigation";
import { useViewer } from "@/hooks/use-viewer";
import { routes } from "@/lib/routes";
import { useUiStore } from "@/stores/ui-store";
import HelpIcon from "@/public/assets/icons/message-question.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import { SETTINGS_ITEM, isActive } from "../navigation";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarSection from "./sidebar-section";

/** Settings, invites and help: the rail's bottom and the end of the phone "More" sheet. */
export default function SidebarFooter({
  collapsed = false,
  onNavigate,
  className,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <SidebarSection className={className}>
      <SidebarNavItem
        href={SETTINGS_ITEM.href}
        icon={SETTINGS_ITEM.icon}
        label={SETTINGS_ITEM.label}
        shortcut={SETTINGS_ITEM.shortcut}
        collapsed={collapsed}
        active={isActive(pathname, SETTINGS_ITEM.href)}
        onClick={onNavigate}
        tone="quiet"
      />
      {viewer.role === "admin" && (
        <SidebarNavItem
          href={`${routes.team}?invite=1`}
          icon={UserPlusIcon}
          label="Invite teammates"
          collapsed={collapsed}
          onClick={onNavigate}
          tone="quiet"
        />
      )}
      <SidebarNavItem
        icon={HelpIcon}
        label="Help & shortcuts"
        collapsed={collapsed}
        onClick={() => {
          onNavigate?.();
          setShortcutsOpen(true);
        }}
        tone="quiet"
        tour="help"
      />
    </SidebarSection>
  );
}
