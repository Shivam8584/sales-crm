"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_RANK } from "@/lib/domain/enums";
import SearchIcon from "@/public/assets/icons/search.svg";
import { ReasonTags } from "./reason-tags";
import { ReviewDialog } from "./review-dialog";

type Target = FunctionArgs<typeof api.dedupe.forRecord>;
type Match = FunctionReturnType<typeof api.dedupe.forRecord>[number];

/**
 * The "Find duplicates" page action and its dialogs. Both are absent unless
 * the viewer can merge and the record has look-alikes.
 */
export function useDuplicatesAction(target: Target) {
  const viewer = useViewer();
  const manager = ROLE_RANK[viewer.role] >= ROLE_RANK.manager;
  const matches = useQuery(api.dedupe.forRecord, manager ? target : "skip");
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState<string | null>(null);
  const type = target.accountId ? "accounts" : "people";
  const selfId = (target.accountId ?? target.personId)!;

  function close(next: boolean) {
    setOpen(next);
    if (!next) setOther(null);
  }

  return {
    action: manager &&
      Boolean(matches?.length) && {
        label: "Find duplicates",
        icon: SearchIcon,
        onSelect: () => {
          setOther(matches?.length === 1 ? matches[0].id : null);
          setOpen(true);
        },
      },
    dialog: manager && (
      <>
        {other && (
          <ReviewDialog
            type={type}
            ids={[selfId, other]}
            open={open}
            onOpenChange={close}
          />
        )}
        {!other && (
          <PickDialog
            matches={matches ?? []}
            open={open}
            onOpenChange={close}
            onPick={setOther}
          />
        )}
      </>
    ),
  };
}

function PickDialog({
  matches,
  open,
  onOpenChange,
  onPick,
}: {
  matches: Match[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Possible duplicates</DialogTitle>
          <DialogDescription>
            Pick one to compare with this record.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col">
          {matches.map((match) => (
            <li
              key={match.id}
              className="border-border flex items-center gap-3 border-t px-6 py-3 first:border-t-0"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="lead-style truncate font-medium">
                  {match.name}
                </span>
                {match.sub && (
                  <span className="caption-style text-fg-tertiary truncate">
                    {match.sub}
                  </span>
                )}
                <ReasonTags reasons={match.reasons} />
              </span>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => onPick(match.id)}
              >
                Review
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
