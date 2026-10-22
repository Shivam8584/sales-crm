"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { buttonVariants } from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import { Page, PageHeader } from "@/components/shell/page";
import {
  SETTINGS_PAGES,
  canOpenSetting,
  isActive,
} from "@/components/shell/navigation";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

type SettingsHref = (typeof SETTINGS_PAGES)[number]["href"];

const GROUPS: { title: string; hrefs: SettingsHref[] }[] = [
  { title: "Personal", hrefs: [routes.profile] },
  {
    title: "Workspace",
    hrefs: [
      routes.team,
      routes.workspace,
      routes.fields,
      routes.targets,
      routes.duplicates,
      routes.integrations,
      routes.system,
    ],
  },
];

/** Settings frame: grouped section navigation beside the page content (underline tabs on phones). */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const viewer = useViewer();
  const team = useQuery(api.members.team, {});
  const pages = SETTINGS_PAGES.filter((page) =>
    canOpenSetting(page, viewer.role),
  );
  const current = SETTINGS_PAGES.find((page) => isActive(pathname, page.href));
  const activeMembers = team?.filter((member) => member.status === "active");
  const counts: Partial<Record<SettingsHref, number>> = {
    [routes.team]: activeMembers?.length,
  };
  // The members table fills the content area like every other list.
  const fullBleed = isActive(pathname, routes.team);

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: "Settings" }]}
        title={current?.label ?? "Settings"}
        meta={
          <span className="caption-style text-fg-tertiary">
            {ROLE_LABEL[viewer.role]}
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Settings"
          className="border-border shrink-0 max-md:border-b md:w-56 md:border-r"
        >
          <ul className="scrollbar-none flex gap-4 overflow-x-auto px-4 md:hidden">
            {pages.map((page) => {
              const active = isActive(pathname, page.href);
              return (
                <li key={page.href} className="shrink-0">
                  <Link
                    href={page.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "caption-style focus-visible:ring-ring duration-fast relative flex h-11 items-center gap-1.5 rounded-sm transition-colors outline-none focus-visible:ring-2",
                      active
                        ? "text-foreground font-medium"
                        : "text-fg-tertiary hover:text-fg-secondary",
                    )}
                  >
                    {page.label}
                    {counts[page.href] !== undefined && (
                      <span className="text-fg-tertiary font-normal tabular-nums">
                        {counts[page.href]}
                      </span>
                    )}
                    {active && (
                      <span
                        aria-hidden
                        className="bg-foreground absolute inset-x-0 bottom-0 h-px"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col max-md:hidden">
            {GROUPS.map((group) => {
              const items = pages.filter((page) =>
                group.hrefs.includes(page.href),
              );
              if (items.length === 0) return null;
              return (
                <div key={group.title} className="flex flex-col gap-1 p-3">
                  <h2 className="caption-style text-fg-tertiary px-2 py-1">
                    {group.title}
                  </h2>
                  <ul className="flex flex-col gap-px">
                    {items.map((page) => (
                      <NavItem
                        key={page.href}
                        href={page.href}
                        label={page.label}
                        count={counts[page.href]}
                        active={isActive(pathname, page.href)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>
        {fullBleed ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-6 pb-16 sm:px-8 md:pt-8">
              {children}
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}

function NavItem({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        data-active={active}
        aria-current={active ? "page" : undefined}
        className={cn(
          buttonVariants({ variant: "nav", size: "md" }),
          "h-8 gap-1.5 py-0 font-normal",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {count !== undefined && count > 0 && <CountBadge>{count}</CountBadge>}
      </Link>
    </li>
  );
}
