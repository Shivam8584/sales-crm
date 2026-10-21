"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function wasRead(store: OptimisticLocalStore, id: Id<"notifications">) {
  for (const { value } of store.getAllQueries(api.notifications.listMine)) {
    const item = value?.find((entry) => entry._id === id);
    if (item) return item.read;
  }
  for (const { value } of store.getAllQueries(api.notifications.list)) {
    const item = value?.items.find((entry) => entry._id === id);
    if (item) return item.read;
  }
  return undefined;
}

function adjustUnread(store: OptimisticLocalStore, delta: number | "clear") {
  const count = store.getQuery(api.notifications.unreadCount, {});
  if (count === undefined) return;
  store.setQuery(
    api.notifications.unreadCount,
    {},
    delta === "clear" ? 0 : Math.max(0, count + delta),
  );
}

function setRead(
  store: OptimisticLocalStore,
  matches: (id: Id<"notifications">) => boolean,
  read: boolean,
) {
  for (const { args, value } of store.getAllQueries(
    api.notifications.listMine,
  )) {
    if (!value) continue;
    store.setQuery(
      api.notifications.listMine,
      args,
      value.map((item) => (matches(item._id) ? { ...item, read } : item)),
    );
  }
  for (const { args, value } of store.getAllQueries(api.notifications.list)) {
    if (!value) continue;
    const items = value.items
      .map((item) => (matches(item._id) ? { ...item, read } : item))
      .filter((item) => args.filter === "all" || !item.read);
    store.setQuery(api.notifications.list, args, { ...value, items });
  }
}

/** Read-state mutations that update the bell, the inbox and the unread count instantly. */
export function useNotificationActions() {
  const markRead = useMutation(api.notifications.markRead).withOptimisticUpdate(
    (store, { id }) => {
      if (wasRead(store, id) === false) adjustUnread(store, -1);
      setRead(store, (itemId) => itemId === id, true);
    },
  );
  const markUnread = useMutation(
    api.notifications.markUnread,
  ).withOptimisticUpdate((store, { id }) => {
    if (wasRead(store, id) === true) adjustUnread(store, 1);
    setRead(store, (itemId) => itemId === id, false);
  });
  const markAllRead = useMutation(
    api.notifications.markAllRead,
  ).withOptimisticUpdate((store) => {
    adjustUnread(store, "clear");
    setRead(store, () => true, true);
  });
  return { markRead, markUnread, markAllRead };
}
