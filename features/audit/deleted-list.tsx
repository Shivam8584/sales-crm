"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePagedList } from "@/hooks/use-paged-list";
import { DELETED_KEEP_DAYS } from "@/lib/domain/audit";
import { readError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { dateTime, shortDate } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import { ListSkeleton } from "./changes-list";

type Type = "accounts" | "people" | "deals" | "tasks";

const NOUN = {
  accounts: "accounts",
  people: "people",
  deals: "deals",
  tasks: "tasks",
} as const;

const LINK = { accounts: routes.account, people: routes.person } as const;

export function DeletedList({ type: param }: { type: string }) {
  const type: Type = param in NOUN ? (param as Type) : "accounts";
  const { rows, paging } = usePagedList(
    api.audit.deleted,
    { recordType: type },
    30,
  );
  const restoreEvent = useMutation(api.audit.restore);
  const archiveAccounts = useMutation(api.accounts.setArchived);
  const archivePeople = useMutation(api.people.setArchived);
  const [busy, setBusy] = useState<string | null>(null);
  const archived = type === "accounts" || type === "people";

  async function restore(id: string, label: string) {
    setBusy(id);
    try {
      if (type === "accounts") {
        await archiveAccounts({ ids: [id as Id<"accounts">], archived: false });
      } else if (type === "people") {
        await archivePeople({ ids: [id as Id<"people">], archived: false });
      } else {
        await restoreEvent({ id: id as Id<"auditEvents"> });
      }
      toast(`Restored ${label}`);
    } catch (error) {
      toast(readError(error, "Couldn't restore that").message, {
        tone: "danger",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      {rows === undefined ? (
        <ListSkeleton />
      ) : rows.length === 0 && paging.status === "Exhausted" ? (
        <EmptyState
          title={`No ${archived ? "archived" : "deleted"} ${NOUN[type]}`}
          description={
            archived
              ? "Archived records can be restored from here."
              : `Deleted ${NOUN[type]} can be restored for ${DELETED_KEEP_DAYS} days.`
          }
        />
      ) : (
        <ul aria-busy={paging.stale}>
          {rows.map((row) => (
            <li
              key={row.id}
              className="border-border flex items-center gap-3 border-b px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="min-w-0 text-sm break-words">
                  {type === "accounts" || type === "people" ? (
                    <Link
                      href={LINK[type](row.id)}
                      className="focus-visible:ring-ring rounded-sm outline-none hover:underline focus-visible:ring-2"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                </span>
                <span className="caption-style text-fg-tertiary">
                  {archived ? "Archived" : "Deleted"} {dateTime(row.at)}
                  {row.by && ` by ${row.by.name}`}
                  {row.until &&
                    ` · can be restored until ${shortDate(row.until)}`}
                </span>
              </div>
              <Button
                variant="secondary"
                size="xs"
                disabled={busy !== null}
                onClick={() => restore(row.id, row.label)}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(paging.status === "CanLoadMore" || paging.status === "LoadingMore") && (
        <div className="flex justify-center py-3">
          <Button
            variant="ghost"
            size="xs"
            disabled={paging.status === "LoadingMore"}
            onClick={paging.loadMore}
            className="text-fg-secondary"
          >
            {paging.status === "LoadingMore" ? "Loading more…" : "Load more"}
          </Button>
        </div>
      )}
      <p className="caption-style text-fg-tertiary max-w-prose px-4 py-4">
        Deleted deals and tasks can be restored for {DELETED_KEEP_DAYS} days; a
        deal&apos;s proposals and files are removed after a day. Archived
        accounts and people stay until restored. Merged records and erased
        people can&apos;t be restored, so they aren&apos;t listed.
      </p>
    </div>
  );
}
