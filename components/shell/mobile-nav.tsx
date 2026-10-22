"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/_ui/sheet";
import { useViewer } from "@/hooks/use-viewer";
import { cn } from "@/lib/utils";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import XIcon from "@/public/assets/icons/x.svg";
import { isActive, navSections } from "./navigation";
import SidebarFooter from "./sidebar/sidebar-footer";
import SidebarNavItem from "./sidebar/sidebar-nav-item";
import SidebarPins from "./sidebar/sidebar-pins";
import SidebarSection from "./sidebar/sidebar-section";
import { useNavCounts } from "./use-nav-counts";

const TAB =
  "text-fg-tertiary data-[active=true]:text-foreground hover:text-foreground focus-visible:ring-ring caption-style relative flex h-12 w-full flex-col items-center justify-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-inset";

function TabIcon({
  icon: Icon,
  count,
  alert,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  count?: number;
  alert?: boolean;
}) {
  return (
    <span className="relative">
      <Icon aria-hidden className="size-4" />
      {alert && count !== undefined && count > 0 && (
        <CountBadge
          aria-hidden
          className="ring-sidebar absolute -top-1.5 left-full -ml-1 h-3.5 min-w-3.5 px-0.5 text-[10px] ring-2"
        >
          {count > 99 ? "99+" : count}
        </CountBadge>
      )}
    </span>
  );
}

/** Phone and tablet navigation: the tab-bar items plus a sheet holding everything else. */
export default function MobileNav() {
  const pathname = usePathname();
  const { role } = useViewer();
  const counts = useNavCounts();
  const [open, setOpen] = useState(false);
  const sections = navSections(role);
  const tabs = sections.flatMap((section) =>
    section.items.filter((item) => item.tab),
  );
  const more = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.tab),
    }))
    .filter((section) => section.items.length > 0);
  const moreActive = !tabs.some((item) => isActive(pathname, item.href));
  const close = () => setOpen(false);

  return (
    <nav
      aria-label="Primary"
      data-tour="nav"
      className="border-sidebar-border bg-sidebar shrink-0 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex">
        {tabs.map((item) => {
          const active = isActive(pathname, item.href);
          const count = item.count && counts?.[item.count.key];
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                data-tour={item.tour}
                data-active={active}
                aria-current={active ? "page" : undefined}
                className={TAB}
              >
                <TabIcon
                  icon={item.icon}
                  count={count}
                  alert={item.count?.alert}
                />
                <span className="truncate">{item.label}</span>
                {count ? (
                  <span className="sr-only">
                    {count} {item.count?.label}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                data-active={moreActive}
                className={cn(TAB, "cursor-pointer")}
              >
                <TabIcon icon={DotsIcon} />
                <span>More</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)]"
            >
              <SheetHeader className="border-sidebar-border px-4">
                <SheetTitle>More</SheetTitle>
                <SheetDescription className="sr-only">
                  Every section of the workspace
                </SheetDescription>
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="-mr-1"
                    aria-label="Close"
                  >
                    <XIcon aria-hidden className="size-3.5" />
                  </Button>
                </SheetClose>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {more.map((section) => (
                  <SidebarSection
                    key={section.title}
                    title={section.title}
                    className="border-sidebar-border border-b"
                  >
                    {section.items.map((item) => (
                      <SidebarNavItem
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
                        active={isActive(pathname, item.href)}
                        onClick={close}
                        count={item.count && counts?.[item.count.key]}
                        countLabel={item.count?.label}
                        alert={item.count?.alert}
                      />
                    ))}
                  </SidebarSection>
                ))}
                <SidebarPins collapsed={false} onNavigate={close} />
                <SidebarFooter
                  onNavigate={close}
                  className="border-sidebar-border border-t"
                />
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
