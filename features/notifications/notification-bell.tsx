"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import EmptyState from "@/components/_ui/empty-state";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import BellIcon from "@/public/assets/icons/bell.svg";
import { isUrgentKind, KindIcon } from "./kinds";
import { useNotificationActions } from "./use-notification-actions";

type Item = FunctionReturnType<typeof api.notifications.listMine>[number];
const PREVIEW = 20;

const TOAST_KINDS = new Set([
  "mention",
  "lead_new",
  "lead_assigned",
  "lead_sla",
  "demo_booked",
]);

// Module-level so a notification is toasted once even when the bell remounts
// with each page header.
const seen = new Set<string>();
let baselined = false;

function useArrivalToasts(items: Item[] | undefined) {
  useEffect(() => {
    if (!items) return;
    if (!baselined) {
      baselined = true;
      for (const item of items) seen.add(item._id);
      return;
    }
    for (const item of [...items].reverse()) {
      if (seen.has(item._id)) continue;
      seen.add(item._id);
      if (!item.read && TOAST_KINDS.has(item.kind)) {
        toast(item.body ? `${item.title} · ${item.body}` : item.title, {
          tone: item.kind === "lead_sla" ? "warning" : "info",
        });
      }
    }
  }, [items]);
}

/** Unread notifications for the signed-in member, in the page header. */
export default function NotificationBell() {
  const router = useRouter();
  const items = useQuery(api.notifications.listMine);
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const { setRead, markAllRead } = useNotificationActions();
  const [open, setOpen] = useState(false);
  useArrivalToasts(items);

  function select(item: Item) {
    if (!item.read) void setRead({ ids: [item._id], read: true });
    setOpen(false);
    if (item.href) router.push(item.href);
  }

  const label = unread
    ? `Notifications, ${unread > 99 ? "99+" : unread} unread`
    : "Notifications";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content="Notifications">
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            aria-label={label}
            className="group data-[state=open]:bg-muted"
          >
            <BellIcon aria-hidden className="size-3.5" />
            {unread > 0 && (
              <span
                aria-hidden
                className="bg-danger ring-secondary group-hover:ring-muted group-data-[state=open]:ring-muted absolute top-1.75 right-1.75 size-1.5 rounded-full ring-2"
              />
            )}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        align="end"
        className="flex w-[min(25rem,calc(100vw-2rem))] flex-col p-0"
      >
        <div className="border-line-strong flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <span className="flex items-center gap-2">
            <h2>Notifications</h2>
            {unread > 0 && (
              <CountBadge>{unread > 99 ? "99+" : unread}</CountBadge>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0}
            onClick={() => void markAllRead()}
            className="-mr-2.25"
          >
            Mark all as read
          </Button>
        </div>
        <div className="scrollbar-none max-h-[min(28rem,70dvh)] overflow-y-auto">
          {items === undefined ? (
            <div className="flex flex-col gap-3 p-4" aria-busy>
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="size-7 rounded-full" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={BellIcon}
              title="You're all caught up"
              description="New leads, demo bookings and SLA alerts show up here."
            />
          ) : (
            <ul className="flex flex-col p-1">
              {items.slice(0, PREVIEW).map((item) => (
                <li key={item._id}>
                  <NotificationRow item={item} onSelect={() => select(item)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href="/inbox"
          onClick={() => setOpen(false)}
          className="border-line-strong text-fg-secondary hover:text-foreground hover:bg-overlay-1 focus-visible:bg-overlay-2 duration-fast caption-style flex h-10 shrink-0 items-center justify-center gap-1.5 border-t font-medium transition-colors outline-none"
        >
          View all in Inbox
          <ArrowRightIcon aria-hidden className="size-3" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  item,
  onSelect,
}: {
  item: Item;
  onSelect: () => void;
}) {
  const urgent = isUrgentKind(item.kind);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="hover:bg-overlay-1 focus-visible:bg-overlay-2 duration-fast flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors outline-none"
    >
      <span
        className={cn(
          "bg-muted shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full",
          urgent ? "text-danger" : "text-fg-secondary",
        )}
      >
        <KindIcon kind={item.kind} className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <span
          className={cn(
            "lead-style leading-snug",
            item.read ? "text-fg-secondary" : "text-foreground font-medium",
          )}
        >
          {item.title}
        </span>
        {item.body && (
          <span className="caption-style text-fg-tertiary truncate leading-snug">
            {item.body}
          </span>
        )}
        <span className="caption-style text-fg-tertiary">
          <time
            dateTime={new Date(item._creationTime).toISOString()}
            title={dateTime(item._creationTime)}
          >
            {relativeTime(item._creationTime)}
          </time>
        </span>
      </span>
      {!item.read && (
        <span className="mt-2 flex shrink-0">
          <span className="bg-selected size-1.5 rounded-full" />
          <span className="sr-only">Unread</span>
        </span>
      )}
    </button>
  );
}
