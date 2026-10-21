"use client";

import {
  Fragment,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Kbd from "@/components/_ui/kbd";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/_ui/tabs";
import NotificationBell from "@/features/notifications/notification-bell";
import { useUrlState } from "@/hooks/use-url-state";
import { MOD_KEY } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import ActiveDot from "@/public/assets/icons/active-dot.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import MenuIcon from "@/public/assets/icons/menu.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import SearchIcon from "@/public/assets/icons/search.svg";
import ShareIcon from "@/public/assets/icons/share.svg";
import UserMenu from "./user-menu";

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
  /** Next to the title: a `PageStatus`, a count or a short note. */
  meta?: ReactNode;
  /** Page actions, placed before the search, notifications and account buttons. */
  actions?: ReactNode;
  /** Hide the mobile navigation button, e.g. outside the app shell. */
  navToggle?: boolean;
  /** Search, notifications and the account menu; they need a signed-in member. */
  globalActions?: boolean;
};

/**
 * The bar at the top of every page: location on the left; page actions, search,
 * notifications and the account menu on the right. It drops its bottom line
 * when `PageViews` or `PageToolbar` follows, as those draw their own.
 */
export function PageHeader({
  crumbs = [],
  title,
  meta,
  actions,
  navToggle = true,
  globalActions = true,
}: PageHeaderProps) {
  const parent = [...crumbs].reverse().find((crumb) => crumb.href);
  return (
    <header
      data-slot="page-header"
      className="border-border short:h-12 flex h-14.5 shrink-0 items-center gap-2 border-b px-4 [&:has(+[data-slot=page-toolbar])]:border-b-0 [&:has(+[data-slot=page-views])]:border-b-0"
    >
      {navToggle && <MobileNavButton />}
      {parent?.href && (
        <Link
          href={parent.href}
          aria-label={`Back to ${parent.label}`}
          className="text-fg-tertiary hover:text-foreground hover:bg-overlay-2 focus-visible:ring-ring duration-fast flex size-7 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 sm:hidden"
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
                className="text-fg-tertiary hover:text-foreground focus-visible:ring-ring duration-fast max-w-40 min-w-0 shrink truncate rounded-sm py-1 text-base leading-none transition-colors outline-none focus-visible:ring-2 max-sm:hidden"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                title={crumb.label}
                className="text-fg-tertiary max-w-40 min-w-0 shrink truncate py-1 text-base leading-none max-sm:hidden"
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
          className="min-w-0 shrink-[0.5] truncate py-1 text-base leading-none font-medium tracking-[-0.01em] max-sm:shrink"
        >
          {title}
        </h1>
        {meta && (
          <span className="flex shrink-0 items-center gap-2 pl-0.5 max-[399px]:hidden">
            {meta}
          </span>
        )}
      </nav>
      <div className="flex shrink-0 items-center gap-2 max-[359px]:gap-1">
        {actions && (
          <div className="flex items-center gap-1.5 sm:gap-2">{actions}</div>
        )}
        {actions && globalActions && (
          <span aria-hidden className="bg-border h-4 w-px max-sm:hidden" />
        )}
        {globalActions && (
          <>
            <SearchButton />
            <NotificationBell />
            <UserMenu />
          </>
        )}
      </div>
    </header>
  );
}

function SearchButton() {
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  return (
    <Tooltip content="Search" shortcut={`${MOD_KEY} K`}>
      <Button
        variant="secondary"
        size="icon"
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setCommandOpen(true)}
      >
        <SearchIcon aria-hidden className="size-3.5" />
      </Button>
    </Tooltip>
  );
}

function MobileNavButton() {
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  return (
    <Button
      variant="secondary"
      size="icon"
      className="lg:hidden"
      aria-label="Open navigation"
      onClick={() => setSidebarOpen(true)}
    >
      <MenuIcon aria-hidden className="size-3.5" />
    </Button>
  );
}

const STATUS_DOT = {
  success: "text-status",
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-fg-tertiary",
} as const;

/** Status pill for `PageHeader`'s `meta`, e.g. `<PageStatus>Active</PageStatus>`. */
export function PageStatus({
  tone = "success",
  children,
}: {
  tone?: keyof typeof STATUS_DOT;
  children: ReactNode;
}) {
  return (
    <Tag tone="neutral" size="xs" className="text-foreground gap-0.5 pl-0.5">
      <ActiveDot aria-hidden className={cn("size-3", STATUS_DOT[tone])} />
      {children}
    </Tag>
  );
}

export type PageView = {
  id: string;
  label: string;
  /** Omit to show no count; pass `undefined` explicitly while it loads. */
  count?: number;
};

/**
 * Saved views as underline tabs under the header. The selection lives in the
 * URL (`?view=` by default; the first view is the default and is left out of
 * the URL), or pass `value` and `onChange` to control it.
 */
export function PageViews({
  views,
  value,
  onChange,
  param = "view",
  label = "Views",
}: {
  views: PageView[];
  value?: string;
  onChange?: (id: string) => void;
  param?: string;
  label?: string;
}) {
  const [urlValue, setUrlValue] = useUrlState(param, views[0]?.id ?? "");
  const current = value ?? urlValue;
  const select = onChange ?? setUrlValue;
  return (
    <Tabs
      data-slot="page-views"
      value={current}
      onValueChange={select}
      className="shrink-0"
    >
      <TabsList
        aria-label={label}
        className="scrollbar-none overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--border)]"
      >
        {views.map((view) => (
          <TabsTrigger
            key={view.id}
            value={view.id}
            className="short:py-2.5 shrink-0 py-3.5"
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {view.label}
              {"count" in view && (
                <span className="text-fg-tertiary font-normal tabular-nums">
                  {view.count === undefined ? "–" : view.count}
                </span>
              )}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
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
 * With `primaryItem`, phones move the primary into the menu so the title keeps its room.
 */
export function PageActions({
  primary,
  primaryItem,
  actions = [],
  label = "More actions",
}: {
  primary?: ReactNode;
  primaryItem?: PageAction | false | null;
  actions?: (PageAction | false | null | undefined)[];
  label?: string;
}) {
  const router = useRouter();
  const items = actions.filter((item): item is PageAction => Boolean(item));
  const mobileItem = primary && primaryItem ? primaryItem : null;
  const select = (item: PageAction) => {
    if (item.href) router.push(item.href);
    item.onSelect?.();
  };
  return (
    <>
      {(items.length > 0 || mobileItem) && (
        <DropdownMenu>
          <Tooltip content={label}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                aria-label={label}
                className={cn(
                  "data-[state=open]:bg-muted",
                  items.length === 0 && "sm:hidden",
                )}
              >
                <DotsIcon aria-hidden className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-48">
            {mobileItem && (
              <>
                <MenuAction
                  item={mobileItem}
                  onSelect={() => select(mobileItem)}
                  className="sm:hidden"
                />
                {items.length > 0 && (
                  <DropdownMenuSeparator className="sm:hidden" />
                )}
              </>
            )}
            {items.map((item) => (
              <Fragment key={item.label}>
                {item.separated && <DropdownMenuSeparator />}
                <MenuAction item={item} onSelect={() => select(item)} />
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {primary &&
        (mobileItem ? (
          <span className="flex max-sm:hidden">{primary}</span>
        ) : (
          primary
        ))}
    </>
  );
}

function MenuAction({
  item,
  onSelect,
  className,
}: {
  item: PageAction;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <DropdownMenuItem
      disabled={item.disabled}
      onSelect={onSelect}
      className={cn(item.tone === "danger" && "text-danger", className)}
    >
      {item.icon && (
        <item.icon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0",
            item.tone === "danger" ? "text-danger" : "text-fg-tertiary",
          )}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.shortcut && <Kbd className="h-4 min-w-4 px-1">{item.shortcut}</Kbd>}
    </DropdownMenuItem>
  );
}

/**
 * Filters on the left, view actions on the right (`ExportButton`, `CreateButton`).
 * On phones the filters scroll sideways instead of wrapping.
 */
export function PageToolbar({
  children,
  actions,
  className,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn(
        "border-border short:py-2 flex min-h-12 shrink-0 items-center gap-2 border-b px-4 py-3 sm:py-4",
        className,
      )}
    >
      <div className="scrollbar-none relative -my-1 flex min-w-0 flex-1 items-center gap-2 py-1 max-sm:overflow-x-auto sm:flex-wrap">
        {children}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}

/** Secondary "Export" button for `PageToolbar` actions; icon-only on phones. */
export function ExportButton({
  onClick,
  disabled,
  label = "Export",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-control-md max-sm:w-control-md py-0 max-sm:px-0"
    >
      <ShareIcon aria-hidden className="size-3" />
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
}

/** The page's primary "New …" button; `C` triggers the same create flow. */
export function CreateButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={children} shortcut="C">
      <Button
        variant="primary"
        size="sm"
        onClick={onClick}
        className="h-control-md py-0"
      >
        <PlusIcon aria-hidden className="size-3" />
        {children}
      </Button>
    </Tooltip>
  );
}
