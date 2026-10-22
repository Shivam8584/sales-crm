"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { buttonVariants } from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import { Page, PageHeader, PageStatus } from "@/components/shell/page";
import {
  SETTINGS_PAGES,
  canOpenSetting,
  isActive,
} from "@/components/shell/navigation";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import UserIcon from "@/public/assets/icons/kanban/user-03.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import LinkIcon from "@/public/assets/icons/link.svg";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import ListIcon from "@/public/assets/icons/list.svg";

type SettingsHref = (typeof SETTINGS_PAGES)[number]["href"];

const ICONS: Record<SettingsHref, ComponentType<SVGProps<SVGSVGElement>>> = {
  "/settings/profile": UserIcon,
  "/settings/team": UsersIcon,
  "/settings/workspace": BuildingIcon,
  "/settings/fields": ListIcon,
  "/settings/duplicates": UsersIcon,
  "/settings/integrations": LinkIcon,
  "/settings/system": ActivityIcon,
};

const GROUPS: { title: string; hrefs: SettingsHref[] }[] = [
  { title: "Personal", hrefs: ["/settings/profile"] },
  {
    title: "Workspace",
    hrefs: [
      "/settings/team",
      "/settings/workspace",
      "/settings/fields",
      "/settings/duplicates",
      "/settings/integrations",
      "/settings/system",
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
    "/settings/team": activeMembers?.length,
  };
  // The members table fills the content area like every other list.
  const fullBleed = isActive(pathname, "/settings/team");

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: "Settings" }]}
        title={current?.label ?? "Settings"}
        meta={<PageStatus>{ROLE_LABEL[viewer.role]}</PageStatus>}
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
            {GROUPS.map((group, index) => {
              const items = pages.filter((page) =>
                group.hrefs.includes(page.href),
              );
              if (items.length === 0) return null;
              return (
                <div
                  key={group.title}
                  className={cn(
                    "flex flex-col gap-1 p-3",
                    index < GROUPS.length - 1 && "border-border border-b",
                  )}
                >
                  <h2 className="eyebrow-style text-fg-tertiary px-2 py-1 font-medium">
                    {group.title}
                  </h2>
                  <ul className="flex flex-col gap-px">
                    {items.map((page) => (
                      <NavItem
                        key={page.href}
                        href={page.href}
                        label={page.label}
                        icon={ICONS[page.href]}
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
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-16 sm:px-8 md:pt-8">
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
  icon: Icon,
  count,
  active,
}: {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
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
          "group h-8 gap-1.5 py-0 font-normal",
        )}
      >
        <Icon
          aria-hidden
          className="text-fg-tertiary group-hover:text-icon group-data-[active=true]:text-icon duration-fast ease-power3-out size-3.5 shrink-0 transition-colors"
        />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {count !== undefined && count > 0 && <CountBadge>{count}</CountBadge>}
      </Link>
    </li>
  );
}
