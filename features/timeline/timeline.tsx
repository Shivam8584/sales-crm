"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { useViewer } from "@/hooks/use-viewer";
import { CALL_OUTCOME_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import TrashIcon from "@/public/assets/icons/trash.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import { ENTRY_ANCHOR } from "@/lib/domain/notifications";
import {
  FILTERS,
  KIND_META,
  filterOf,
  type TimelineFilter,
  type TimelineTarget,
} from "./kinds";
import TimelineComposer from "./timeline-composer";
import EntryBody from "./entry-body";
import MentionTextarea, { useMentionDraft } from "./mention-textarea";

type Entry = FunctionReturnType<typeof api.timeline.forRecord>[number];

const WEEKDAY_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const FULL_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function dayKey(at: number) {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(at: number) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(at) === dayKey(now.getTime())) return "Today";
  if (dayKey(at) === dayKey(yesterday.getTime())) return "Yesterday";
  const date = new Date(at);
  return date.getFullYear() === now.getFullYear()
    ? WEEKDAY_DATE.format(date)
    : FULL_DATE.format(date);
}

function groupByDay(entries: Entry[]) {
  const groups: { key: string; label: string; entries: Entry[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.occurredAt);
    const last = groups.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else
      groups.push({ key, label: dayLabel(entry.occurredAt), entries: [entry] });
  }
  return groups;
}

