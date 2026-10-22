"use client";

import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { dateTime, relativeTime } from "@/lib/time";

export type ActivityEntry = FunctionReturnType<
  typeof api.activity.feed
>["page"][number];
type Change = NonNullable<ActivityEntry["changes"]>[number];

const VERB = {
  change: "changed",
  system: "",
  call: "logged a call",
  meeting: "logged a meeting",
  note: "added a note",
  email: "logged an email",
  whatsapp: "logged a WhatsApp message",
} as const;

const MAX_LISTED = 3;

function Shift({ change }: { change: Change }) {
  return (
    <>
      <span className="text-fg-tertiary">{change.from ?? "empty"}</span>{" "}
      <span aria-label="to" className="text-fg-tertiary">
        →
      </span>{" "}
      <span className="text-foreground break-words">
        {change.to ?? "cleared"}
      </span>
    </>
  );
}

export function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const record = entry.record;
  const changes = entry.kind === "change" ? (entry.changes ?? []) : [];
  const actor =
    entry.actor?.name ?? (entry.automated ? "Automation" : "Hypedrive");
  const listed = changes.slice(0, MAX_LISTED);
  const more = changes.length - listed.length;

  const what =
    entry.kind === "change"
      ? `changed ${listed.map((change) => change.field).join(", ")}${more > 0 ? ` and ${more} more` : ""}`
      : entry.kind === "system"
        ? (entry.subject ?? "made a change")
        : VERB[entry.kind];
  const note =
    entry.kind === "change" || entry.kind === "system"
      ? undefined
      : entry.subject;

  return (
    <li className="hover:bg-row-hover flex items-start gap-3 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2 text-sm leading-5">
          <p className="text-fg-secondary min-w-0 flex-1 break-words">
            <span className="text-foreground font-medium">{actor}</span> {what}
            {record && (
              <>
                {" on "}
                <Link
                  href={record.href}
                  className="text-foreground focus-visible:ring-ring rounded-sm outline-none hover:underline focus-visible:ring-2"
                >
                  {record.name}
                </Link>
                {record.archived && (
                  <span className="text-fg-tertiary"> · archived</span>
                )}
              </>
            )}
            {changes.length === 1 && (
              <>
                {": "}
                <Shift change={changes[0]} />
              </>
            )}
          </p>
          <Tooltip content={dateTime(entry.at)}>
            <time
              dateTime={new Date(entry.at).toISOString()}
              className="caption-style text-fg-tertiary shrink-0 whitespace-nowrap tabular-nums"
            >
              {relativeTime(entry.at)}
            </time>
          </Tooltip>
        </div>
        {changes.length > 1 && (
          <ul className="caption-style text-fg-secondary flex flex-col gap-0.5 leading-5">
            {listed.map((change) => (
              <li key={change.field} className="truncate">
                {change.field}: <Shift change={change} />
              </li>
            ))}
          </ul>
        )}
        {note && (
          <p className="caption-style text-fg-tertiary line-clamp-2 leading-5 break-words">
            {note}
          </p>
        )}
      </div>
    </li>
  );
}

export function ActivitySkeleton() {
  return (
    <div aria-busy className="flex flex-col">
      <div className="flex h-9 items-center px-4">
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-start gap-3 px-4 py-2.5">
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </span>
        </div>
      ))}
    </div>
  );
}
