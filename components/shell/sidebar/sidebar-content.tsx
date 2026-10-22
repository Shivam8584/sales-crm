"use client";

import { istToday } from "@/lib/domain/day";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import Tooltip from "@/components/_ui/tooltip";
import { useViewer } from "@/hooks/use-viewer";
import {
  toggleSidebarCollapsed,
  useSidebarCollapsed,
} from "@/lib/sidebar-collapse";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import SidebarIcon from "@/public/assets/icons/sidebar.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import HelpIcon from "@/public/assets/icons/message-question.svg";
import { SETTINGS_ITEM, isActive, navSections } from "../navigation";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarPins from "./sidebar-pins";
import SidebarSection from "./sidebar-section";

type CountKey = "accounts" | "leads" | "tasks" | "inbox";

const COUNTS: Record<string, { key: CountKey; label: string; alert: boolean }> =
  {
    "/records/accounts": { key: "accounts", label: "accounts", alert: false },
    "/pipeline/leads": { key: "leads", label: "new", alert: true },
    "/tasks": { key: "tasks", label: "overdue", alert: true },
    "/inbox": { key: "inbox", label: "unread", alert: true },
  };

const TOUR: Record<string, string> = { "/today": "today", "/inbox": "inbox" };

const localDay = () => istToday();

/** Sidebar body shared by the desktop rail and the mobile drawer. */
export default function SidebarContent({
  variant = "desktop",
}: {
  variant?: "desktop" | "drawer";
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const sections = navSections(viewer.role);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const collapsedState = useSidebarCollapsed();
  const collapsed = variant === "desktop" && collapsedState;
  const counts = useQuery(api.shell.navCounts, { today: localDay() });
  const close = () => setSidebarOpen(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border bg-sidebar-accent collapsed:justify-center collapsed:px-2 flex h-14.5 shrink-0 items-center gap-2 border-b px-3">
        {collapsed ? (
          <Tooltip content="Expand sidebar" shortcut="[" side="right">
            <button
              type="button"
              aria-label="Expand sidebar"
              aria-expanded={false}
              onClick={toggleSidebarCollapsed}
              className="group focus-visible:ring-ring hover:bg-overlay-2 relative flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2"
            >
              <Logo
                aria-hidden
                className="size-8 overflow-visible group-hover:opacity-0 group-focus-visible:opacity-0"
              />
              <SidebarIcon
                aria-hidden
                className="text-icon absolute size-3.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </button>
          </Tooltip>
        ) : (
          <>
            <Link
              href="/today"
              onClick={close}
              className="focus-visible:ring-ring -m-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 outline-none focus-visible:ring-2"
            >
              <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="lead-style block truncate font-medium tracking-[-0.01em]">
                  Hypedrive
                </span>
                <span className="caption-style text-fg-tertiary block truncate">
                  Brand pipeline
                </span>
              </span>
            </Link>
            {variant === "desktop" && (
              <Tooltip content="Collapse sidebar" shortcut="[">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Collapse sidebar"
                  aria-expanded
                  onClick={toggleSidebarCollapsed}
                  className="-mr-0.5"
                >
                  <SidebarIcon aria-hidden className="size-3.5" />
                </Button>
              </Tooltip>
            )}
          </>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary" data-tour="nav">
          {sections.map((section, index) => (
            <SidebarSection
              key={section.title ?? index}
              title={section.title}
              className={cn(
                index < sections.length - 1 && "border-sidebar-border border-b",
              )}
            >
              {section.items.map((item) => {
                const count = COUNTS[item.href];
                return (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    shortcut={item.shortcut}
                    collapsed={collapsed}
                    active={isActive(pathname, item.href)}
                    onClick={close}
                    count={count && counts ? counts[count.key] : undefined}
                    countLabel={count?.label}
                    alert={count?.alert}
                    tour={TOUR[item.href]}
                  />
                );
              })}
            </SidebarSection>
          ))}
          <SidebarPins collapsed={collapsed} onNavigate={close} />
        </nav>
      </ScrollArea>

      <SidebarSection className="border-sidebar-border shrink-0 border-t">
        <SidebarNavItem
          href={SETTINGS_ITEM.href}
          icon={SETTINGS_ITEM.icon}
          label={SETTINGS_ITEM.label}
          shortcut={SETTINGS_ITEM.shortcut}
          collapsed={collapsed}
          active={isActive(pathname, SETTINGS_ITEM.href)}
          onClick={close}
          tone="quiet"
        />
        {viewer.role === "admin" && (
          <SidebarNavItem
            href="/settings/team?invite=1"
            icon={UserPlusIcon}
            label="Invite teammates"
            collapsed={collapsed}
            onClick={close}
            tone="quiet"
          />
        )}
        <SidebarNavItem
          icon={HelpIcon}
          label="Help & shortcuts"
          collapsed={collapsed}
          onClick={() => {
            close();
            setShortcutsOpen(true);
          }}
          tone="quiet"
          tour="help"
        />
      </SidebarSection>
    </div>
  );
}
