"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Kbd from "@/components/_ui/kbd";
import FilterMenu from "@/components/_common/filter-menu";
import SelectionBar from "@/components/data-table/selection-bar";
import {
  Page,
  PageHeader,
  PageStatus,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { KIND_GROUPS } from "@/features/notifications/kinds";
import { useNotificationActions } from "@/features/notifications/use-notification-actions";
import { useUrlState } from "@/hooks/use-url-state";
import type { SnoozePreset } from "@/lib/domain/notifications";
import { isEditableTarget } from "@/lib/keyboard";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import AtSignIcon from "@/public/assets/icons/at-sign.svg";
import BellIcon from "@/public/assets/icons/bell.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import FilterIcon from "@/public/assets/icons/filter.svg";
import {
  GroupHeader,
  InboxRow,
  InboxSkeleton,
  ROW_ATTR,
  SnoozeMenu,
  groupByRecord,
  wakeLabel,
  type InboxItem,
  type RowActions,
} from "./inbox-list";

const PAGE = 50;
const VIEWS = ["inbox", "mentions", "snoozed", "done"] as const;
type View = (typeof VIEWS)[number];
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  ...KIND_GROUPS.filter((group) => group.value !== "mentions").map((group) => ({
    value: group.value,
    label: group.label,
  })),
];
const SHOW_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];
const GROUP_OPTIONS = [
  { value: "record", label: "Record" },
  { value: "none", label: "None" },
];

