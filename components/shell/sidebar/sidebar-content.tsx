"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Kbd from "@/components/_ui/kbd";
import { ScrollArea } from "@/components/_ui/scroll-area";
import Tooltip from "@/components/_ui/tooltip";
import { MOD_KEY } from "@/lib/keyboard";
import {
  toggleSidebarCollapsed,
  useSidebarCollapsed,
} from "@/lib/sidebar-collapse";
import { useUiStore } from "@/stores/ui-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import SearchIcon from "@/public/assets/icons/search.svg";
import SidebarIcon from "@/public/assets/icons/sidebar.svg";
import NotificationBell from "@/features/notifications/notification-bell";
import { NAV_SECTIONS, SETTINGS_ITEM, isActive } from "../navigation";
import SidebarNavItem from "./sidebar-nav-item";
import UserMenu from "./user-menu";

/** Sidebar body shared by the desktop rail and the mobile drawer. */
export default function SidebarContent({
  variant = "desktop",
}: {
  variant?: "desktop" | "drawer";
}) {
  const pathname = usePathname();
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  const collapsedState = useSidebarCollapsed();
  const collapsed = variant === "desktop" && collapsedState;
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const close = () => setSidebarOpen(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="collapsed:justify-center collapsed:px-0 flex h-13 shrink-0 items-center gap-2 pr-2.5 pl-4">
        <Logo
          aria-hidden
          className="collapsed:hidden size-5.5 shrink-0 overflow-visible"
        />
        <span className="lead-style collapsed:hidden flex-1 truncate font-medium tracking-[-0.01em]">
          Hypedrive
        </span>
        <span className="collapsed:hidden flex items-center">
          <NotificationBell />
        </span>
        {variant === "desktop" && (
          <Tooltip
            content={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            shortcut="["
            side={collapsed ? "right" : "bottom"}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={toggleSidebarCollapsed}
            >
              <SidebarIcon aria-hidden className="size-3.5" />
            </Button>
          </Tooltip>
        )}
      </div>

      <div className="collapsed:flex collapsed:justify-center collapsed:px-2 px-3 pb-2">
        <Tooltip
          content="Search"
          shortcut={`${MOD_KEY} K`}
          side="right"
          disabled={!collapsed}
        >
          <button
            type="button"
            aria-label={collapsed ? "Search" : undefined}
            onClick={() => {
              close();
              setCommandOpen(true);
            }}
            className="border-border bg-overlay-1 text-fg-tertiary hover:text-fg-secondary hover:bg-overlay-2 focus-visible:ring-ring duration-fast collapsed:size-8 collapsed:justify-center collapsed:px-0 flex h-8 w-full items-center gap-2 rounded-md border px-2 text-sm leading-none transition-colors outline-none focus-visible:ring-2"
          >
            <SearchIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="collapsed:hidden flex-1 text-left">Search</span>
            <span className="collapsed:hidden flex gap-0.5">
              <Kbd>{MOD_KEY}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </Tooltip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav
          aria-label="Primary"
          className="collapsed:items-center collapsed:gap-3 collapsed:px-2 flex flex-col gap-5 px-3 pt-2 pb-4"
        >
          {NAV_SECTIONS.map((section, index) => (
            <div
              key={section.title ?? index}
              className="collapsed:items-center flex flex-col gap-0.5"
            >
              {section.title && (
                <>
                  <h2 className="caption-style text-fg-tertiary collapsed:hidden flex h-6 items-center px-2 font-medium">
                    {section.title}
                  </h2>
                  <span
                    aria-hidden
                    className="bg-border collapsed:block mb-2 hidden h-px w-5"
                  />
                </>
              )}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    shortcut={item.shortcut}
                    collapsed={collapsed}
                    active={isActive(pathname, item.href)}
                    onNavigate={close}
                    badge={
                      item.href === "/inbox" && unread > 0 ? (
                        <UnreadBadge count={unread} />
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div className="border-sidebar-border collapsed:items-center collapsed:px-2 flex shrink-0 flex-col gap-1 border-t p-2">
        <ul className="collapsed:px-0 px-1">
          <SidebarNavItem
            href={SETTINGS_ITEM.href}
            icon={SETTINGS_ITEM.icon}
            label={SETTINGS_ITEM.label}
            shortcut={SETTINGS_ITEM.shortcut}
            collapsed={collapsed}
            active={isActive(pathname, SETTINGS_ITEM.href)}
            onNavigate={close}
          />
        </ul>
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <>
      <span className="caption-style text-fg-secondary collapsed:hidden tabular-nums">
        {count > 99 ? "99+" : count}
        <span className="sr-only"> unread</span>
      </span>
      <span
        aria-hidden
        className="bg-primary ring-sidebar collapsed:block absolute top-1 right-1 hidden size-1.5 rounded-full ring-2"
      />
    </>
  );
}
