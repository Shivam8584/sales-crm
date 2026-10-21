"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { DetailSection } from "@/components/record/detail";
import ConsentEventDialog, {
  type ConsentAction,
} from "@/features/consent/consent-event-dialog";
import {
  channelSummary,
  type ChannelRow,
  type ConsentMatrix,
} from "@/features/consent/consent-status";
import EraseDialog, { type EraseTarget } from "@/features/consent/erase-dialog";
import { useViewer } from "@/hooks/use-viewer";
import {
  CONSENT_CHANNEL_LABEL,
  CONSENT_EVENT_LABEL,
  CONSENT_PURPOSE_LABEL,
  LAWFUL_BASIS_LABEL,
  consentSourceLabel,
} from "@/lib/domain/consent";
import type { Channel } from "@/lib/domain/enums";
import { dateTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import AlertTriangleIcon from "@/public/assets/icons/alert-triangle.svg";

/**
 * The person's consent per channel, derived from the append-only ledger, with
 * the actions that add to it and the full history behind each status.
 */
export default function ConsentRecords({
  personId,
  className,
  divider,
}: {
  personId: Id<"people">;
  className?: string;
  divider?: boolean;
}) {
  const matrix = useQuery(api.consents.forPerson, { personId });
  const viewer = useViewer();
  const admin = viewer.role === "admin";
  const [action, setAction] = useState<ConsentAction | null>(null);
  const [erase, setErase] = useState<EraseTarget | null>(null);
  const name = matrix?.name ?? "this person";

  const erasure = matrix?.erasure.status ?? "none";
  const live = matrix !== undefined && matrix !== null && erasure !== "erased";
  const reachable = (matrix?.channels ?? [])
    .filter((row) => row.hasAddress)
    .map((row) => row.channel);
  const dnd = matrix?.channels.find((row) => row.channel === "phone")?.state.dnd
    .on;

  return (
    <DetailSection
      title="Consent"
      className={cn("gap-2", className)}
      divider={divider}
      action={
        live && (
          <span className="flex items-center gap-1">
            {erasure === "none" && (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setAction("grant")}
              >
                Record
              </Button>
            )}
            <DropdownMenu>
              <Tooltip content="Consent actions">
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Consent actions"
                    className="data-[state=open]:bg-overlay-2"
                  >
                    <DotsIcon aria-hidden className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="end" className="min-w-52">
                {erasure === "none" && (
                  <>
                    <DropdownMenuItem onSelect={() => setAction("grant")}>
                      Record consent
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAction("withdraw")}>
                      Withdraw consent
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setAction(dnd ? "dnd_off" : "dnd_on")}
                    >
                      {dnd ? "Clear DND" : "Mark number as DND"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setAction("erasure_requested")}
                    >
                      Record erasure request
                    </DropdownMenuItem>
                  </>
                )}
                {erasure === "requested" && admin && (
                  <DropdownMenuItem
                    onSelect={() => setAction("erasure_dismissed")}
                  >
                    Dismiss erasure request
                  </DropdownMenuItem>
                )}
                {admin && (
                  <DropdownMenuItem
                    className="text-danger"
                    onSelect={() =>
                      setErase({ kind: "person", id: personId, name })
                    }
                  >
                    Erase personal data…
                  </DropdownMenuItem>
                )}
                {erasure === "requested" && !admin && (
                  <DropdownMenuItem disabled>
                    Waiting for an admin to erase
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )
      }
    >
      {matrix === undefined ? (
        <div aria-busy className="flex flex-col gap-3 py-1">
          {[0, 1, 2].map((key) => (
            <div key={key} className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="ml-auto h-3 w-12" />
            </div>
          ))}
        </div>
      ) : matrix === null ? null : (
        <>
          <ErasureNotice
            matrix={matrix}
            admin={admin}
            onErase={() => setErase({ kind: "person", id: personId, name })}
          />
          <ul aria-label="Consent by channel" className="-mx-1.5 flex flex-col">
            {matrix.channels.map((row) => (
              <ChannelItem key={row.channel} row={row} matrix={matrix} />
            ))}
          </ul>
        </>
      )}
      <ConsentEventDialog
        action={action}
        personId={personId}
        name={name}
        defaultChannels={
          reachable.length ? reachable : (["email"] as Channel[])
        }
        onOpenChange={(open) => !open && setAction(null)}
      />
      <EraseDialog
        target={erase}
        onOpenChange={(open) => !open && setErase(null)}
      />
    </DetailSection>
  );
}

