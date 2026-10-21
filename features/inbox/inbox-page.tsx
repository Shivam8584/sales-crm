"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Kbd from "@/components/_ui/kbd";
import Tag, { type TagTone } from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import FilterMenu from "@/components/_common/filter-menu";
import DataTable from "@/components/data-table/data-table";
import SelectionBar from "@/components/data-table/selection-bar";
import type { Column, SortState } from "@/components/data-table/types";
import {
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { cellDate, dash } from "@/features/accounts/record-cells";
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
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import MailIcon from "@/public/assets/icons/mail.svg";

type Item = FunctionReturnType<typeof api.notifications.list>["items"][number];
type GroupId = (typeof KIND_GROUPS)[number]["value"];

const PAGE = 50;
const COUNT_LIMIT = 100;
const UNREAD = "unread";
const ALL = "all";
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";
const ROW_ID = "data-notification-id";

const VIEW_IDS = [UNREAD, ALL, ...KIND_GROUPS.map((group) => group.value)];

const GROUP_STYLE: Record<
  GroupId,
  { tag: TagTone; tile: string; short: string }
> = {
  leads: {
    tag: "blue",
    tile: "bg-(--tag-blue-bg) border-(--tag-blue-border) text-(--tag-blue-text)",
    short: "Leads",
  },
  demos: {
    tag: "purple",
    tile: "bg-(--tag-purple-bg) border-(--tag-purple-border) text-(--tag-purple-text)",
    short: "Demos",
  },
  sla: {
    tag: "red",
    tile: "bg-(--tag-red-bg) border-(--tag-red-border) text-(--tag-red-text)",
    short: "SLA",
  },
  platform: {
    tag: "teal",
    tile: "bg-(--tag-teal-bg) border-(--tag-teal-border) text-(--tag-teal-text)",
    short: "Platform",
  },
};

function groupOf(kind: string) {
  return KIND_GROUPS.find((group) =>
    (group.kinds as readonly string[]).includes(kind),
  );
}

const SORT_OPTIONS = [
  { value: "desc", label: "Newest" },
  { value: "asc", label: "Oldest" },
];

function KindTile({ kind }: { kind: string }) {
  const group = groupOf(kind);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md border",
        group
          ? GROUP_STYLE[group.value].tile
          : "border-line-strong bg-overlay-1 text-fg-secondary",
      )}
    >
      <KindIcon kind={kind} className="size-3.5" />
    </span>
  );
}

function TypeTag({ kind }: { kind: string }) {
  const group = groupOf(kind);
  if (!group) return <Tag tone="neutral">Other</Tag>;
  return <Tag tone={GROUP_STYLE[group.value].tag}>{group.label}</Tag>;
}

function ReceivedCell({ at }: { at: number }) {
  return (
    <Tooltip content={dateTime(at)}>
      <time
        dateTime={new Date(at).toISOString()}
        className="text-fg-secondary flex min-w-0 items-center gap-1"
      >
        <CalendarIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="w-12.5 shrink-0 tabular-nums">{cellDate(at)}</span>
        <span aria-hidden className="bg-overlay-4 mx-0.75 h-2 w-px shrink-0" />
        <span className="truncate">{relativeTime(at)}</span>
      </time>
    </Tooltip>
  );
}

const COLUMNS: Column<Item>[] = [
  {
    id: "title",
    header: "Notification",
    width: "minmax(15rem,1.5fr)",
    cell: (item) => (
      <span {...{ [ROW_ID]: item._id }} className="contents">
        <KindTile kind={item.kind} />
        <span
          title={item.title}
          className={cn(
            "truncate",
            item.read ? "text-fg-secondary font-normal" : "text-foreground",
          )}
        >
          {item.title}
        </span>
        {!item.read && <span className="sr-only"> (unread)</span>}
      </span>
    ),
  },
  {
    id: "body",
    header: "Details",
    width: "minmax(14rem,2fr)",
    minViewport: 900,
    cell: (item) =>
      item.body ? (
        <span className="text-fg-secondary truncate" title={item.body}>
          {item.body}
        </span>
      ) : (
        dash
      ),
  },
  {
    id: "type",
    header: "Type",
    width: "8rem",
    minViewport: 1100,
    sortValue: (item) => groupOf(item.kind)?.label ?? "~",
    cell: (item) => <TypeTag kind={item.kind} />,
  },
  {
    id: "status",
    header: "Status",
    width: "6.5rem",
    minViewport: 700,
    sortValue: (item) => (item.read ? 1 : 0),
    cell: (item) =>
      item.read ? (
        <span className="text-fg-tertiary">Read</span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="bg-selected size-1.5 rounded-full" />
          Unread
        </span>
      ),
  },
  {
    id: "received",
    header: "Received",
    width: "minmax(12.5rem,0.9fr)",
    defaultDir: "desc",
    sortValue: (item) => item._creationTime,
    cell: (item) => <ReceivedCell at={item._creationTime} />,
  },
];

