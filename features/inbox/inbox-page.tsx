"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Kbd from "@/components/_ui/kbd";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import FilterMenu from "@/components/_common/filter-menu";
import {
  Page,
  PageHeader,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import {
  isUrgentKind,
  KindIcon,
  KIND_GROUPS,
} from "@/features/notifications/kinds";
import { useNotificationActions } from "@/features/notifications/use-notification-actions";
import { useUrlState } from "@/hooks/use-url-state";
import { isEditableTarget } from "@/lib/keyboard";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import BellIcon from "@/public/assets/icons/bell.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import MailIcon from "@/public/assets/icons/mail.svg";

type Item = FunctionReturnType<typeof api.notifications.list>["items"][number];

const PAGE = 50;
const ALL = "all";
const UNREAD = "unread";
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";
const DAY = 24 * 60 * 60_000;

function dayGroup(at: number, now: number) {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (at >= startOfToday) return "Today";
  if (at >= startOfToday - DAY) return "Yesterday";
  if (at >= startOfToday - 6 * DAY) return "This week";
  return "Earlier";
}

/** Every notification for the signed-in member, with read state and filters. */
export default function InboxPage() {
  const router = useRouter();
  const [view, setView] = useUrlState("view", UNREAD);
  const [type, setType] = useUrlState("type", ALL);
  const [limit, setLimit] = useState(PAGE);
  const [cursor, setCursor] = useState<number | null>(null);
  const [now] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const { markRead, markUnread, markAllRead } = useNotificationActions();

  const group = KIND_GROUPS.find((item) => item.value === type);
  const filter = view === ALL ? "all" : "unread";
  const result = useQuery(api.notifications.list, {
    filter,
    kinds: group ? [...group.kinds] : undefined,
    limit,
  });
  const unread = useQuery(api.notifications.unreadCount);
  const items = result?.items;

  const sections = useMemo(() => {
    if (!items) return [];
    const out: { title: string; rows: { item: Item; index: number }[] }[] = [];
    items.forEach((item, index) => {
      const title = dayGroup(item._creationTime, now);
      const last = out.at(-1);
      if (last?.title === title) last.rows.push({ item, index });
      else out.push({ title, rows: [{ item, index }] });
    });
    return out;
  }, [items, now]);

  const activeCursor =
    cursor !== null && items && cursor < items.length ? cursor : null;

  function changeView(next: string) {
    setView(next);
    setLimit(PAGE);
    setCursor(null);
  }

  function changeType(next: string) {
    setType(next);
    setLimit(PAGE);
    setCursor(null);
  }

  function open(item: Item) {
    if (!item.read) void markRead({ id: item._id });
    if (item.href) router.push(item.href);
  }

  function toggleRead(item: Item) {
    if (item.read) void markUnread({ id: item._id });
    else void markRead({ id: item._id });
  }

  async function readAll() {
    const count = await markAllRead();
    if (count > 0) {
      toast(
        `Marked ${count} ${count === 1 ? "notification" : "notifications"} as read`,
      );
    }
  }

  useEffect(() => {
    if (!items) return;
    const list = items;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY))
        return;
      const move = (delta: number) => {
        if (list.length === 0) return;
        event.preventDefault();
        setCursor((current) =>
          current === null
            ? 0
            : Math.min(list.length - 1, Math.max(0, current + delta)),
        );
      };
      const item = activeCursor !== null ? list[activeCursor] : undefined;
      switch (event.key) {
        case "j":
        case "ArrowDown":
          return move(1);
        case "k":
        case "ArrowUp":
          return move(-1);
        case "Enter":
          if (!item) return;
          event.preventDefault();
          return open(item);
        case "u":
          if (!item) return;
          event.preventDefault();
          return toggleRead(item);
        case "Escape":
          return setCursor(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (activeCursor === null) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row-index="${activeCursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeCursor]);

  return (
    <Page>
      <PageHeader title="Inbox" />
      <PageViews
        label="Show"
        value={filter}
        onChange={changeView}
        views={[
          { id: UNREAD, label: "Unread", count: unread },
          { id: ALL, label: "All" },
        ]}
      />
      <PageToolbar
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!unread}
            onClick={() => void readAll()}
            className="h-control-md py-0"
          >
            <CheckCircleIcon aria-hidden className="size-3" />
            Mark all as read
          </Button>
        }
      >
        <FilterMenu
          label="Type"
          value={type}
          onChange={changeType}
          options={[
            { value: ALL, label: "Any" },
            ...KIND_GROUPS.map((item) => ({
              value: item.value,
              label: item.label,
            })),
          ]}
        />
        <span className="caption-style text-fg-tertiary ml-auto hidden items-center gap-1.5 pr-2 lg:flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          to move
          <Kbd className="ml-2">↵</Kbd>
          to open
          <Kbd className="ml-2">U</Kbd>
          read / unread
        </span>
      </PageToolbar>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {items === undefined ? (
          <InboxSkeleton />
        ) : items.length === 0 ? (
          <InboxEmpty
            view={filter}
            filtered={Boolean(group)}
            groupLabel={group?.label}
            onShowAll={() => changeView(ALL)}
            onClearFilter={() => changeType(ALL)}
          />
        ) : (
          <div className="pb-10">
            {sections.map((section) => (
              <section key={section.title} aria-label={section.title}>
                <h2 className="caption-style text-fg-tertiary bg-background/95 border-border z-sticky sticky top-0 flex h-8 items-center border-b px-4 font-medium backdrop-blur-sm">
                  {section.title}
                </h2>
                <ul>
                  {section.rows.map(({ item, index }) => (
                    <InboxRow
                      key={item._id}
                      item={item}
                      index={index}
                      active={activeCursor === index}
                      onHover={() => activeCursor !== index && setCursor(index)}
                      onOpen={() => open(item)}
                      onToggleRead={() => toggleRead(item)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {result?.hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLimit((current) => current + PAGE)}
                >
                  Load older notifications
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Page>
  );
}

function InboxRow({
  item,
  index,
  active,
  onHover,
  onOpen,
  onToggleRead,
}: {
  item: Item;
  index: number;
  active: boolean;
  onHover: () => void;
  onOpen: () => void;
  onToggleRead: () => void;
}) {
  const urgent = isUrgentKind(item.kind);
  const content = (
    <>
      <span
        className={cn(
          "bg-muted shadow-hairline flex size-8 shrink-0 items-center justify-center rounded-full",
          urgent ? "text-danger" : "text-fg-secondary",
        )}
      >
        <KindIcon kind={item.kind} className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span
          className={cn(
            "lead-style truncate",
            item.read ? "text-fg-secondary" : "text-foreground font-medium",
          )}
        >
          {item.title}
          {!item.read && <span className="sr-only"> (unread)</span>}
        </span>
        {item.body && (
          <span className="caption-style text-fg-tertiary truncate leading-snug">
            {item.body}
          </span>
        )}
      </span>
    </>
  );
  const linkClass =
    "focus-visible:after:ring-ring flex min-w-0 flex-1 items-center gap-3 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset";

  return (
    <li
      data-row-index={index}
      data-cursor={active}
      onMouseMove={onHover}
      className="group/row border-border data-[cursor=true]:bg-overlay-1 relative flex min-h-15 scroll-mt-8 items-center gap-3 border-b py-2.5 pr-3 pl-4"
    >
      {item.href ? (
        <Link href={item.href} onClick={onOpen} className={linkClass}>
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className={cn(linkClass, "text-left")}
        >
          {content}
        </button>
      )}
      <time
        dateTime={new Date(item._creationTime).toISOString()}
        title={dateTime(item._creationTime)}
        className="caption-style text-fg-tertiary shrink-0 tabular-nums group-focus-within/row:hidden group-hover/row:hidden group-data-[cursor=true]/row:hidden"
      >
        {relativeTime(item._creationTime)}
      </time>
      <span className="z-sticky relative hidden shrink-0 group-focus-within/row:flex group-hover/row:flex group-data-[cursor=true]/row:flex">
        <Tooltip content={item.read ? "Mark unread" : "Mark read"} shortcut="U">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={item.read ? "Mark unread" : "Mark read"}
            onClick={onToggleRead}
          >
            {item.read ? (
              <MailIcon aria-hidden className="size-3.5" />
            ) : (
              <CheckCircleIcon aria-hidden className="size-3.5" />
            )}
          </Button>
        </Tooltip>
      </span>
      <span className="flex w-2 shrink-0 justify-center">
        {!item.read && (
          <span aria-hidden className="bg-selected size-1.5 rounded-full" />
        )}
      </span>
    </li>
  );
}

function InboxSkeleton() {
  return (
    <div aria-busy aria-label="Loading notifications">
      <div className="border-border flex h-8 items-center border-b px-4">
        <Skeleton className="h-2.5 w-12" />
      </div>
      {Array.from({ length: 7 }, (_, index) => (
        <div
          key={index}
          className="border-border flex min-h-15 items-center gap-3 border-b py-2.5 pr-3 pl-4"
        >
          <Skeleton className="size-8 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-56 max-w-full" />
            <Skeleton className="h-2.5 w-80 max-w-full" />
          </span>
          <Skeleton className="h-2.5 w-14" />
          <span className="w-2" />
        </div>
      ))}
    </div>
  );
}

function InboxEmpty({
  view,
  filtered,
  groupLabel,
  onShowAll,
  onClearFilter,
}: {
  view: "unread" | "all";
  filtered: boolean;
  groupLabel?: string;
  onShowAll: () => void;
  onClearFilter: () => void;
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={FilterIcon}
        title={`No ${view === "unread" ? "unread " : ""}${groupLabel?.toLowerCase()} notifications`}
        description="Try another type, or clear the filter to see everything."
        action={
          <Button variant="secondary" size="sm" onClick={onClearFilter}>
            Clear filter
          </Button>
        }
        className="py-20"
      />
    );
  }
  if (view === "unread") {
    return (
      <EmptyState
        icon={CheckCircleIcon}
        title="You're all caught up"
        description="New leads, demo bookings, SLA alerts and platform sign-ups land here as they happen."
        action={
          <Button variant="secondary" size="sm" onClick={onShowAll}>
            Show all notifications
          </Button>
        }
        className="py-20"
      />
    );
  }
  return (
    <EmptyState
      icon={BellIcon}
      title="No notifications yet"
      description="You'll hear here when a lead is assigned to you, a demo is booked or an SLA is about to slip."
      className="py-20"
    />
  );
}
