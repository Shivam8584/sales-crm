"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import Skeleton from "@/components/_ui/skeleton";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import BellIcon from "@/public/assets/icons/bell.svg";
import CalendarIcon from "@/public/assets/icons/calendar.svg";
import MessageIcon from "@/public/assets/icons/message.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";

type Item = FunctionReturnType<typeof api.notifications.listMine>[number];
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const KIND_ICON: Record<string, Icon> = {
  lead_new: TargetIcon,
  lead_assigned: UserPlusIcon,
  lead_repeat: MessageIcon,
  lead_sla: AlertIcon,
  demo_booked: CalendarIcon,
  demo_rescheduled: CalendarIcon,
  demo_cancelled: CalendarIcon,
};

const TOAST_KINDS = new Set([
  "lead_new",
  "lead_assigned",
  "lead_sla",
  "demo_booked",
]);

// Shared by every mounted bell (desktop sidebar and the mobile drawer), so a
// notification is toasted once however many bells are on screen.
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
        toast(item.body ? `${item.title} · ${item.body}` : item.title);
      }
    }
  }, [items]);
}

/** Unread notifications for the signed-in member, in the sidebar header. */
export default function NotificationBell() {
  const router = useRouter();
  const items = useQuery(api.notifications.listMine);
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const [open, setOpen] = useState(false);
  useArrivalToasts(items);

  function select(item: Item) {
    if (!item.read) void markRead({ id: item._id });
    setOpen(false);
    if (item.href) {
      setSidebarOpen(false);
      router.push(item.href);
    }
  }

  const label = unread
    ? `Notifications, ${unread > 99 ? "99+" : unread} unread`
    : "Notifications";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground -mr-1"
        >
          <BellIcon aria-hidden className="size-3.5" />
          {unread > 0 && (
            <span
              aria-hidden
              className="bg-primary text-primary-foreground ring-sidebar absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.75 text-[9px] leading-none font-semibold tabular-nums ring-2"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[min(22.5rem,calc(100vw-2rem))] flex-col p-0"
      >
        <div className="border-line-strong flex h-11 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
          <h2 className="lead-style font-medium">Notifications</h2>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </Button>
          )}
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
              {items.map((item) => (
                <li key={item._id}>
                  <NotificationRow item={item} onSelect={() => select(item)} />
                </li>
              ))}
            </ul>
          )}
        </div>
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
  const Icon = KIND_ICON[item.kind] ?? BellIcon;
  const urgent = item.kind === "lead_sla";
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
        <Icon aria-hidden className="size-3.5" />
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
          {relativeTime(item._creationTime)}
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
