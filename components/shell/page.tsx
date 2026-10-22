"use client";

import {
  Fragment,
  createContext,
  useContext,
  useId,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Tabs as TabsPrimitive } from "radix-ui";
import Button from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Kbd from "@/components/_ui/kbd";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import Tooltip from "@/components/_ui/tooltip";
import NotificationBell from "@/features/notifications/notification-bell";
import { can } from "@/convex/lib/permissions";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { useUrlState } from "@/hooks/use-url-state";
import { useViewer } from "@/hooks/use-viewer";
import { MOD_KEY } from "@/lib/keyboard";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import SearchIcon from "@/public/assets/icons/search.svg";
import ShareIcon from "@/public/assets/icons/share.svg";
import XIcon from "@/public/assets/icons/x.svg";
import Wordmark from "@/public/assets/images/_common/logo-wordmark.svg";
import UserMenu from "./user-menu";

/**
 * Pages declare views, create and export where their data lives, but the layout
 * draws them elsewhere: views join the toolbar row, create and export sit in the
 * head. Slots let them move without each page restructuring its JSX.
 */
type Slots = {
  head: HTMLElement | null;
  toolbar: HTMLElement | null;
  setHead: (node: HTMLElement | null) => void;
  setToolbar: (node: HTMLElement | null) => void;
};
const SlotsContext = createContext<Slots | null>(null);
const InToolbarContext = createContext(false);

function Slot({
  target,
  children,
}: {
  target: "head" | "toolbar";
  children: ReactNode;
}) {
  const slots = useContext(SlotsContext);
  const node = slots?.[target];
  return node ? createPortal(children, node) : children;
}

export function Page({
  children,
  wide = false,
  className,
}: {
  children: ReactNode;
  /** Boards and canvases use the full width; everything else sits in the 1200px column. */
  wide?: boolean;
  className?: string;
}) {
  const [head, setHead] = useState<HTMLElement | null>(null);
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);
  return (
    <SlotsContext.Provider value={{ head, toolbar, setHead, setToolbar }}>
      <div
        data-wide={wide || undefined}
        className={cn(
          "@container/page mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col",
          !wide && "max-w-[calc(1200px+2*var(--page-x))]",
          className,
        )}
      >
        {children}
      </div>
    </SlotsContext.Provider>
  );
}

type Crumb = { label: string; href?: string };

type PageHeaderProps = {
  /** Trail before the current page, e.g. `[{ label: "Accounts", href: routes.accounts }]`. */
  crumbs?: Crumb[];
  title: ReactNode;
  /** Under the title: a `PageStatus`, a count or a short note. */
  meta?: ReactNode;
  /** Page actions at the right end of the head. */
  actions?: ReactNode;
  /** Search, notifications and the account menu; they need a signed-in member. */
  globalActions?: boolean;
  /** A logo or avatar before the title, on record pages. */
  lead?: ReactNode;
};

