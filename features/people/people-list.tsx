"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import CallButton from "@/features/calls/call-button";
import { formatPhone } from "@/lib/domain/normalize";
import { personName } from "@/lib/domain/labels";
import { relativeTime } from "@/lib/time";
import { useUiStore } from "@/stores/ui-store";
import EyeIcon from "@/public/assets/icons/eye.svg";
import MailIcon from "@/public/assets/icons/mail-03.svg";
import { routes } from "@/lib/routes";

/** Compact list of an account's people, used on the account page and peek. */
export default function PeopleList({
  accountId,
  onAdd,
}: {
  accountId: Id<"accounts">;
  onAdd?: () => void;
}) {
  const people = useQuery(api.people.list, { accountId });
  const setPeek = useUiStore((state) => state.setPeek);

  if (people === undefined) {
    return (
      <div className="border-border divide-border flex flex-col divide-y rounded-xl border">
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-7 rounded-full" />
            <span className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-48" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="border-border caption-style text-fg-tertiary flex flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-5 text-center">
        <span>No people at this account yet.</span>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="text-fg-secondary hover:text-foreground focus-visible:ring-ring rounded-sm underline underline-offset-2 outline-none focus-visible:ring-2"
          >
            Add the founder or your main contact
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-xl border">
      {people.map((person) => {
        const name = personName(person);
        return (
          <li
            key={person._id}
            className="group/person hover:bg-overlay-1 relative flex items-center gap-3 px-3 py-2.5"
          >
            <Avatar name={name} size="md" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <Link
                href={routes.person(person._id)}
                className="lead-style focus-visible:after:ring-ring truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset"
              >
                {name}
              </Link>
              <span className="caption-style text-fg-tertiary truncate">
                {[
                  person.title,
                  person.email,
                  person.phone && formatPhone(person.phone),
                ]
                  .filter(Boolean)
                  .join(" · ") || "No details yet"}
              </span>
            </span>
            {person.lastActivityAt && (
              <span className="caption-style text-fg-tertiary shrink-0 max-sm:hidden">
                {relativeTime(person.lastActivityAt)}
              </span>
            )}
            <span className="relative flex shrink-0 gap-0.5 opacity-0 group-focus-within/person:opacity-100 group-hover/person:opacity-100 pointer-coarse:opacity-100">
              {person.phone && (
                <CallButton
                  target={{ personId: person._id }}
                  name={name}
                  phone={person.phone}
                />
              )}
              {person.email && (
                <Tooltip content={`Email ${person.email}`}>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    href={`mailto:${person.email}`}
                    aria-label={`Email ${name}`}
                  >
                    <MailIcon aria-hidden className="size-3" />
                  </Button>
                </Tooltip>
              )}
              <Tooltip content="Peek">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Peek ${name}`}
                  onClick={() => setPeek({ type: "person", id: person._id })}
                >
                  <EyeIcon aria-hidden className="size-3" />
                </Button>
              </Tooltip>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
