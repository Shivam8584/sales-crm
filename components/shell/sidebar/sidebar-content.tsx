"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import Tooltip from "@/components/_ui/tooltip";
import { useViewer } from "@/hooks/use-viewer";
import {
  toggleSidebarCollapsed,
  useSidebarCollapsed,
} from "@/lib/sidebar-collapse";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import Logo from "@/public/assets/images/_common/logo.svg";
import SidebarIcon from "@/public/assets/icons/sidebar.svg";
import { isActive, navSections } from "../navigation";
import { useNavCounts } from "../use-nav-counts";
import SidebarFooter from "./sidebar-footer";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarPins from "./sidebar-pins";
import SidebarSection from "./sidebar-section";

/** The desktop rail: full width, or icons only when collapsed. */
export default function SidebarContent() {
  const pathname = usePathname();
  const viewer = useViewer();
  const sections = navSections(viewer.role);
  const collapsed = useSidebarCollapsed();
  const counts = useNavCounts();

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
              href={routes.today}
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
          </>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary" data-tour="nav">
          {sections.map((section, index) => (
            <SidebarSection
              key={section.title}
              title={section.title}
              className={cn(
                index < sections.length - 1 && "border-sidebar-border border-b",
              )}
            >
              {section.items.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  shortcut={item.shortcut}
                  collapsed={collapsed}
                  active={isActive(pathname, item.href)}
                  count={item.count && counts?.[item.count.key]}
                  countLabel={item.count?.label}
                  alert={item.count?.alert}
                  tour={item.tour}
                />
              ))}
            </SidebarSection>
          ))}
          <SidebarPins collapsed={collapsed} />
        </nav>
      </ScrollArea>

      <SidebarFooter
        collapsed={collapsed}
        className="border-sidebar-border shrink-0 border-t"
      />
    </div>
  );
}