/** The top bar (search, notifications, account) and the page head: crumbs, a large title, one meta line and the actions. */
export function PageHeader({
  crumbs = [],
  title,
  meta,
  actions,
  globalActions = true,
  lead,
}: PageHeaderProps) {
  const slots = useContext(SlotsContext);
  const parent = [...crumbs].reverse().find((crumb) => crumb.href);
  return (
    <header data-slot="page-header" className="shrink-0">
      {globalActions && <TopBar />}
      <div
        className={cn(
          "rise short:pb-3 flex items-end gap-4 px-(--page-x) pb-5",
          globalActions ? "short:pt-1 pt-2 lg:pt-6" : "pt-6",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-5">
          {lead}
          <div className="min-w-0 flex-1">
            {crumbs.length > 0 && (
              <nav
                aria-label="Breadcrumb"
                className="text-fg-tertiary mb-1 flex min-w-0 items-center gap-1.5 text-sm"
              >
                {parent?.href && (
                  <Link
                    href={parent.href}
                    className="hover:text-foreground focus-visible:ring-ring -ml-0.5 flex items-center gap-1 rounded-sm transition-colors outline-none focus-visible:ring-2 sm:hidden"
                  >
                    <ChevronDownIcon aria-hidden className="size-3 rotate-90" />
                    {parent.label}
                  </Link>
                )}
                {crumbs.map((crumb, index) => (
                  <Fragment key={crumb.label}>
                    {index > 0 && (
                      <span
                        aria-hidden
                        className="text-fg-disabled max-sm:hidden"
                      >
                        /
                      </span>
                    )}
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        title={crumb.label}
                        className="hover:text-foreground focus-visible:ring-ring max-w-48 truncate rounded-sm transition-colors outline-none focus-visible:ring-2 max-sm:hidden"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        title={crumb.label}
                        className="max-w-48 truncate max-sm:hidden"
                      >
                        {crumb.label}
                      </span>
                    )}
                  </Fragment>
                ))}
              </nav>
            )}
            <h1
              title={typeof title === "string" ? title : undefined}
              className="text-display short:text-2xl lg:text-hero truncate font-semibold"
            >
              {title}
            </h1>
            {meta && (
              <div className="text-body text-fg-secondary mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 tabular-nums max-[399px]:hidden">
                {meta}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-0.5 max-[359px]:gap-1">
          {actions}
          <span ref={slots?.setHead} className="contents" />
        </div>
      </div>
    </header>
  );
}

function TopBar() {
  return (
    <div className="flex h-14 items-center gap-1 px-(--page-x) lg:grid lg:h-16 lg:grid-cols-12 lg:gap-x-8">
      <Link
        href={routes.today}
        aria-label="Hypedrive, go to Today"
        className="focus-visible:ring-ring mr-auto rounded-md outline-none focus-visible:ring-2 lg:hidden"
      >
        <Wordmark aria-hidden className="text-foreground h-[18px] w-[90px]" />
      </Link>
      <SearchButton />
      <div className="flex items-center justify-end gap-1 lg:col-span-4">
        <NotificationBell />
        <UserMenu />
      </div>
    </div>
  );
}

function SearchButton() {
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setCommandOpen(true)}
        className="size-10 lg:hidden"
      >
        <SearchIcon aria-hidden className="size-4" />
      </Button>
      <button
        type="button"
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        data-tour="search"
        onClick={() => setCommandOpen(true)}
        className="bg-well text-fg-tertiary hover:bg-well-hover focus-visible:ring-ring duration-base col-span-8 hidden h-10 w-full max-w-160 cursor-pointer items-center gap-2.5 rounded-full pr-2 pl-4 text-left text-sm transition-[background-color,scale] outline-none hover:duration-[120ms] focus-visible:ring-2 active:scale-[0.99] lg:flex"
      >
        <SearchIcon aria-hidden className="size-4 shrink-0" />
        <span className="flex-1 truncate">Search accounts, people, deals</span>
        <Kbd suppressHydrationWarning>
          {MOD_KEY === "⌘" ? "⌘K" : `${MOD_KEY} K`}
        </Kbd>
      </button>
    </>
  );
}

const STATUS_DOT = {
  success: "bg-status",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-fg-disabled",
} as const;

/** Status for `PageHeader`'s `meta`, e.g. `<PageStatus>Active</PageStatus>`. */
export function PageStatus({
  tone = "success",
  children,
}: {
  tone?: keyof typeof STATUS_DOT;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[tone])}
      />
      {children}
    </span>
  );
}

export type PageView = {
  id: string;
  label: string;
  /** Omit to show no count; pass `undefined` explicitly while it loads. */
  count?: number;
};

/**
 * Saved views as a segmented well at the start of the toolbar row. The
 * selection lives in the URL (`?view=` by default; the first view is the
 * default and is left out of the URL), or pass `value` and `onChange` to control it.
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
  const id = useId();
  const slots = useContext(SlotsContext);
  const [urlValue, setUrlValue] = useUrlState(param, views[0]?.id ?? "");
  const current = value ?? urlValue;
  const select = onChange ?? setUrlValue;
  return (
    <Slot target="toolbar">
      <TabsPrimitive.Root
        data-slot="page-views"
        value={current}
        onValueChange={select}
        className={cn(
          "flex min-w-0 shrink-0",
          slots?.toolbar
            ? "max-sm:order-first max-sm:basis-full"
            : "px-(--page-x) pb-4",
        )}
      >
        <TabsPrimitive.List
          aria-label={label}
          className="bg-well scrollbar-none inline-flex h-10 max-w-full items-center overflow-x-auto rounded-full p-1"
        >
          {views.map((view) => (
            <TabsPrimitive.Trigger
              key={view.id}
              value={view.id}
              className="text-fg-secondary hover:text-foreground data-[state=active]:text-foreground focus-visible:ring-ring duration-base relative flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-[color,scale] outline-none focus-visible:ring-2 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              {current === view.id && (
                <motion.span
                  aria-hidden
                  layoutId={`${id}-view`}
                  transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
                  className="bg-background shadow-capsule absolute inset-0 rounded-full"
                />
              )}
              <span className="relative">{view.label}</span>
              {"count" in view && (
                <span className="text-fg-disabled relative font-normal tabular-nums">
                  {view.count === undefined ? "–" : view.count}
                </span>
              )}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </TabsPrimitive.Root>
    </Slot>
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
                  "data-[state=open]:bg-well size-10",
                  items.length === 0 && "sm:hidden",
                )}
              >
                <DotsIcon aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-52">
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
 * Views, search and filters on the left, view actions on the right. Filters
 * stay on one row and scroll sideways when they don't fit; on phones they move
 * to a row of their own under search and the actions. Pass `activeFilters`
 * (0 for none) when `children` are only filters: phones then get a "Filters"
 * button that opens them in a bottom sheet instead. `onClearFilters` adds
 * "Clear all" there and hides the children's own `data-filter-clear` button.
 * `CreateButton` and `ExportButton` passed in `actions` move up into the head.
 */
