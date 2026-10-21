"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type NotificationItem = FunctionReturnType<
  typeof api.notifications.listMine
>[number];
type InboxArgs = FunctionArgs<typeof api.notifications.inbox>;
type Change = Partial<Pick<NotificationItem, "read" | "archived">>;

function belongs(item: NotificationItem, args: InboxArgs) {
  if (args.view === "archived") return item.archived;
  if (item.archived) return false;
  if (args.view === "mentions" && item.kind !== "mention") return false;
  return !args.unreadOnly || !item.read;
}

/** Applies `change` to the given notifications in every cached list and count. */
function apply(
  store: OptimisticLocalStore,
  ids: Id<"notifications">[] | "all-unread",
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
      value.map(next).filter((item) => !item.archived),
    );
  }

  let unread = 0;
  let mentions = 0;
  for (const [before, after] of known.values()) {
    const delta = Number(!after.read) - Number(!before.read);
    unread += delta;
    if (after.kind === "mention") mentions += delta;
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
        ? { inbox: 0, mentions: 0 }
        : {
            inbox: Math.max(0, counts.inbox + unread),
            mentions: Math.max(0, counts.mentions + mentions),
          },
    );
  }
}

/** Inbox mutations that update the bell, the inbox views and the counts instantly. */
export function useNotificationActions() {
  const setRead = useMutation(api.notifications.setRead).withOptimisticUpdate(
    (store, { ids, read }) =>
      apply(store, ids, () =>
        read ? { read: true } : { read: false, archived: false },
      ),
  );
  const markAllRead = useMutation(
    api.notifications.markAllRead,
  ).withOptimisticUpdate((store) =>
    apply(store, "all-unread", () => ({ read: true })),
  );
  const setArchived = useMutation(
    api.notifications.setArchived,
  ).withOptimisticUpdate((store, { ids, archived }) =>
    apply(store, ids, () =>
      archived ? { archived: true, read: true } : { archived: false },
    ),
  );
  const restoreState = useMutation(
    api.notifications.restoreState,
  ).withOptimisticUpdate((store, { items }) => {
    for (const state of items) {
      apply(store, [state.id], () => ({
        read: state.readAt !== undefined,
        archived: state.archivedAt !== undefined,
      }));
    }
  });
  return { setRead, markAllRead, setArchived, restoreState };
}