function ErasureNotice({
  matrix,
  admin,
  onErase,
}: {
  matrix: ConsentMatrix;
  admin: boolean;
  onErase: () => void;
}) {
  const { erasure } = matrix;
  if (erasure.status === "none") return null;
  const erased = erasure.status === "erased";
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-3 py-2.5",
        erased
          ? "border-border bg-overlay-1 text-fg-secondary"
          : "border-warning/30 bg-warning/8",
      )}
    >
      <p className="flex items-start gap-2 text-sm leading-snug">
        {!erased && (
          <AlertTriangleIcon
            aria-hidden
            className="text-warning mt-0.5 size-3.5 shrink-0"
          />
        )}
        <span>
          {erased
            ? `Personal data erased ${erasure.at ? shortDate(erasure.at) : ""}. Consent records are kept as proof without personal details.`
            : `Erasure requested ${erasure.at ? shortDate(erasure.at) : ""}${erasure.by ? ` by ${erasure.by.name}` : ""}. All contact is paused until an admin erases the data or dismisses the request.`}
        </span>
      </p>
      {!erased && admin && (
        <Button
          variant="subtle"
          size="xs"
          className="text-danger self-start"
          onClick={onErase}
        >
          Erase now…
        </Button>
      )}
    </div>
  );
}

function ChannelItem({
  row,
  matrix,
}: {
  row: ChannelRow;
  matrix: ConsentMatrix;
}) {
  const [open, setOpen] = useState(false);
  const summary = channelSummary(row, matrix.erasure);
  const label = CONSENT_CHANNEL_LABEL[row.channel];
  const historyId = `consent-history-${row.channel}`;
  const hasHistory = row.history.length > 0;

  return (
    <li className="flex flex-col">
      <button
        type="button"
        aria-expanded={hasHistory ? open : undefined}
        aria-controls={hasHistory ? historyId : undefined}
        disabled={!hasHistory}
        onClick={() => setOpen((value) => !value)}
        className="hover:bg-overlay-1 focus-visible:ring-ring group flex w-full flex-col gap-1 rounded-md px-1.5 py-2 text-left outline-none focus-visible:ring-2 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className="w-19 shrink-0 text-sm">{label}</span>
          <Tag tone={summary.tone} size="xs">
            {summary.label}
          </Tag>
          <span className="caption-style text-fg-tertiary ml-auto flex shrink-0 items-center gap-1 tabular-nums">
            {row.state.lastChangeAt ? shortDate(row.state.lastChangeAt) : "—"}
            {hasHistory && (
              <ChevronDownIcon
                aria-hidden
                className={cn(
                  "duration-base ease-power3-out size-3 transition-transform",
                  open && "rotate-180",
                )}
              />
            )}
          </span>
        </span>
        <span className="caption-style text-fg-tertiary truncate pl-21">
          {summary.detail}
        </span>
      </button>
      {hasHistory && open && (
        <ol
          id={historyId}
          aria-label={`${label} consent history`}
          className="border-line-strong mt-1 mb-2 ml-3 flex flex-col gap-3 border-l py-1 pl-3.5"
        >
          {row.history.map((entry) => (
            <li key={entry._id} className="flex min-w-0 flex-col gap-1">
              <span className="text-sm leading-snug">
                {CONSENT_EVENT_LABEL[entry.event]}
                {entry.purpose && (
                  <span className="text-fg-secondary">
                    {" "}
                    · {CONSENT_PURPOSE_LABEL[entry.purpose]}
                  </span>
                )}
                {entry.basis && (
                  <span className="text-fg-secondary">
                    {" "}
                    · {LAWFUL_BASIS_LABEL[entry.basis]}
                  </span>
                )}
              </span>
              <span className="caption-style text-fg-tertiary leading-snug">
                {dateTime(entry.recordedAt)} ·{" "}
                {consentSourceLabel(entry.source)}
                {entry.actor && ` · ${entry.actor.name}`}
              </span>
              <q className="caption-style text-fg-secondary leading-snug break-words">
                {entry.text}
              </q>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