export function PageToolbar({
  search,
  children,
  actions,
  activeFilters,
  onClearFilters,
  className,
}: {
  search?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  activeFilters?: number;
  onClearFilters?: () => void;
  className?: string;
}) {
  const slots = useContext(SlotsContext);
  const { belowSm } = useMobileBreakpoints();
  const sheet = Boolean(children) && activeFilters !== undefined;
  return (
    <div
      data-slot="page-toolbar"
      className={cn(
        "rise short:pb-2 flex shrink-0 flex-wrap items-center gap-2 px-(--page-x) pb-4 [--i:1] sm:flex-nowrap",
        className,
      )}
    >
      <span ref={slots?.setToolbar} className="contents" />
      {search && (
        <div className="flex min-w-28 flex-1 sm:flex-none">{search}</div>
      )}
      {sheet && (
        <FilterSheet
          active={activeFilters ?? 0}
          onClear={onClearFilters}
          enabled={belowSm}
        >
          {children}
        </FilterSheet>
      )}
      {children && !(sheet && belowSm) && (
        <div
          className={cn(
            "scrollbar-none -my-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto mask-r-from-[calc(100%-1.5rem)] py-1 pr-4",
            sheet
              ? "max-sm:hidden"
              : search && "max-sm:order-last max-sm:basis-full",
          )}
        >
          {children}
        </div>
      )}
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <InToolbarContext.Provider value>{actions}</InToolbarContext.Provider>
        </div>
      )}
    </div>
  );
}

function FilterSheet({
  active,
  onClear,
  enabled,
  children,
}: {
  active: number;
  onClear?: () => void;
  enabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open && enabled} onOpenChange={setOpen}>
      <Button
        variant="well"
        size="md"
        aria-label={active > 0 ? `Filters, ${active} active` : "Filters"}
        data-active={active > 0}
        onClick={() => setOpen(true)}
        className="max-[359px]:w-10 max-[359px]:px-0 sm:hidden"
      >
        <FilterIcon aria-hidden className="size-3.5" />
        <span className="max-[359px]:sr-only">Filters</span>
        {active > 0 && (
          <CountBadge className="text-foreground max-[359px]:hidden">
            {active}
          </CountBadge>
        )}
      </Button>
      <SheetContent side="bottom">
        <SheetHeader className="px-5">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription className="sr-only">
            Narrow down the list
          </SheetDescription>
          <SheetClose asChild>
            <Button
              variant="well"
              size="icon-sm"
              className="-mr-1"
              aria-label="Close filters"
            >
              <XIcon aria-hidden className="size-3.5" />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="scrollbar-none flex min-h-0 flex-1 flex-col items-start gap-3 overflow-y-auto px-5 pb-5 [&_[data-filter-clear]]:hidden">
          {children}
        </div>
        <SheetFooter className="px-5">
          {onClear && (
            <Button
              variant="ghost"
              size="md"
              disabled={active === 0}
              onClick={onClear}
              className="-ml-2"
            >
              Clear all
            </Button>
          )}
          <SheetClose asChild>
            <Button variant="primary" size="md" className="ml-auto">
              Done
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function HeadSlot({ children }: { children: ReactNode }) {
  const inToolbar = useContext(InToolbarContext);
  return inToolbar ? <Slot target="head">{children}</Slot> : children;
}

/** Outline "Export" button; icon-only on phones, hidden below manager. In a toolbar it sits in the page head. */
export function ExportButton({
  onClick,
  disabled,
  label = "Export",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const viewer = useViewer();
  if (!can(viewer, "record.export")) return null;
  return (
    <HeadSlot>
      <Button
        variant="secondary"
        size="md"
        onClick={onClick}
        disabled={disabled}
        className="max-sm:w-10 max-sm:px-0"
      >
        <ShareIcon aria-hidden className="text-fg-secondary size-3.5" />
        <span className="max-sm:sr-only">{label}</span>
      </Button>
    </HeadSlot>
  );
}

/** The page's ink "New …" button; `C` triggers the same create flow. `quiet` when another action on the page is the primary. */
export function CreateButton({
  onClick,
  quiet = false,
  children,
}: {
  onClick: () => void;
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <HeadSlot>
      <Tooltip content={children} shortcut="C">
        <Button
          variant={quiet ? "secondary" : "primary"}
          size="md"
          onClick={onClick}
          data-tour="create"
          aria-label={typeof children === "string" ? children : undefined}
          className="max-sm:w-10 max-sm:px-0"
        >
          <PlusIcon aria-hidden className="size-3.5" />
          <span className="max-sm:hidden">{children}</span>
        </Button>
      </Tooltip>
    </HeadSlot>
  );
}
