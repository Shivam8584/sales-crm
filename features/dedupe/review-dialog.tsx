"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Skeleton from "@/components/_ui/skeleton";
import { COUNT_CAP, movedPhrase } from "@/lib/domain/dedupe";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import type { DedupeType } from "./use-duplicate-scan";

type Row = FunctionReturnType<typeof api.dedupe.compare>[number];
type Choices = NonNullable<FunctionArgs<typeof api.dedupe.merge>["choices"]>;

const FIELDS: Record<DedupeType, { key: string; label: string }[]> = {
  accounts: [
    { key: "name", label: "Name" },
    { key: "domain", label: "Website" },
    { key: "gstin", label: "GSTIN" },
    { key: "ownerId", label: "Owner" },
    { key: "stage", label: "Stage" },
  ],
  people: [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "title", label: "Title" },
    { key: "accountId", label: "Account" },
    { key: "ownerId", label: "Owner" },
  ],
};

const COUNT_LABEL: Record<string, string> = {
  people: "people",
  deals: "deals",
  tasks: "tasks",
  leads: "leads",
  timeline: "timeline entries",
  files: "files",
};

const OPTION =
  "border-input has-focus-visible:ring-selected/20 has-focus-visible:border-selected duration-fast flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-[border-color,background-color,box-shadow] has-focus-visible:ring-3";

const fieldsOf = (row: Row) =>
  row.fields as Record<string, string | null | undefined>;
const weight = (row: Row) =>
  Object.values(row.counts).reduce((sum, count) => sum + count, 0);

function countsLine(row: Row) {
  const parts = Object.entries(row.counts)
    .filter(([, count]) => count > 0)
    .map(
      ([key, count]) =>
        `${count >= COUNT_CAP ? `${COUNT_CAP}+` : count} ${COUNT_LABEL[key] ?? key}`,
    );
  return parts.length > 0 ? parts.join(" · ") : "Nothing linked yet";
}

