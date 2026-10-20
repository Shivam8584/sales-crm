"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Skeleton from "@/components/_ui/skeleton";
import { formatPhone } from "@/lib/domain/normalize";
import { personName } from "@/lib/domain/labels";

/** Compact list of an account's people, used on the account page. */
export default function PeopleList({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  const people = useQuery(api.people.list, { accountId });

  if (people === undefined) {
    return (
      <div className="border-border divide-border flex flex-col divide-y rounded-xl border">
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <p className="border-border caption-style text-fg-tertiary rounded-xl border border-dashed px-4 py-5 text-center">
        No people at this account yet.
      </p>
    );
  }

  return (
    <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-xl border">
      {people.map((person) => (
        <li key={person._id} className="relative">
          <Link
            href={`/people/${person._id}`}
            className="hover:bg-overlay-1 focus-visible:ring-ring flex items-center gap-3 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
          >
            <Avatar name={personName(person)} size="md" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="lead-style truncate font-medium">
                {personName(person)}
              </span>
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
          </Link>
        </li>
      ))}
    </ul>
  );
}