/** Composer plus the record's history: interactions, field changes and platform events. */
export default function Timeline({
  target,
  compact = false,
  readOnly = false,
}: {
  target: TimelineTarget;
  /** Peek layout: no filter chips. */
  compact?: boolean;
  /** History only: no composer and no edits, e.g. for an erased person. */
  readOnly?: boolean;
}) {
  const entries = useQuery(api.timeline.forRecord, { target });
  const [filter, setFilter] = useState<TimelineFilter>("all");

  const counts = useMemo(() => {
    const result = new Map<TimelineFilter, number>();
    for (const entry of entries ?? []) {
      const key = filterOf(entry);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }, [entries]);

  const visible = useMemo(
    () =>
      entries?.filter(
        (entry) => filter === "all" || filterOf(entry) === filter,
      ),
    [entries, filter],
  );
  const groups = useMemo(() => groupByDay(visible ?? []), [visible]);
  const onAccount = "accountId" in target;
  const highlight = useEntryAnchor(entries, () => setFilter("all"));

  return (
    <div className="flex flex-col gap-5">
      {!readOnly && <TimelineComposer target={target} />}
      {!compact && entries !== undefined && entries.length > 0 && (
        <div
          role="group"
          aria-label="Show"
          className="scrollbar-none -mx-1 -mb-1 flex gap-1 overflow-x-auto px-1 py-1"
        >
          {FILTERS.map((item) => {
            const count =
              item.id === "all" ? entries.length : (counts.get(item.id) ?? 0);
            if (item.id !== "all" && count === 0 && filter !== item.id)
              return null;
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "caption-style text-fg-secondary hover:text-foreground hover:bg-overlay-1 focus-visible:ring-ring duration-fast flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 transition-colors outline-none focus-visible:ring-2",
                  active &&
                    "bg-raised text-foreground shadow-hairline hover:bg-raised",
                )}
              >
                {item.label}
                <span className="text-fg-tertiary tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {entries === undefined ? (
        <ol className="flex flex-col gap-5" aria-busy>
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex gap-3">
              <Skeleton className="size-7 rounded-lg" />
              <span className="flex flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-64" />
              </span>
            </li>
          ))}
        </ol>
      ) : entries.length === 0 ? (
        <p className="caption-style text-fg-tertiary py-6 text-center">
          Nothing logged yet. Notes, calls and changes will appear here.
        </p>
      ) : groups.length === 0 ? (
        <p className="caption-style text-fg-tertiary py-6 text-center">
          Nothing in this view.{" "}
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="text-fg-secondary hover:text-foreground focus-visible:ring-ring rounded-sm underline underline-offset-2 outline-none focus-visible:ring-2"
          >
            Show everything
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="eyebrow-style text-fg-secondary flex items-center gap-3 py-2">
                {group.label}
                <span aria-hidden className="bg-line-strong h-px flex-1" />
              </h3>
              <ol className="flex flex-col pt-3">
                {group.entries.map((entry, index) => (
                  <TimelineItem
                    key={entry._id}
                    entry={entry}
                    last={index === group.entries.length - 1}
                    showContext={onAccount}
                    readOnly={readOnly}
                    highlighted={highlight === entry._id}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const HIGHLIGHT_MS = 2400;

/**
 * Scrolls to and briefly highlights the entry named by `#entry-<id>`, the
 * link a mention or follow notification carries; once per hash.
 */
function useEntryAnchor(entries: Entry[] | undefined, showAll: () => void) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const showAllRef = useRef(showAll);
  useEffect(() => {
    showAllRef.current = showAll;
  });

  useEffect(() => {
    if (!entries) return;
    function check() {
      const hash = window.location.hash.slice(1);
      if (!hash.startsWith(ENTRY_ANCHOR) || handled.current === hash) return;
      const id = hash.slice(ENTRY_ANCHOR.length);
      if (!entries?.some((entry) => entry._id === id)) return;
      handled.current = hash;
      showAllRef.current();
      setHighlight(id);
      requestAnimationFrame(() => {
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(hash)?.scrollIntoView({
          block: "center",
          behavior: reduce ? "auto" : "smooth",
        });
      });
    }
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [entries]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlight]);

  return highlight;
}

function Rail({ last, compact }: { last: boolean; compact: boolean }) {
  if (last) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "bg-line-strong absolute bottom-0.5 left-3.5 w-px -translate-x-1/2",
        compact ? "top-6.5" : "top-8.5",
      )}
    />
  );
}

function Time({ at, edited }: { at: number; edited?: boolean }) {
  return (
    <Tooltip content={dateTime(at)}>
      <time
        dateTime={new Date(at).toISOString()}
        className="caption-style text-fg-tertiary shrink-0 whitespace-nowrap"
      >
        {relativeTime(at)}
        {edited && " · edited"}
      </time>
    </Tooltip>
  );
}

function TimelineItem({
  entry,
  last,
  showContext,
  readOnly,
  highlighted,
}: {
  entry: Entry;
  last: boolean;
  showContext: boolean;
  readOnly: boolean;
  highlighted: boolean;
}) {
  if (entry.kind === "change" || entry.kind === "system") {
    return (
      <AutomaticItem entry={entry} last={last} highlighted={highlighted} />
    );
  }
  return (
    <LoggedItem
      entry={entry}
      last={last}
      showContext={showContext}
      readOnly={readOnly}
      highlighted={highlighted}
    />
  );
}

/** The outline a linked entry flashes with; it fades out when the highlight ends. */
const ANCHOR =
  "scroll-mt-24 before:pointer-events-none before:absolute before:-inset-x-2.5 before:-top-1.5 before:bottom-1.5 before:rounded-xl before:ring-2 before:ring-transparent before:transition-[box-shadow,background-color] before:duration-slow before:content-['']";
const ANCHOR_ON = "before:ring-selected/45 before:bg-selected/5";

function AutomaticItem({
  entry,
  last,
  highlighted,
}: {
  entry: Entry;
  last: boolean;
  highlighted: boolean;
}) {
  const meta = KIND_META[entry.kind];
  const actorName = entry.actor?.name ?? "Hypedrive";
  const changes = entry.changes ?? [];

  return (
    <li
      id={`${ENTRY_ANCHOR}${entry._id}`}
      className={cn(
        "animate-item-in relative flex gap-3 pb-3.5",
        ANCHOR,
        highlighted && ANCHOR_ON,
      )}
    >
      <Rail last={last} compact />
      <span className="flex w-7 shrink-0 justify-center">
        <span className="bg-overlay-2 text-fg-tertiary flex size-5.5 items-center justify-center rounded-md">
          <meta.icon aria-hidden className="size-3" />
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="caption-style flex min-h-5.5 items-baseline gap-2 pt-0.5 leading-5">
          <p className="text-fg-secondary min-w-0 flex-1">
            <span className="text-foreground font-medium">{actorName}</span>{" "}
            {entry.kind === "system" ? (
              entry.subject
            ) : changes.length === 1 ? (
              <ChangeText change={changes[0]} />
            ) : (
              `changed ${changes.length} fields`
            )}
          </p>
          <Time at={entry.occurredAt} />
        </div>
        {entry.kind === "change" && changes.length > 1 && (
          <ul className="flex flex-col gap-0.5">
            {changes.map((change) => (
              <li
                key={change.field}
                className="caption-style text-fg-secondary leading-5"
              >
                <ChangeText change={change} />
              </li>
            ))}
          </ul>
        )}
        {entry.kind === "system" && entry.body && (
          <p className="caption-style text-fg-tertiary leading-snug break-words whitespace-pre-line">
            {entry.body}
          </p>
        )}
      </div>
    </li>
  );
}

function ChangeText({
  change,
}: {
  change: { field: string; from?: string; to?: string };
}) {
  const field = change.field.toLowerCase();
  if (change.field === "Tags") {
    const before = change.from?.split(", ") ?? [];
    const after = change.to?.split(", ") ?? [];
    const added = after.filter((tag) => !before.includes(tag));
    const removed = before.filter((tag) => !after.includes(tag));
    return (
      <>
        {added.length > 0 && (
          <>
            added {added.length === 1 ? "tag" : "tags"}{" "}
            <span className="text-foreground">{added.join(", ")}</span>
          </>
        )}
        {added.length > 0 && removed.length > 0 && " and "}
        {removed.length > 0 && (
          <>
            removed {removed.length === 1 ? "tag" : "tags"}{" "}
            <span className="text-foreground">{removed.join(", ")}</span>
          </>
        )}
        {added.length === 0 && removed.length === 0 && "reordered tags"}
      </>
    );
  }
  if (!change.to) {
    return (
      <>
        cleared {field}
        {change.from && (
          <span className="text-fg-tertiary line-through decoration-1">
            {" "}
            {change.from}
          </span>
        )}
      </>
    );
  }
  return (
    <>
      {change.from ? "changed" : "set"} {field}{" "}
      {change.from && (
        <>
          <span className="text-fg-tertiary">{change.from}</span>{" "}
          <span aria-label="to" className="text-fg-tertiary">
            →
          </span>{" "}
        </>
      )}
      {!change.from && "to "}
      <span className="text-foreground break-words">{change.to}</span>
    </>
  );
}

function LoggedItem({
  entry,
  last,
  showContext,
  readOnly,
  highlighted,
}: {
  entry: Entry;
  last: boolean;
  showContext: boolean;
  readOnly: boolean;
  highlighted: boolean;
}) {
  const viewer = useViewer();
  const remove = useMutation(api.timeline.remove);
  const restore = useMutation(api.timeline.restore);
  const edit = useMutation(api.timeline.edit);
  const [editing, setEditing] = useState(false);
  const draft = useMentionDraft();
  const meta = KIND_META[entry.kind];
  const canManage =
    !readOnly && (entry.actorId === viewer._id || viewer.role === "admin");
  const canAck = !readOnly && entry.actorId !== viewer._id;
  const acked = entry.acked.some((member) => member._id === viewer._id);
  const acknowledge = useAcknowledge();
  const actorName = entry.actor?.name ?? "Hypedrive";
  const details = [
    entry.outcome && CALL_OUTCOME_LABEL[entry.outcome],
    entry.durationMin ? `${entry.durationMin} min` : null,
  ].filter(Boolean);

  async function onDelete() {
    try {
      const removed = await remove({ id: entry._id });
      toast(`${meta.label} deleted`, () => {
        if (removed.kind !== "change" && removed.kind !== "system") {
          void restore({ entry: { ...removed, kind: removed.kind } });
        }
      });
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function onSave() {
    try {
      await edit({ id: entry._id, body: draft.encoded() });
      setEditing(false);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  return (
    <li
      id={`${ENTRY_ANCHOR}${entry._id}`}
      className={cn(
        "group/item animate-item-in relative flex gap-3 pb-5",
        ANCHOR,
        highlighted && ANCHOR_ON,
      )}
    >
      <Rail last={last} compact={false} />
      <span className="bg-card shadow-card text-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
        <meta.icon aria-hidden className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        <div className="flex min-h-5 items-baseline gap-2 text-sm leading-5">
          <p className="text-fg-secondary min-w-0 flex-1">
            {entry.direction === "inbound" ? (
              <>
                <span className="text-foreground font-medium">
                  {entry.person?.name ?? "Contact"}
                </span>{" "}
                replied by {entry.kind === "whatsapp" ? "WhatsApp" : "email"}
              </>
            ) : (
              <>
                <span className="text-foreground font-medium">{actorName}</span>{" "}
                {entry.kind === "note"
                  ? "added a note"
                  : `logged ${entry.kind === "email" ? "an" : "a"} ${meta.label.toLowerCase()}`}
              </>
            )}
            {showContext && entry.person && (
              <>
                {" "}
                with{" "}
                <Link
                  href={`/people/${entry.person._id}`}
                  className="text-foreground hover:underline"
                >
                  {entry.person.name}
                </Link>
              </>
            )}
            {showContext && entry.deal && (
              <>
                {" "}
                on{" "}
                <Link
                  href={`/deals/${entry.deal._id}`}
                  className="text-foreground hover:underline"
                >
                  {entry.deal.title}
                </Link>
              </>
            )}
            {details.length > 0 && (
              <span className="text-fg-tertiary"> · {details.join(" · ")}</span>
            )}
          </p>
          {(canManage || canAck) && !editing && (
            <span className="flex gap-0.5 self-center opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 pointer-coarse:opacity-100">
              {canAck && (
                <Tooltip
                  content={acked ? "Remove acknowledgement" : "Acknowledge"}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      acked ? "Remove acknowledgement" : "Acknowledge"
                    }
                    aria-pressed={acked}
                    onClick={() => acknowledge(entry._id)}
                    className={cn(acked && "text-info-foreground")}
                  >
                    <CheckCircleIcon aria-hidden className="size-3" />
                  </Button>
                </Tooltip>
              )}
              {canManage && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Edit entry"
                    onClick={() => {
                      draft.reset(
                        entry.body ?? "",
                        entry.mentioned.map((member) => ({
                          id: member._id,
                          name: member.name,
                        })),
                      );
                      setEditing(true);
                    }}
                  >
                    <EditIcon aria-hidden className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete entry"
                    onClick={() => void onDelete()}
                  >
                    <TrashIcon aria-hidden className="size-3" />
                  </Button>
                </>
              )}
            </span>
          )}
          <Time at={entry.occurredAt} edited={Boolean(entry.editedAt)} />
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionTextarea
              autoFocus
              draft={draft}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setEditing(false);
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void onSave();
                }
              }}
              aria-label="Edit entry"
              className="border-selected ring-selected/20 bg-secondary field-sizing-content min-h-16 w-full resize-none rounded-lg border px-3 py-2 text-sm leading-snug ring-3 outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" size="xs" onClick={() => void onSave()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          entry.body && (
            <p className="bg-card shadow-card text-fg-secondary rounded-lg px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
              <EntryBody body={entry.body} mentioned={entry.mentioned} />
            </p>
          )
        )}
        {!editing && (
          <Acknowledgements
            entry={entry}
            canAck={canAck}
            onToggle={() => acknowledge(entry._id)}
          />
        )}
      </div>
    </li>
  );
}

