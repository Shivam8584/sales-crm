"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";
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

const GLASS =
  "bg-background/80 shadow-[0_8px_30px_-8px_rgb(10_11_13/0.22),0_0_0_1px_rgb(10_11_13/0.06)] backdrop-blur-xl dark:shadow-[0_8px_30px_-8px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.08)]";

const TAB =
  "text-fg-tertiary data-[active=true]:bg-overlay-3 data-[active=true]:text-foreground focus-visible:ring-ring relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-full text-[11px] leading-none font-medium outline-none transition-[background-color,color,scale] duration-base active:scale-[0.97] focus-visible:ring-2";

/** Phone and tablet navigation: a floating tab bar plus a sheet holding everything else. */
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
      className="flex shrink-0 items-center gap-2.5 px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden"
    >
      <ul
        className={cn(
          "flex h-15 min-w-0 flex-1 gap-1 rounded-full p-1.5",
          GLASS,
        )}
      >
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
                <span className="relative">
                  <item.icon aria-hidden className="size-5" />
                  {item.count?.alert && count ? (
                    <span
                      aria-hidden
                      className="bg-foreground ring-background absolute -top-0.5 -right-1 size-2 rounded-full ring-2"
                    />
                  ) : null}
                </span>
                <span className="max-w-full truncate px-1">{item.label}</span>
                {count ? (
                  <span className="sr-only">
                    {count} {item.count?.label}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="More"
            data-active={moreActive}
            className={cn(
              "text-fg-secondary data-[active=true]:text-foreground focus-visible:ring-ring duration-base grid size-15 shrink-0 cursor-pointer place-items-center rounded-full transition-[scale,color] outline-none focus-visible:ring-2 active:scale-[0.97]",
              GLASS,
            )}
          >
            <DotsIcon aria-hidden className="size-5" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="pb-[max(env(safe-area-inset-bottom),1.5rem)]"
        >
          <span
            aria-hidden
            className="bg-foreground/15 mx-auto mt-2 block h-1 w-9 shrink-0 rounded-full"
          />
          <SheetHeader className="h-14">
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">
              Every section of the workspace
            </SheetDescription>
            <SheetClose asChild>
              <Button
                variant="well"
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
              <SidebarSection key={section.title} title={section.title}>
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
                    indicator="more"
                  />
                ))}
              </SidebarSection>
            ))}
            <SidebarFooter onNavigate={close} indicator="more" />
            <SidebarPins
              collapsed={false}
              onNavigate={close}
              indicator="more"
            />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
