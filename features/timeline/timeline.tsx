"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
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
import { KIND_META, type TimelineTarget } from "./kinds";
import TimelineComposer from "./timeline-composer";

type Entry = FunctionReturnType<typeof api.timeline.forRecord>[number];

/** Composer plus the record's history: interactions, field changes and system events. */
export default function Timeline({ target }: { target: TimelineTarget }) {
  const entries = useQuery(api.timeline.forRecord, { target });

  return (
    <div className="flex flex-col gap-5">
      <TimelineComposer target={target} />
      {entries === undefined ? (
        <ol className="flex flex-col gap-5" aria-busy>
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex gap-3">
              <Skeleton className="size-6 rounded-full" />
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
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry, index) => (
            <TimelineItem
              key={entry._id}
              entry={entry}
              last={index === entries.length - 1}
              showPerson={"accountId" in target}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineItem({
  entry,
  last,
  showPerson,
}: {
  entry: Entry;
  last: boolean;
  showPerson: boolean;
}) {
  const viewer = useViewer();
  const remove = useMutation(api.timeline.remove);
  const restore = useMutation(api.timeline.restore);
  const edit = useMutation(api.timeline.edit);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body ?? "");
  const meta = KIND_META[entry.kind];
  const automatic = entry.kind === "change" || entry.kind === "system";
  const canManage =
    !automatic && (entry.actorId === viewer._id || viewer.role === "admin");
  const actorName = entry.actor?.name ?? "Hypedrive";

  async function onDelete() {
    try {
      const removed = await remove({ id: entry._id });
      toast(`${meta.label} deleted`, () => {
        if (removed.kind !== "change" && removed.kind !== "system") {
          void restore({ entry: { ...removed, kind: removed.kind } });
        }
      });
    } catch (error) {
      toast(readError(error).message);
    }
  }

  async function onSave() {
    try {
      await edit({ id: entry._id, body: draft });
      setEditing(false);
    } catch (error) {
      toast(readError(error).message);
    }
  }

  return (
    <li className="group/item relative flex gap-3 pb-6 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className="bg-border absolute top-7 bottom-1 left-3 w-px"
        />
      )}
      <span
        className={cn(
          "bg-raised shadow-hairline text-fg-secondary flex size-6 shrink-0 items-center justify-center rounded-full",
          automatic && "text-fg-tertiary bg-transparent shadow-none",
        )}
      >
        <meta.icon aria-hidden className="size-3" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <div className="flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-snug">
          {entry.actor && <Avatar name={actorName} size="xs" />}
          <span className="font-medium">{actorName}</span>
          <span className="text-fg-secondary">
            {entry.kind === "change"
              ? "updated"
              : entry.kind === "system"
                ? entry.subject
                : `logged a ${meta.label.toLowerCase()}`}
          </span>
          {showPerson && entry.person && !automatic && (
            <span className="text-fg-secondary">
              with{" "}
              <Link
                href={`/people/${entry.person._id}`}
                className="text-foreground hover:underline"
              >
                {entry.person.name}
              </Link>
            </span>
          )}
          <Tooltip content={dateTime(entry.occurredAt)}>
            <time
              dateTime={new Date(entry.occurredAt).toISOString()}
              className="caption-style text-fg-tertiary"
            >
              · {relativeTime(entry.occurredAt)}
              {entry.editedAt && " · edited"}
            </time>
          </Tooltip>
          {canManage && !editing && (
            <span className="ml-auto flex gap-0.5 opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 max-sm:opacity-100">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Edit entry"
                onClick={() => setEditing(true)}
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
            </span>
          )}
        </div>

        {entry.kind === "change" && entry.changes && (
          <ul className="flex flex-col gap-1">
            {entry.changes.map((change) => (
              <li
                key={change.field}
                className="caption-style text-fg-secondary leading-snug"
              >
                <span className="text-fg-tertiary">{change.field}</span>{" "}
                {change.from && (
                  <span className="line-through decoration-1">
                    {change.from}
                  </span>
                )}
                {change.from && " → "}
                <span className="text-foreground">
                  {change.to ?? "cleared"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {(entry.outcome || entry.durationMin) && (
          <span className="caption-style text-fg-tertiary">
            {[
              entry.outcome && CALL_OUTCOME_LABEL[entry.outcome],
              entry.durationMin ? `${entry.durationMin} min` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}

        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
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
          entry.body &&
          !automatic && (
            <p className="bg-card border-border rounded-lg border px-3 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {entry.body}
            </p>
          )
        )}
      </div>
    </li>
  );
}