function useAcknowledge() {
  const viewer = useViewer();
  const acknowledge = useMutation(
    api.mentions.acknowledge,
  ).withOptimisticUpdate((store, { id }) => {
    for (const { args, value } of store.getAllQueries(api.timeline.forRecord)) {
      if (!value) continue;
      store.setQuery(
        api.timeline.forRecord,
        args,
        value.map((item) =>
          item._id !== id
            ? item
            : {
                ...item,
                acked: item.acked.some((member) => member._id === viewer._id)
                  ? item.acked.filter((member) => member._id !== viewer._id)
                  : [...item.acked, { _id: viewer._id, name: viewer.name }],
              },
        ),
      );
    }
  });
  return (id: Entry["_id"]) =>
    void acknowledge({ id }).catch((error) =>
      toast(readError(error).message, { tone: "danger" }),
    );
}

/** Who acknowledged an entry; a toggle for anyone but its author. */
function Acknowledgements({
  entry,
  canAck,
  onToggle,
}: {
  entry: Entry;
  canAck: boolean;
  onToggle: () => void;
}) {
  const viewer = useViewer();
  if (entry.acked.length === 0) return null;
  const mine = entry.acked.some((member) => member._id === viewer._id);
  const names = entry.acked.map((member) =>
    member._id === viewer._id ? "You" : member.name,
  );
  const label = `Acknowledged by ${names.join(", ")}`;
  return (
    <Tooltip content={canAck && mine ? `${label}. Click to undo.` : label}>
      <button
        type="button"
        aria-disabled={!canAck}
        aria-pressed={canAck ? mine : undefined}
        aria-label={label}
        onClick={() => canAck && onToggle()}
        className={cn(
          "caption-style text-fg-secondary bg-overlay-1 focus-visible:ring-ring duration-fast flex h-6 items-center gap-1 self-start rounded-full px-2 tabular-nums transition-colors outline-none focus-visible:ring-2",
          canAck
            ? "hover:bg-overlay-2 hover:text-foreground"
            : "cursor-default",
          mine && "bg-info-surface text-info-foreground hover:bg-info-surface",
        )}
      >
        <CheckCircleIcon aria-hidden className="size-3" />
        {entry.acked.length}
      </button>
    </Tooltip>
  );
}