/** The notification id carried by the row or card that holds `element`. */
function rowNotification(element: Element | null) {
  return (
    element
      ?.closest("[role=row], li")
      ?.querySelector(`[${ROW_ID}]`)
      ?.getAttribute(ROW_ID) ?? null
  );
}

/** Every notification for the signed-in member, with read state and saved views by kind. */
export default function InboxPage() {
  const [viewParam, setView] = useUrlState("view", UNREAD);
  const [sortParam, setSortParam] = useUrlState("sort", "received:desc");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { markRead, markUnread, markAllRead } = useNotificationActions();

  const view = VIEW_IDS.includes(viewParam) ? viewParam : UNREAD;
  const group = KIND_GROUPS.find((item) => item.value === view);
  const result = useQuery(api.notifications.list, {
    filter: view === UNREAD ? "unread" : "all",
    kinds: group ? [...group.kinds] : undefined,
    limit,
  });
  const unreadList = useQuery(api.notifications.list, {
    filter: "unread",
    limit: COUNT_LIMIT,
  });
  const unread = useQuery(api.notifications.unreadCount);
  const items = result?.items;

  const [sortId, sortDir] = sortParam.split(":");
  const sort: SortState = {
    id: COLUMNS.some((column) => column.id === sortId && column.sortValue)
      ? sortId
      : "received",
    dir: sortDir === "asc" ? "asc" : "desc",
  };

  const byId = useMemo(
    () => new Map((items ?? []).map((item) => [item._id as string, item])),
    [items],
  );

  const unreadByGroup = useMemo(() => {
    if (!unreadList) return undefined;
    const counts: Record<string, number> = {};
    for (const item of unreadList.items) {
      const key = groupOf(item.kind)?.value;
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [unreadList]);

  const stats = useMemo(() => {
    if (!items) return null;
    const fresh = items.filter((item) => !item.read);
    return {
      unread: fresh.length,
      sla: items.filter((item) => isUrgentKind(item.kind)).length,
      oldestUnread: fresh.length
        ? Math.min(...fresh.map((item) => item._creationTime))
        : null,
    };
  }, [items]);

  const selectedItems = [...selected]
    .map((id) => byId.get(id))
    .filter((item): item is Item => Boolean(item));

  function changeView(next: string) {
    setView(next);
    setLimit(PAGE);
    setSelected(new Set());
  }

  function read(id: string) {
    const item = byId.get(id);
    if (item && !item.read) void markRead({ id: item._id });
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

  function setSelectedRead(value: boolean) {
    const targets = selectedItems.filter((item) => item.read !== value);
    for (const item of targets) {
      if (value) void markRead({ id: item._id as Id<"notifications"> });
      else void markUnread({ id: item._id as Id<"notifications"> });
    }
    setSelected(new Set());
    if (targets.length === 0) return;
    toast(
      `Marked ${targets.length} ${targets.length === 1 ? "notification" : "notifications"} as ${value ? "read" : "unread"}`,
      () => {
        for (const item of targets) {
          if (value) void markUnread({ id: item._id });
          else void markRead({ id: item._id });
        }
      },
    );
  }

  function onOpenClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (target.closest("button, [role=checkbox], [role=menu]")) return;
    const id = rowNotification(target);
    if (id) read(id);
  }

  // Runs before the table's own handler, which navigates on Enter.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "Enter" && event.key !== "u") return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY))
        return;
      const id = rowNotification(
        document.querySelector("[role=row][data-cursor=true]"),
      );
      const item = id ? byId.get(id) : undefined;
      if (!item) return;
      if (event.key === "Enter") return read(item._id);
      event.preventDefault();
      toggleRead(item);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  });

  const views = [
    { id: UNREAD, label: "Unread", count: unread },
    { id: ALL, label: "All" },
    ...KIND_GROUPS.map((item) => ({
      id: item.value,
      label: GROUP_STYLE[item.value].short,
      count: unreadByGroup?.[item.value] ?? (unreadByGroup ? 0 : undefined),
    })),
  ];

  return (
    <Page>
      <PageHeader
        title="Inbox"
        meta={
          unread !== undefined && (
            <PageStatus tone={unread > 0 ? "info" : "neutral"}>
              <span className="tabular-nums">
                {unread > 99 ? "99+" : unread} unread
              </span>
            </PageStatus>
          )
        }
      />
      <PageViews
        label="Views"
        value={view}
        onChange={changeView}
        views={views}
      />
      <PageToolbar
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!unread}
            onClick={() => void readAll()}
            className="h-control-md max-sm:w-control-md py-0 max-sm:px-0"
          >
            <CheckCircleIcon aria-hidden className="size-3" />
            <span className="max-sm:sr-only">Mark all as read</span>
          </Button>
        }
      >
        <FilterMenu
          label="Sort by"
          value={sort.id === "received" ? sort.dir : "desc"}
          options={SORT_OPTIONS}
          onChange={(dir) => setSortParam(`received:${dir}`)}
        />
        <span className="caption-style text-fg-tertiary hidden items-center gap-1.5 pl-2 lg:flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          to move
          <Kbd className="ml-2">↵</Kbd>
          to open
          <Kbd className="ml-2">U</Kbd>
          read / unread
          <Kbd className="ml-2">X</Kbd>
          select
        </span>
      </PageToolbar>

      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onClickCapture={onOpenClick}
      >
        <DataTable
          label="Notifications"
          columns={COLUMNS}
          rows={items}
          getId={(item) => item._id}
          getHref={(item) => item.href ?? "/inbox"}
          getLabel={(item) => item.title}
          sort={sort}
          onSortChange={(next) => setSortParam(`${next.id}:${next.dir}`)}
          selected={selected}
          onSelectedChange={setSelected}
          rowMenu={(item) => [
            {
              label: item.read ? "Mark as unread" : "Mark as read",
              icon: item.read ? MailIcon : CheckCircleIcon,
              shortcut: "U",
              onSelect: () => toggleRead(item),
            },
          ]}
          footer={[
            {
              label: result?.hasMore ? "Shown, more below" : "In view",
              value: items?.length ?? 0,
            },
            { label: "Unread", value: stats?.unread ?? 0 },
            {
              label: "SLA alerts",
              value: (
                <span className={cn(stats?.sla && "text-danger")}>
                  {stats?.sla ?? 0}
                </span>
              ),
            },
            {
              label: "Oldest unread",
              value: stats?.oldestUnread
                ? relativeTime(stats.oldestUnread)
                : dash,
            },
          ]}
          renderCard={(item) => (
            <span {...{ [ROW_ID]: item._id }} className="flex gap-3">
              <KindTile kind={item.kind} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "lead-style min-w-0 flex-1 truncate leading-5",
                      item.read
                        ? "text-fg-secondary"
                        : "text-foreground font-medium",
                    )}
                  >
                    {item.title}
                  </span>
                  {!item.read && (
                    <span
                      aria-label="Unread"
                      className="bg-selected size-1.5 shrink-0 rounded-full"
                    />
                  )}
                </span>
                {item.body && (
                  <span className="caption-style text-fg-tertiary line-clamp-2 leading-snug">
                    {item.body}
                  </span>
                )}
                <span className="caption-style text-fg-tertiary flex items-center gap-2">
                  <TypeTag kind={item.kind} />
                  {relativeTime(item._creationTime)}
                </span>
              </span>
            </span>
          )}
          empty={
            <InboxEmpty
              view={view}
              groupLabel={group?.label}
              onShowAll={() => changeView(ALL)}
            />
          }
        />
        {result?.hasMore && (
          <div className="border-border flex shrink-0 justify-center border-t py-2.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setLimit((current) => current + PAGE)}
            >
              Load older notifications
            </Button>
          </div>
        )}
        <SelectionBar
          count={selectedItems.length}
          noun={["notification", "notifications"]}
          onClear={() => setSelected(new Set())}
        >
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSelectedRead(true)}
          >
            Mark read
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setSelectedRead(false)}
          >
            Mark unread
          </Button>
        </SelectionBar>
      </div>
    </Page>
  );
}

function InboxEmpty({
  view,
  groupLabel,
  onShowAll,
}: {
  view: string;
  groupLabel?: string;
  onShowAll: () => void;
}) {
  if (groupLabel) {
    return (
      <EmptyState
        icon={FilterIcon}
        title={`No ${groupLabel.toLowerCase()} notifications`}
        description="Nothing of this kind has reached you yet. Other notifications are under All."
        action={
          <Button variant="secondary" size="sm" onClick={onShowAll}>
            Show all notifications
          </Button>
        }
      />
    );
  }
  if (view === UNREAD) {
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
      />
    );
  }
  return (
    <EmptyState
      icon={BellIcon}
      title="No notifications yet"
      description="You'll hear here when a lead is assigned to you, a demo is booked or an SLA is about to slip."
    />
  );
}