const plural = (count: number, noun: string) =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** Notifications for the signed-in member: grouped by record, with done, snooze and read state. */
export default function InboxPage() {
  const [viewParam, setView] = useUrlState("view", "inbox");
  const [typeParam, setType] = useUrlState("type", "all");
  const [show, setShow] = useUrlState("show", "all");
  const [grouping, setGrouping] = useUrlState("group", "record");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  const [bulkSnooze, setBulkSnooze] = useState(false);
  const actions = useNotificationActions();

  const view: View = (VIEWS as readonly string[]).includes(viewParam)
    ? (viewParam as View)
    : "inbox";
  const type = TYPE_OPTIONS.some((option) => option.value === typeParam)
    ? typeParam
    : "all";
  const unreadOnly =
    show === "unread" && (view === "inbox" || view === "mentions");
  const grouped = grouping !== "none";

  const result = useQuery(api.notifications.inbox, {
    view,
    unreadOnly: unreadOnly || undefined,
    group: view !== "mentions" && type !== "all" ? type : undefined,
    limit,
  });
  const counts = useQuery(api.notifications.counts);
  const items = result?.items;

  const groups = useMemo(
    () =>
      result
        ? grouped
          ? groupByRecord(result.items, result.records)
          : [{ key: "all", record: null, items: result.items }]
        : [],
    [result, grouped],
  );
  const ordered = useMemo(
    () => groups.flatMap((group) => group.items),
    [groups],
  );
  const byId = useMemo(
    () => new Map(ordered.map((item) => [item._id as string, item])),
    [ordered],
  );
  const selectedItems = [...selected]
    .map((id) => byId.get(id))
    .filter((item): item is InboxItem => Boolean(item));
  const cursorIndex = cursorId
    ? ordered.findIndex((item) => item._id === cursorId)
    : -1;
  const lastIndex = useRef(-1);
  useEffect(() => {
    if (cursorIndex >= 0) lastIndex.current = cursorIndex;
  }, [cursorIndex]);

  function changeView(next: string) {
    setView(next);
    setLimit(PAGE);
    setSelected(new Set());
    setCursorId(null);
  }

  function focusRow(id: string | null) {
    setCursorId(id);
    if (!id) return;
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[${ROW_ATTR}="${id}"]`,
      );
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: "nearest" });
    });
  }

  /** Where the cursor goes when `leaving` disappears from the list. */
  function nextAfter(leaving: InboxItem[]) {
    const gone = new Set(leaving.map((item) => item._id as string));
    const start = Math.max(0, cursorIndex);
    const after = ordered.slice(start).find((item) => !gone.has(item._id));
    const before = ordered
      .slice(0, start)
      .reverse()
      .find((item) => !gone.has(item._id));
    return (after ?? before)?._id ?? null;
  }

  const report = (error: unknown) =>
    toast(readError(error).message, { tone: "danger" });

  const rowActions: RowActions = {
    open(item) {
      if (!item.read) void actions.markRead({ id: item._id }).catch(report);
    },
    done(targets, done) {
      if (targets.length === 0) return;
      if (cursorId && targets.some((item) => item._id === cursorId)) {
        focusRow(nextAfter(targets));
      }
      setSelected(new Set());
      actions
        .setDone({ ids: targets.map((item) => item._id), done })
        .then((previous) =>
          toast(
            done
              ? `${plural(previous.length, "notification")} marked done`
              : `${plural(previous.length, "notification")} moved to the inbox`,
            () => void actions.restoreState({ items: previous }).catch(report),
          ),
        )
        .catch(report);
    },
    snooze(targets, preset: SnoozePreset) {
      if (targets.length === 0) return;
      if (cursorId && targets.some((item) => item._id === cursorId)) {
        focusRow(nextAfter(targets));
      }
      setSelected(new Set());
      actions
        .snooze({ ids: targets.map((item) => item._id), preset })
        .then(({ until, previous }) =>
          toast(
            `Snoozed until ${wakeLabel(until)}`,
            () => void actions.restoreState({ items: previous }).catch(report),
          ),
        )
        .catch(report);
    },
    toggleRead(item) {
      const call = item.read
        ? actions.markUnread({ id: item._id })
        : actions.markRead({ id: item._id });
      void call.catch(report);
    },
    select(item, on) {
      setSelected((current) => {
        const next = new Set(current);
        if (on) next.add(item._id);
        else next.delete(item._id);
        return next;
      });
    },
    setCursor: setCursorId,
  };

  function setSelectedRead(read: boolean) {
    const targets = selectedItems.filter((item) => item.read !== read);
    setSelected(new Set());
    for (const item of targets) {
      const call = read
        ? actions.markRead({ id: item._id })
        : actions.markUnread({ id: item._id });
      void call.catch(report);
    }
  }

  async function readAll() {
    try {
      const count = await actions.markAllRead();
      if (count > 0) toast(`Marked ${plural(count, "notification")} as read`);
    } catch (error) {
      report(error);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY)) {
        return;
      }
      const key = event.key.toLowerCase();
      const current = cursorIndex >= 0 ? ordered[cursorIndex] : undefined;
      const targets =
        selectedItems.length > 0 ? selectedItems : current ? [current] : [];

      if (key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        if (ordered.length === 0) return;
        const from = cursorIndex >= 0 ? cursorIndex : lastIndex.current;
        focusRow(ordered[Math.min(ordered.length - 1, from + 1)]._id);
        return;
      }
      if (key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        if (ordered.length === 0) return;
        const from = cursorIndex >= 0 ? cursorIndex : ordered.length;
        focusRow(ordered[Math.max(0, from - 1)]._id);
        return;
      }
      if (event.key === "Escape" && selected.size > 0) {
        setSelected(new Set());
        return;
      }
      if (key === "x" && current) {
        event.preventDefault();
        rowActions.select(current, !selected.has(current._id));
        return;
      }
      if (key === "e" && targets.length > 0) {
        event.preventDefault();
        rowActions.done(targets, view !== "done");
        return;
      }
      if (key === "s" && targets.length > 0 && view !== "done") {
        event.preventDefault();
        if (selectedItems.length > 0) setBulkSnooze(true);
        else if (current) setSnoozeFor(current._id);
        return;
      }
      if (key === "u" && targets.length > 0) {
        event.preventDefault();
        if (selectedItems.length > 0) {
          setSelectedRead(selectedItems.some((item) => !item.read));
        } else if (current) {
          rowActions.toggleRead(current);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const unread = counts?.inbox;
  const views = [
    { id: "inbox", label: "Inbox", count: counts?.inbox },
    { id: "mentions", label: "Mentions", count: counts?.mentions },
    { id: "snoozed", label: "Snoozed", count: counts?.snoozed },
    { id: "done", label: "Done" },
  ];

  return (
    <Page>
      <PageHeader
        title="Inbox"
        meta={
          unread !== undefined && (
            <PageStatus tone={unread > 0 ? "info" : "neutral"}>
              <span className="tabular-nums">
                {unread >= 500 ? "500+" : unread} unread
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
        {view !== "mentions" && (
          <FilterMenu
            label="Type"
            value={type}
            options={TYPE_OPTIONS}
            onChange={(value) => {
              setType(value === "all" ? "" : value);
              setLimit(PAGE);
            }}
          />
        )}
        {(view === "inbox" || view === "mentions") && (
          <FilterMenu
            label="Show"
            value={unreadOnly ? "unread" : "all"}
            options={SHOW_OPTIONS}
            onChange={(value) => setShow(value === "all" ? "" : value)}
          />
        )}
        <FilterMenu
          label="Group by"
          value={grouped ? "record" : "none"}
          options={GROUP_OPTIONS}
          onChange={(value) => setGrouping(value === "record" ? "" : value)}
          className="max-sm:hidden"
        />
        <span className="caption-style text-fg-tertiary hidden items-center gap-1.5 pl-2 xl:flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          move
          <Kbd className="ml-2">E</Kbd>
          done
          <Kbd className="ml-2">S</Kbd>
          snooze
          <Kbd className="ml-2">U</Kbd>
          unread
          <Kbd className="ml-2">X</Kbd>
          select
        </span>
      </PageToolbar>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
          {items === undefined ? (
            <InboxSkeleton />
          ) : items.length === 0 ? (
            <InboxEmpty
              view={view}
              filtered={type !== "all" || unreadOnly}
              onReset={() => {
                setType("");
                setShow("");
                changeView("inbox");
              }}
            />
          ) : (
            <>
              {groups.map((group) => (
                <section
                  key={group.key}
                  aria-label={group.record?.name ?? "Notifications"}
                >
                  {grouped && <GroupHeader group={group} />}
                  <ul className="flex flex-col">
                    {group.items.map((item) => (
                      <InboxRow
                        key={item._id}
                        item={item}
                        view={view}
                        cursor={item._id === cursorId}
                        selected={selected.has(item._id)}
                        selecting={selected.size > 0}
                        snoozeOpen={snoozeFor === item._id}
                        onSnoozeOpenChange={(open) =>
                          setSnoozeFor(open ? item._id : null)
                        }
                        actions={rowActions}
                      />
                    ))}
                  </ul>
                </section>
              ))}
              {result?.hasMore && (
                <div className="border-border flex justify-center border-t py-2.5">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setLimit((current) => current + PAGE)}
                  >
                    Load older notifications
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <SelectionBar
          count={selectedItems.length}
          noun={["notification", "notifications"]}
          onClear={() => setSelected(new Set())}
        >
          <Button
            variant="ghost"
            size="xs"
            onClick={() => rowActions.done(selectedItems, view !== "done")}
          >
            {view === "done" ? "Move to inbox" : "Done"}
          </Button>
          {view !== "done" && (
            <SnoozeMenu
              open={bulkSnooze}
              onOpenChange={setBulkSnooze}
              onSnooze={(preset) => rowActions.snooze(selectedItems, preset)}
              trigger={
                <Button variant="ghost" size="xs">
                  Snooze
                </Button>
              }
            />
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              setSelectedRead(selectedItems.some((item) => !item.read))
            }
          >
            {selectedItems.some((item) => !item.read)
              ? "Mark read"
              : "Mark unread"}
          </Button>
        </SelectionBar>
      </div>
    </Page>
  );
}

function InboxEmpty({
  view,
  filtered,
  onReset,
}: {
  view: View;
  filtered: boolean;
  onReset: () => void;
}) {
  const reset = (
    <Button variant="secondary" size="sm" onClick={onReset}>
      Show everything in the inbox
    </Button>
  );
  if (filtered) {
    return (
      <EmptyState
        icon={FilterIcon}
        title="Nothing matches these filters"
        description="Other notifications are still in your inbox."
        action={reset}
      />
    );
  }
  if (view === "mentions") {
    return (
      <EmptyState
        icon={AtSignIcon}
        title="No mentions"
        description="When a teammate types @ and your name in a note or call log, it lands here and links straight to the entry."
        action={reset}
      />
    );
  }
  if (view === "snoozed") {
    return (
      <EmptyState
        icon={ClockIcon}
        title="Nothing snoozed"
        description="Press S on a notification to hide it until tomorrow or next week at 9:00. It comes back unread."
        action={reset}
      />
    );
  }
  if (view === "done") {
    return (
      <EmptyState
        icon={CheckCircleIcon}
        title="Nothing marked done yet"
        description="Press E on a notification once you've dealt with it to clear it from your inbox."
        action={reset}
      />
    );
  }
  return (
    <EmptyState
      icon={BellIcon}
      title="You're all caught up"
      description="Mentions, updates on records you follow, new leads, demo bookings and SLA alerts land here as they happen."
    />
  );
}
