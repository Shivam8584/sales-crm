"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { snoozeUntil } from "@/lib/domain/notifications";

export type NotificationItem = FunctionReturnType<
  typeof api.notifications.listMine
>[number];
type InboxArgs = FunctionArgs<typeof api.notifications.inbox>;
type Change = Partial<Pick<NotificationItem, "read" | "done" | "snoozedUntil">>;
type NotificationId = Id<"notifications">;

const inInbox = (item: NotificationItem) =>
  !item.done && item.snoozedUntil === null;

function belongs(item: NotificationItem, args: InboxArgs) {
  if (args.view === "done") return item.done;
  if (args.view === "snoozed") return !item.done && item.snoozedUntil !== null;
  if (!inInbox(item)) return false;
  if (args.view === "mentions" && item.kind !== "mention") return false;
  return !args.unreadOnly || !item.read;
}

/** Applies `change` to the given notifications in every cached list and count. */
function apply(
  store: OptimisticLocalStore,
  ids: NotificationId[] | "all-unread",
  change: (item: NotificationItem) => Change,
) {
  const matches = (item: NotificationItem) =>
    ids === "all-unread" ? !item.read : ids.includes(item._id);
  const known = new Map<string, [NotificationItem, NotificationItem]>();
  const remember = (item: NotificationItem) => {
    if (!matches(item) || known.has(item._id)) return;
    known.set(item._id, [item, { ...item, ...change(item) }]);
  };
  for (const { value } of store.getAllQueries(api.notifications.inbox)) {
    value?.items.forEach(remember);
  }
  for (const { value } of store.getAllQueries(api.notifications.listMine)) {
    value?.forEach(remember);
  }
  const next = (item: NotificationItem) => known.get(item._id)?.[1] ?? item;

  for (const { args, value } of store.getAllQueries(api.notifications.inbox)) {
    if (!value) continue;
    store.setQuery(api.notifications.inbox, args, {
      ...value,
      items: value.items.map(next).filter((item) => belongs(item, args)),
    });
  }
  for (const { args, value } of store.getAllQueries(
    api.notifications.listMine,
  )) {
    if (!value) continue;
    store.setQuery(
      api.notifications.listMine,
      args,
      value.map(next).filter(inInbox),
    );
  }

  let unread = 0;
  let inboxUnread = 0;
  let mentions = 0;
  let snoozed = 0;
  for (const [before, after] of known.values()) {
    unread += Number(!after.read) - Number(!before.read);
    const fresh = (item: NotificationItem) => !item.read && inInbox(item);
    const delta = Number(fresh(after)) - Number(fresh(before));
    inboxUnread += delta;
    if (after.kind === "mention") mentions += delta;
    snoozed +=
      Number(!after.done && after.snoozedUntil !== null) -
      Number(!before.done && before.snoozedUntil !== null);
  }
  const count = store.getQuery(api.notifications.unreadCount, {});
  if (count !== undefined) {
    store.setQuery(
      api.notifications.unreadCount,
      {},
      ids === "all-unread" ? 0 : Math.max(0, count + unread),
    );
  }
  const counts = store.getQuery(api.notifications.counts, {});
  if (counts) {
    store.setQuery(
      api.notifications.counts,
      {},
      ids === "all-unread"
        ? { ...counts, inbox: 0, mentions: 0 }
        : {
            inbox: Math.max(0, counts.inbox + inboxUnread),
            mentions: Math.max(0, counts.mentions + mentions),
            snoozed: Math.max(0, counts.snoozed + snoozed),
          },
    );
  }
}

/** Inbox mutations that update the bell, the inbox views and the counts instantly. */
export function useNotificationActions() {
  const markRead = useMutation(api.notifications.markRead).withOptimisticUpdate(
    (store, { id }) => apply(store, [id], () => ({ read: true })),
  );
  const markUnread = useMutation(
    api.notifications.markUnread,
  ).withOptimisticUpdate((store, { id }) =>
    apply(store, [id], () => ({
      read: false,
      done: false,
      snoozedUntil: null,
    })),
  );
  const markAllRead = useMutation(
    api.notifications.markAllRead,
  ).withOptimisticUpdate((store) =>
    apply(store, "all-unread", () => ({ read: true })),
  );
  const setDone = useMutation(api.notifications.setDone).withOptimisticUpdate(
    (store, { ids, done }) =>
      apply(store, ids, () =>
        done ? { done: true, read: true, snoozedUntil: null } : { done: false },
      ),
  );
  const snooze = useMutation(api.notifications.snooze).withOptimisticUpdate(
    (store, { ids, preset }) =>
      apply(store, ids, () => ({
        snoozedUntil: snoozeUntil(preset, Date.now()),
        read: true,
        done: false,
      })),
  );
  const restoreState = useMutation(
    api.notifications.restoreState,
  ).withOptimisticUpdate((store, { items }) => {
    for (const state of items) {
      apply(store, [state.id], () => ({
        read: state.readAt !== undefined,
        done: state.doneAt !== undefined,
        snoozedUntil: state.snoozedUntil ?? null,
      }));
    }
  });
  return { markRead, markUnread, markAllRead, setDone, snooze, restoreState };
}
