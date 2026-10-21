"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import { useViewer } from "@/hooks/use-viewer";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import EyeIcon from "@/public/assets/icons/eye.svg";

type Followable =
  | { accountId: Id<"accounts"> }
  | { dealId: Id<"deals"> }
  | { leadId: Id<"leads"> };

function others(names: string[]) {
  if (names.length === 0) return "";
  if (names.length <= 2) return ` Also following: ${names.join(" and ")}.`;
  return ` Also following: ${names.slice(0, 2).join(", ")} and ${names.length - 2} more.`;
}

/** Follow a record to hear about its stage changes, new deals, wins, losses and notes. */
export default function FollowButton({ target }: { target: Followable }) {
  const viewer = useViewer();
  const state = useQuery(api.follows.forRecord, { target });
  const setFollowing = useMutation(
    api.follows.setFollowing,
  ).withOptimisticUpdate((store, { target, following }) => {
    const current = store.getQuery(api.follows.forRecord, { target });
    if (!current) return;
    store.setQuery(
      api.follows.forRecord,
      { target },
      {
        following,
        followers: following
          ? [...current.followers, { _id: viewer._id, name: viewer.name }]
          : current.followers.filter((member) => member._id !== viewer._id),
      },
    );
  });

  const following = state?.following ?? false;
  const names = (state?.followers ?? [])
    .filter((member) => member._id !== viewer._id)
    .map((member) => member.name);
  const tip = following
    ? `Following: you'll be notified of stage changes, deals and notes.${others(names)}`
    : `Follow to be notified of stage changes, deals and notes.${others(names)}`;

  async function toggle() {
    try {
      await setFollowing({ target, following: !following });
      toast(following ? "Unfollowed" : "Following: updates go to your inbox");
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  return (
    <Tooltip content={<span className="max-w-64">{tip}</span>}>
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={following}
        disabled={state === undefined}
        onClick={() => void toggle()}
        className={cn(
          "h-control-md max-sm:w-control-md gap-1.5 max-sm:px-0",
          following && "text-info-foreground",
        )}
      >
        <EyeIcon aria-hidden className="size-3.5" />
        <span className="max-sm:sr-only">
          {following ? "Following" : "Follow"}
        </span>
      </Button>
    </Tooltip>
  );
}
