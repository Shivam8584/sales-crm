"use client";

import {
  Fragment,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Kbd from "@/components/_ui/kbd";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
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
  /** One primary action, plus a `PageActions` overflow menu for the rest. */
  actions?: ReactNode;
  /** Hide the mobile navigation button, e.g. outside the app shell. */
  navToggle?: boolean;
};

/** The 52px bar at the top of every page: navigation toggle, location and page actions. */
export function PageHeader({
  crumbs = [],
  title,
  meta,
  actions,
  navToggle = true,
}: PageHeaderProps) {
  const parent = [...crumbs].reverse().find((crumb) => crumb.href);
  return (
    <header className="border-border flex h-13 shrink-0 items-center gap-2 border-b px-4 sm:gap-3">
      {navToggle && <MobileNavButton />}
      {parent?.href && (
        <Link
          href={parent.href}
          aria-label={`Back to ${parent.label}`}
          className="text-fg-tertiary hover:text-foreground hover:bg-overlay-2 focus-visible:ring-ring duration-fast -ml-1 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 sm:hidden"
        >
          <ChevronDownIcon aria-hidden className="size-3 rotate-90" />
        </Link>
      )}
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-1.5"
      >
        {crumbs.map((crumb) => (
          <Fragment key={crumb.label}>
            {crumb.href ? (
              <Link
                href={crumb.href}
                title={crumb.label}
                className="lead-style text-fg-tertiary hover:text-foreground focus-visible:ring-ring duration-fast max-w-40 min-w-0 shrink truncate rounded-sm py-1 transition-colors outline-none focus-visible:ring-2 max-sm:hidden"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                title={crumb.label}
                className="lead-style text-fg-tertiary max-w-40 min-w-0 shrink truncate py-1 max-sm:hidden"
              >
                {crumb.label}
              </span>
            )}
            <span
              aria-hidden
              className="text-fg-disabled shrink-0 max-sm:hidden"
            >
              /
            </span>
          </Fragment>
        ))}
        <h1
          title={typeof title === "string" ? title : undefined}
          className="lead-style min-w-0 shrink-[0.5] truncate py-1 font-medium"
        >
          {title}
        </h1>
        {meta && (
          <span className="flex shrink-0 items-center gap-2 pl-0.5">
            {meta}
          </span>
        )}
      </nav>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

function MobileNavButton() {
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const { belowLg } = useMobileBreakpoints();
  const unread = useQuery(api.notifications.unreadCount, belowLg ? {} : "skip");
  return (
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
          className="bg-primary ring-background absolute top-0.5 right-0.5 size-1.5 rounded-full ring-2"
        />
      ) : null}
    </Button>
  );
}

export type PageAction = {
  label: string;
  onSelect?: () => void;
  href?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  shortcut?: string;
  tone?: "danger";
  disabled?: boolean;
  /** Draws a separator above this item. */
  separated?: boolean;
};

/**
 * Header actions: an optional primary button followed by a "…" menu holding
 * every secondary action. Pass `false`/`null` entries to skip items conditionally.
 */
export function PageActions({
  primary,
  actions = [],
  label = "More actions",
}: {
  primary?: ReactNode;
  actions?: (PageAction | false | null | undefined)[];
  label?: string;
}) {
  const router = useRouter();
  const items = actions.filter((item): item is PageAction => Boolean(item));
  return (
    <>
      {items.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              className="data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground"
            >
              <DotsIcon aria-hidden className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.separated && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={item.disabled}
                  onSelect={() => {
                    if (item.href) router.push(item.href);
                    item.onSelect?.();
                  }}
                  className={cn(item.tone === "danger" && "text-danger")}
                >
                  {item.icon && (
                    <item.icon
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0",
                        item.tone === "danger"
                          ? "text-danger"
                          : "text-fg-tertiary",
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.shortcut && (
                    <Kbd className="h-4 min-w-4 px-1">{item.shortcut}</Kbd>
                  )}
                </DropdownMenuItem>
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {primary}
    </>
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
        "border-border flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
