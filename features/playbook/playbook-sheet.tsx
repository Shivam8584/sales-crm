"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import { copyText } from "@/features/team/invite-link";
import { PLAYBOOK_KIND_LABEL } from "@/lib/domain/playbook";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import XIcon from "@/public/assets/icons/x.svg";
import type { PlaybookEntry } from "./playbook-browser";

/** One entry, ready to copy; managers and admins also get Edit and Delete. */
export default function PlaybookSheet({
  id,
  canEdit,
  onClose,
  onEdit,
}: {
  id: Id<"playbook"> | null;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (entry: PlaybookEntry) => void;
}) {
  const entry = useQuery(api.playbook.get, id ? { id } : "skip");
  const save = useMutation(api.playbook.save);
  const remove = useMutation(api.playbook.remove);

  async function copy(entry: PlaybookEntry) {
    toast(
      (await copyText(entry.body))
        ? "Copied to clipboard"
        : "Couldn't copy. Select the text instead.",
    );
  }

  async function onDelete({ _id, kind, title, body, tags }: PlaybookEntry) {
    try {
      await remove({ id: _id });
      onClose();
      toast(`Deleted "${title}"`, {
        undo: () => {
          save({ kind, title, body, tags }).catch((error) =>
            toast(readError(error).message, { tone: "danger" }),
          );
        },
      });
    } catch (error) {
      toast(readError(error, "Couldn't delete the entry").message, {
        tone: "danger",
      });
    }
  }

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-130">
        <SheetHeader>
          <SheetTitle>
            {entry ? PLAYBOOK_KIND_LABEL[entry.kind] : "Playbook"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            The full text of this playbook entry
          </SheetDescription>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="-mr-2"
            >
              <XIcon aria-hidden className="size-3.5" />
            </Button>
          </SheetClose>
        </SheetHeader>
        {entry === undefined ? (
          <div aria-busy className="flex flex-col gap-3 px-6 py-6">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : entry === null ? (
          <p className="text-fg-secondary px-6 py-6">
            This entry no longer exists.
          </p>
        ) : (
          <>
            <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg leading-6 font-semibold text-pretty break-words">
                  {entry.title}
                </h2>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.tags.map((tag) => (
                      <Tag key={tag} size="sm">
                        {tag}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                {entry.body}
              </div>
            </div>
            <SheetFooter className="justify-between">
              {canEdit ? (
                <span className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onEdit(entry)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() => void onDelete(entry)}
                  >
                    Delete
                  </Button>
                </span>
              ) : (
                <span />
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => void copy(entry)}
              >
                Copy
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
