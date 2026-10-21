"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Page, PageHeader } from "@/components/shell/page";
import { SETTINGS_PAGES, isActive } from "@/components/shell/navigation";
import { useViewer } from "@/hooks/use-viewer";
import { cn } from "@/lib/utils";

/** Settings frame: section navigation beside a single content column (tabs on phones). */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const viewer = useViewer();
  const pages = SETTINGS_PAGES.filter(
    (page) => !page.adminOnly || viewer.role === "admin",
  );
  // The members table needs more room than a form column.
  const wide = isActive(pathname, "/settings/team");

  return (
    <Page>
      <PageHeader title="Settings" />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Settings"
          className="border-border shrink-0 max-md:border-b md:w-56 md:border-r md:p-3"
        >
          <ul className="scrollbar-none flex gap-5 overflow-x-auto px-4 md:flex-col md:gap-0.5 md:px-0">
            {pages.map((page) => {
              const active = isActive(pathname, page.href);
              return (
                <li key={page.href} className="shrink-0">
                  <Link
                    href={page.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-ring duration-fast relative flex items-center text-sm leading-none transition-colors outline-none focus-visible:ring-2",
                      "max-md:h-11 max-md:rounded-sm",
                      "md:h-8 md:rounded-md md:px-2.5",
                      active
                        ? "text-foreground md:bg-overlay-2 md:font-medium"
                        : "text-fg-secondary hover:text-foreground md:hover:bg-overlay-1",
                    )}
                  >
                    {page.label}
                    {active && (
                      <span
                        aria-hidden
                        className="bg-foreground absolute inset-x-0 bottom-0 h-px md:hidden"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              "mx-auto w-full px-4 pt-6 pb-16 sm:px-8 md:pt-8",
              wide ? "max-w-5xl" : "max-w-3xl",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </Page>
  );
}
