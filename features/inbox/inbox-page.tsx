"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import { Switch } from "@/components/_ui/switch";
import SelectionBar from "@/components/data-table/selection-bar";
import {
  Page,
  PageHeader,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { useNotificationActions } from "@/features/notifications/use-notification-actions";
import { useUrlState } from "@/hooks/use-url-state";
import { isEditableTarget } from "@/lib/keyboard";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import {
  GroupHeader,
  InboxRow,
  InboxSkeleton,
  ROW_ATTR,
  groupByRecord,
  type InboxItem,
  type RowActions,
} from "./inbox-list";

const PAGE = 50;
const VIEWS = ["inbox", "mentions", "archived"] as const;
type View = (typeof VIEWS)[number];
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";

const plural = (count: number, noun: string) =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** The signed-in member's notifications, grouped by record: archive, read state and bulk actions. */
export default function InboxPage() {
  const [viewParam, setView] = useUrlState("view", "inbox");
  const [show, setShow] = useUrlState("show", "all");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursorId, setCursorId] = useState<string | null>(null);
  const actions = useNotificationActions();

  const view: View =
    viewParam === "done"
      ? "archived"
      : (VIEWS as readonly string[]).includes(viewParam)
        ? (viewParam as View)
        : "inbox";
  const unreadOnly = show === "unread" && view !== "archived";

  const result = useQuery(api.notifications.inbox, {
    view,
    unreadOnly: unreadOnly || undefined,
    limit,
  });
  const counts = useQuery(api.notifications.counts);
  const items = result?.items;

  const groups = useMemo(
    () => (result ? groupByRecord(result.items, result.records) : []),
    [result],
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

  /** Read changes in the Archived view move items back to the inbox, so they leave the list. */
  function setRead(targets: InboxItem[], read: boolean) {
    const changing = targets.filter((item) => item.read !== read);
    if (changing.length === 0) return;
    setSelected(new Set());
    if (!read && view === "archived") moveCursorOff(changing);
    actions
      .setRead({ ids: changing.map((item) => item._id), read })
      .then((previous) =>
        toast(
          `${plural(previous.length, "notification")} marked ${read ? "read" : "unread"}`,
          () => void actions.restoreState({ items: previous }).catch(report),
        ),
      )
      .catch(report);
  }

  function moveCursorOff(leaving: InboxItem[]) {
    if (cursorId && leaving.some((item) => item._id === cursorId)) {
      focusRow(nextAfter(leaving));
    }
  }

  const rowActions: RowActions = {
    open(item) {
      if (!item.read) {
        void actions.setRead({ ids: [item._id], read: true }).catch(report);
      }
    },
    archive(targets, archived) {
      if (targets.length === 0) return;
      moveCursorOff(targets);
      setSelected(new Set());
      actions
        .setArchived({ ids: targets.map((item) => item._id), archived })
        .then((previous) =>
          toast(
            archived
              ? `${plural(previous.length, "notification")} archived`
              : `${plural(previous.length, "notification")} moved to the inbox`,
            () => void actions.restoreState({ items: previous }).catch(report),
          ),
        )
        .catch(report);
    },
    toggleRead(item) {
      setRead([item], !item.read);
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

  async function readAll() {
    try {
      const previous = await actions.markAllRead();
      if (previous.length > 0) {
        toast(
          `Marked ${plural(previous.length, "notification")} as read`,
          () => void actions.restoreState({ items: previous }).catch(report),
        );
      }
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
        rowActions.archive(targets, view !== "archived");
        return;
      }
      if (key === "u" && targets.length > 0) {
        event.preventDefault();
        setRead(
          targets,
          targets.some((item) => !item.read),
        );
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const unread = counts?.inbox;
  const views = [
    { id: "inbox", label: "Inbox", count: counts?.inbox },
    { id: "mentions", label: "Mentions", count: counts?.mentions },
    { id: "archived", label: "Archived" },
  ];

  return (
    <Page>
      <PageHeader title="Inbox" />
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
        {view !== "archived" && (
          <label
            htmlFor="inbox-unread-only"
            className="text-fg-secondary hover:text-foreground h-control-md duration-fast flex cursor-pointer items-center gap-2 text-xs font-medium transition-colors select-none"
          >
            <Switch
              id="inbox-unread-only"
              checked={unreadOnly}
              onCheckedChange={(on) => {
                setShow(on ? "unread" : "");
                setLimit(PAGE);
              }}
            />
            Unread only
          </label>
        )}
      </PageToolbar>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
          {items === undefined ? (
            <InboxSkeleton />
          ) : items.length === 0 ? (
            <InboxEmpty
              view={view}
              unreadOnly={unreadOnly}
              onShowAll={() => setShow("")}
              onReset={() => changeView("inbox")}
            />
          ) : (
            <>
              {groups.map((group) => (
                <section
                  key={group.key}
                  aria-label={group.record?.name ?? "Notifications"}
                >
                  <GroupHeader group={group} />
                  <ul className="flex flex-col">
                    {group.items.map((item) => (
                      <InboxRow
                        key={item._id}
                        item={item}
                        cursor={item._id === cursorId}
                        selected={selected.has(item._id)}
                        selecting={selected.size > 0}
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
            onClick={() =>
              rowActions.archive(selectedItems, view !== "archived")
            }
          >
            {view === "archived" ? "Move to inbox" : "Archive"}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              setRead(
                selectedItems,
                selectedItems.some((item) => !item.read),
              )
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
  unreadOnly,
  onShowAll,
  onReset,
}: {
  view: View;
  unreadOnly: boolean;
  onShowAll: () => void;
  onReset: () => void;
}) {
  if (unreadOnly) {
    return (
      <EmptyState
        title="No unread notifications"
        action={
          <Button variant="secondary" size="sm" onClick={onShowAll}>
            Show read
          </Button>
        }
      />
    );
  }
  if (view === "mentions") {
    return (
      <EmptyState
        title="No mentions"
        action={
          <Button variant="secondary" size="sm" onClick={onReset}>
            Back to inbox
          </Button>
        }
      />
    );
  }
  if (view === "archived") {
    return (
      <EmptyState
        title="Nothing archived"
        action={
          <Button variant="secondary" size="sm" onClick={onReset}>
            Back to inbox
          </Button>
        }
      />
    );
  }
  return <EmptyState title="You're all caught up" />;
}
