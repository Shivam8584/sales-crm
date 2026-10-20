"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import MenuIcon from "@/public/assets/icons/menu.svg";

export function Page({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      {children}
    </div>
  );
}

type Crumb = { label: string; href?: string };

type PageHeaderProps = {
  /** Trail before the current page, e.g. `[{ label: "Accounts", href: "/accounts" }]`. */
  crumbs?: Crumb[];
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

/** The fixed bar at the top of every page: navigation toggle, location and page actions. */
export function PageHeader({
  crumbs = [],
  title,
  meta,
  actions,
}: PageHeaderProps) {
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const { belowLg } = useMobileBreakpoints();
  const unread = useQuery(api.notifications.unreadCount, belowLg ? {} : "skip");

  return (
    <header className="border-border flex h-13 shrink-0 items-center gap-2 border-b px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="-ml-1.5 lg:hidden"
        aria-label={
          unread
            ? `Open navigation, ${unread} unread notifications`
            : "Open navigation"
        }
        onClick={() => setSidebarOpen(true)}
      >
        <MenuIcon aria-hidden className="size-3.5" />
        {unread ? (
          <span
            aria-hidden
            className="bg-primary ring-background absolute top-1 right-1 size-2 rounded-full ring-2"
          />
        ) : null}
      </Button>
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-1.5"
      >
        {crumbs.map((crumb) => (
          <span
            key={crumb.label}
            className="flex shrink-0 items-center gap-1.5 max-sm:hidden"
          >
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="lead-style text-fg-tertiary hover:text-foreground duration-fast rounded-sm transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="lead-style text-fg-tertiary">{crumb.label}</span>
            )}
            <span aria-hidden className="text-fg-disabled">
              /
            </span>
          </span>
        ))}
        <h1 className="lead-style truncate font-medium">{title}</h1>
        {meta && <span className="flex shrink-0 items-center">{meta}</span>}
      </nav>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/** Filters and view controls directly under the header. */
export function PageToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}