export function ReviewDialog({
  type,
  ids,
  open,
  onOpenChange,
  onMerged,
  onDismissed,
}: {
  type: DedupeType;
  ids: [string, string];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged?: (loserId: string) => void;
  onDismissed?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-160">
        <ReviewForm
          type={type}
          ids={ids}
          onClose={() => onOpenChange(false)}
          onMerged={onMerged}
          onDismissed={onDismissed}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReviewForm({
  type,
  ids,
  onClose,
  onMerged,
  onDismissed,
}: {
  type: DedupeType;
  ids: [string, string];
  onClose: () => void;
  onMerged?: (loserId: string) => void;
  onDismissed?: () => void;
}) {
  const rows = useQuery(api.dedupe.compare, { type, ids });
  const merge = useMutation(api.dedupe.merge);
  const dismiss = useMutation(api.dedupe.dismiss);
  const [kept, setKept] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"merge" | "dismiss" | null>(null);
  const [started, setStarted] = useState(false);

  const winner =
    rows &&
    (rows.find((row) => row.id === kept) ??
      (weight(rows[1]) > weight(rows[0]) ? rows[1] : rows[0]));
  const loser = rows && winner && rows.find((row) => row.id !== winner.id);

  const finished = started && loser?.status === "merged";
  useEffect(() => {
    if (!finished || !winner || !loser) return;
    toast(`Merged ${loser.name} into ${winner.name}`);
    onMerged?.(loser.id);
    onClose();
  }, [finished, winner, loser, onMerged, onClose]);

  if (!rows || !winner || !loser) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Merge duplicates</DialogTitle>
          <DialogDescription>Loading both records…</DialogDescription>
        </DialogHeader>
        <div aria-hidden className="grid gap-3 px-6 py-5 sm:grid-cols-2">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </>
    );
  }

  const winnerFields = fieldsOf(winner);
  const loserFields = fieldsOf(loser);
  const conflicts = FIELDS[type].filter(
    ({ key }) =>
      winnerFields[key] &&
      loserFields[key] &&
      winnerFields[key] !== loserFields[key],
  );
  const mismatch = Boolean(
    winner.link && loser.link && winner.link !== loser.link,
  );
  const busyMerging = Boolean(winner.status || loser.status);
  const phrase = movedPhrase(loser.counts, COUNT_CAP);

  async function confirm() {
    if (!winner || !loser) return;
    const choices: Choices = {};
    for (const { key } of conflicts) {
      if (picked[key] === loser.id) {
        (choices as Record<string, "loser">)[key] = "loser";
      }
    }
    setBusy("merge");
    setKept(winner.id);
    try {
      await merge({
        type,
        winnerId: winner.id,
        loserId: loser.id,
        choices,
      });
      setStarted(true);
    } catch (error) {
      toast(readError(error, "Couldn't merge these").message, {
        tone: "danger",
      });
      setBusy(null);
    }
  }

  async function notDuplicates() {
    setBusy("dismiss");
    try {
      await dismiss({ type, aId: ids[0], bId: ids[1] });
      toast("Marked as not duplicates");
      onDismissed?.();
      onClose();
    } catch (error) {
      toast(readError(error, "Couldn't save that").message, { tone: "danger" });
      setBusy(null);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Merge duplicates</DialogTitle>
        <DialogDescription>
          Pick the record to keep. Everything linked to the other one moves to
          it.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-5 px-6 py-5">
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="sr-only">Record to keep</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => {
              const fields = fieldsOf(row);
              const isKept = row.id === winner.id;
              return (
                <label
                  key={row.id}
                  className={cn(
                    OPTION,
                    isKept
                      ? "border-selected bg-overlay-1"
                      : "hover:bg-overlay-1",
                  )}
                >
                  <input
                    type="radio"
                    name="keep"
                    checked={isKept}
                    disabled={busy !== null}
                    onChange={() => setKept(row.id)}
                    className="accent-selected mt-0.5 size-3.5 shrink-0"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-sm leading-none font-medium break-words">
                      {row.name}
                    </span>
                    <span className="caption-style text-fg-tertiary break-words">
                      {FIELDS[type]
                        .filter(({ key }) => key !== "name" && fields[key])
                        .map(({ key }) => fields[key])
                        .join(" · ") || "No other details"}
                    </span>
                    <span className="caption-style text-fg-secondary">
                      {countsLine(row)}
                    </span>
                    {isKept && (
                      <span className="caption-style text-fg-tertiary">
                        Keep this one
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {conflicts.map(({ key, label }) => {
          const value = picked[key] ?? winner.id;
          return (
            <fieldset key={key} className="flex min-w-0 flex-col gap-2">
              <legend className="eyebrow-style text-fg-secondary mb-2">
                {label}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[winner, loser].map((row) => (
                  <label
                    key={row.id}
                    className={cn(
                      OPTION,
                      "items-center",
                      value === row.id
                        ? "border-selected bg-overlay-1"
                        : "hover:bg-overlay-1",
                    )}
                  >
                    <input
                      type="radio"
                      name={`field-${key}`}
                      checked={value === row.id}
                      disabled={busy !== null}
                      onChange={() =>
                        setPicked((current) => ({ ...current, [key]: row.id }))
                      }
                      className="accent-selected size-3.5 shrink-0"
                    />
                    <span className="min-w-0 text-sm break-words">
                      {fieldsOf(row)[key]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        {mismatch ? (
          <p role="alert" className="caption-style text-danger">
            These are linked to different Hypedrive records, so they can&apos;t
            be merged.
          </p>
        ) : busyMerging ? (
          <p role="status" className="caption-style text-fg-secondary">
            {started
              ? "Moving everything across. This takes a moment."
              : "A merge is already running for one of these."}
          </p>
        ) : (
          <p className="caption-style text-fg-secondary">
            {phrase === "nothing"
              ? "Nothing is linked to the other record."
              : `This moves ${phrase} to the record you keep.`}{" "}
            The other record is archived, not deleted.
          </p>
        )}
      </div>
      <DialogFooter className="flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="mr-auto"
          disabled={busy !== null}
          loading={busy === "dismiss"}
          onClick={() => void notDuplicates()}
        >
          Not duplicates
        </Button>
        <DialogClose asChild>
          <Button variant="subtle" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button
          variant="primary"
          size="sm"
          disabled={mismatch || busyMerging || busy === "dismiss"}
          loading={busy === "merge"}
          onClick={() => void confirm()}
        >
          {busy === "merge" ? "Merging…" : "Confirm merge"}
        </Button>
      </DialogFooter>
    </>
  );
}
