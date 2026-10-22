"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/_ui/scroll-area";
import Tooltip from "@/components/_ui/tooltip";
import { useViewer } from "@/hooks/use-viewer";
import {
  toggleSidebarCollapsed,
  useSidebarCollapsed,
} from "@/lib/sidebar-collapse";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import Wordmark from "@/public/assets/images/_common/logo-wordmark.svg";
import SidebarIcon from "@/public/assets/icons/sidebar.svg";
import { isActive, navSections } from "../navigation";
import { useNavCounts } from "../use-nav-counts";
import SidebarFooter from "./sidebar-footer";
import SidebarNavItem, { NAV_ITEM } from "./sidebar-nav-item";
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
    <div className="group/rail flex h-full min-h-0 flex-col">
      <div className="collapsed:pl-[30px] ease-out-hd relative flex h-16 shrink-0 items-center pl-7 transition-[padding] duration-280">
        <Link
          href={routes.today}
          aria-label="Hypedrive, go to Today"
          className="focus-visible:ring-ring collapsed:w-[13px] collapsed:group-hover/rail:opacity-0 ease-out-hd -m-1 block w-[102px] overflow-hidden rounded-md p-1 transition-[width,opacity] duration-280 outline-none focus-visible:ring-2"
        >
          <Wordmark
            aria-hidden
            className="text-foreground h-5 w-[100px] max-w-none"
          />
        </Link>
        <Tooltip
          content={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          shortcut="["
          side={collapsed ? "right" : "bottom"}
        >
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={toggleSidebarCollapsed}
            className={cn(
              NAV_ITEM,
              "collapsed:right-5 collapsed:opacity-0 collapsed:group-hover/rail:opacity-100 collapsed:focus-visible:opacity-100 ease-out-hd absolute top-4 right-3 size-8 min-w-8 justify-center rounded-lg transition-[right,opacity,color,background-color] duration-280",
            )}
          >
            <SidebarIcon aria-hidden className="size-4" />
          </button>
        </Tooltip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary" data-tour="nav" className="pt-2 pb-6">
          {sections.map((section) => (
            <SidebarSection key={section.title} title={section.title}>
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
          <SidebarFooter collapsed={collapsed} />
          <SidebarPins collapsed={collapsed} />
        </nav>
      </ScrollArea>
    </div>
  );
}
