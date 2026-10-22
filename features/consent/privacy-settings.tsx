"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { SettingsRow, SettingsSection } from "@/features/settings/settings-ui";
import { RETENTION_DAYS } from "@/lib/domain/consent";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime, shortDate } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import ConsentEventDialog from "./consent-event-dialog";
import EraseDialog, { type EraseTarget } from "./erase-dialog";
import { routes } from "@/lib/routes";

type Privacy = FunctionReturnType<typeof api.consents.privacy>;
type Stale = Privacy["stale"][number];

function days(value: number) {
  return `${value} ${value === 1 ? "day" : "days"}`;
}

/** Settings → Privacy: retention window, open erasure requests and stale prospects to review. */
export default function PrivacySettings() {
  const privacy = useQuery(api.consents.privacy, {});
  const [erase, setErase] = useState<EraseTarget | null>(null);
  const [dismiss, setDismiss] = useState<{
    id: Id<"people">;
    name: string;
  } | null>(null);

  return (
    <>
      <SettingsSection
        title="Privacy"
        description="How long prospect data is kept before it's reviewed. Nothing is deleted automatically."
      >
        {privacy ? (
          <RetentionRow key={privacy.retentionDays} privacy={privacy} />
        ) : (
          <RowSkeleton />
        )}
      </SettingsSection>

      <SettingsSection
        tone={privacy && privacy.requests.length > 0 ? "danger" : "default"}
        title="Erasure requests"
        description="People who asked to be forgotten. Contact with them is paused until you erase their data or dismiss the request."
      >
        {!privacy ? (
          <RowSkeleton />
        ) : privacy.requests.length === 0 ? (
          <EmptyRow>No open requests.</EmptyRow>
        ) : (
          <ul aria-label="Erasure requests" className="flex flex-col">
            {privacy.requests.map((request) => (
              <li
                key={request.personId}
                className="border-border flex flex-col gap-3 border-t py-3 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={routes.person(request.personId)}
                    className="lead-style focus-visible:ring-ring truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2"
                  >
                    {request.name}
                  </Link>
                  <span className="caption-style text-fg-tertiary leading-snug">
                    <Tooltip content={dateTime(request.requestedAt)}>
                      <span tabIndex={0} className="outline-none">
                        Requested {shortDate(request.requestedAt)}
                      </span>
                    </Tooltip>
                    {request.by && ` by ${request.by.name}`} · “{request.note}”
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() =>
                      setDismiss({ id: request.personId, name: request.name })
                    }
                  >
                    Dismiss
                  </Button>
                  <Button
                    variant="secondary"
                    size="xs"
                    className="text-danger"
                    onClick={() =>
                      setErase({
                        kind: "person",
                        id: request.personId,
                        name: request.name,
                      })
                    }
                  >
                    Erase…
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <ReviewSection privacy={privacy} onErase={setErase} />

      <EraseDialog
        target={erase}
        onOpenChange={(open) => !open && setErase(null)}
      />
      {dismiss && (
        <ConsentEventDialog
          action="erasure_dismissed"
          personId={dismiss.id}
          name={dismiss.name}
          defaultChannels={[]}
          onOpenChange={(open) => !open && setDismiss(null)}
        />
      )}
    </>
  );
}

function RetentionRow({ privacy }: { privacy: Privacy }) {
  const set = useMutation(api.consents.setRetentionDays);
  const current = privacy.retentionDays;
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== String(current);

  async function save(next: number | null) {
    setSaving(true);
    setError(undefined);
    try {
      const { previous } = await set({ days: next });
      toast(
        next === null
          ? `Retention review reset to ${days(privacy.defaultDays)}`
          : `Retention review set to ${days(next)}`,
        () => {
          set({ days: previous }).catch((reason) =>
            toast(readError(reason).message, { tone: "danger" }),
          );
        },
      );
    } catch (reason) {
      setError(readError(reason, "Couldn't save the retention period").message);
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(value);
    if (
      value.trim() === "" ||
      !Number.isInteger(parsed) ||
      parsed < RETENTION_DAYS.min ||
      parsed > RETENTION_DAYS.max
    ) {
      setError(
        `Enter whole days between ${RETENTION_DAYS.min} and ${RETENTION_DAYS.max}`,
      );
      return;
    }
    if (parsed !== current || privacy.isDefault) void save(parsed);
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsRow
        label="Review unengaged prospects after"
        htmlFor="retention-days"
        description={
          <>
            People and leads with no call, email, meeting, WhatsApp or note for
            this long are listed below.{" "}
            {privacy.isDefault
              ? "Using the default."
              : `Default is ${days(privacy.defaultDays)}.`}
          </>
        }
        className="sm:items-start"
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex items-center gap-2">
            {!privacy.isDefault && !dirty && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void save(null)}
                disabled={saving}
              >
                Reset
              </Button>
            )}
            <div className="relative">
              <Input
                id="retention-days"
                type="number"
                inputMode="numeric"
                min={RETENTION_DAYS.min}
                max={RETENTION_DAYS.max}
                step={1}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && dirty) {
                    event.stopPropagation();
                    setValue(String(current));
                    setError(undefined);
                  }
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "retention-days-error" : undefined}
                className="aria-invalid:border-danger w-28 [appearance:textfield] pr-12 tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span
                aria-hidden
                className="caption-style text-fg-tertiary pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
              >
                days
              </span>
            </div>
            <Button
              type="submit"
              variant={dirty ? "primary" : "subtle"}
              size="control"
              className="px-3.5"
              disabled={!dirty}
              loading={saving}
            >
              Save
            </Button>
          </div>
          {error && (
            <span
              id="retention-days-error"
              role="alert"
              className="caption-style text-danger leading-snug"
            >
              {error}
            </span>
          )}
        </div>
      </SettingsRow>
    </form>
  );
}

function ReviewSection({
  privacy,
  onErase,
}: {
  privacy: Privacy | undefined;
  onErase: (target: EraseTarget) => void;
}) {
  const keep = useMutation(api.consents.keep);
  const unkeep = useMutation(api.consents.unkeep);

  async function keepRow(row: Stale) {
    try {
      const id = await keep(
        row.kind === "person"
          ? { personId: row.id as Id<"people"> }
          : { leadId: row.id as Id<"leads"> },
      );
      toast(
        `${row.name} kept for another ${days(privacy!.retentionDays)}`,
        () => {
          unkeep({ id }).catch((reason) =>
            toast(readError(reason).message, { tone: "danger" }),
          );
        },
      );
    } catch (reason) {
      toast(readError(reason).message, { tone: "danger" });
    }
  }

  const total = privacy?.staleTotal ?? 0;
  return (
    <SettingsSection
      title="Retention review"
      description={
        privacy
          ? total
            ? `${total} ${total === 1 ? "prospect has" : "prospects have"} had no contact for over ${days(privacy.retentionDays)}. Keep them for another window, or erase them if there's no reason to hold their data.`
            : `Prospects with no contact for over ${days(privacy.retentionDays)} show up here.`
          : undefined
      }
    >
      {!privacy ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : privacy.stale.length === 0 ? (
        <EmptyRow>
          Nothing to review. Every prospect was in touch recently.
        </EmptyRow>
      ) : (
        <ul aria-label="Prospects to review" className="flex flex-col">
          {privacy.stale.map((row) => (
            <li
              key={row.id}
              className="border-border flex flex-col gap-3 border-t py-3 sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <Link
                    href={
                      row.kind === "person"
                        ? routes.person(row.id)
                        : routes.lead(row.id)
                    }
                    className="lead-style focus-visible:ring-ring truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2"
                  >
                    {row.name}
                  </Link>
                  <Tag size="xs" tone="neutral">
                    {row.kind === "person" ? "Person" : "Lead"}
                  </Tag>
                </span>
                <span className="caption-style text-fg-tertiary truncate">
                  {row.company && `${row.company} · `}
                  <Tooltip content={dateTime(row.lastTouchAt)}>
                    <span tabIndex={0} className="outline-none">
                      {row.lastTouchAt === row.createdAt
                        ? `Added ${relativeTime(row.lastTouchAt)}, never contacted`
                        : `Last contact ${relativeTime(row.lastTouchAt)}`}
                    </span>
                  </Tooltip>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => void keepRow(row)}
                >
                  Keep
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  className="text-danger"
                  onClick={() =>
                    onErase(
                      row.kind === "person"
                        ? {
                            kind: "person",
                            id: row.id as Id<"people">,
                            name: row.name,
                          }
                        : {
                            kind: "lead",
                            id: row.id as Id<"leads">,
                            name: row.name,
                          },
                    )
                  }
                >
                  Erase…
                </Button>
              </div>
            </li>
          ))}
          {total > privacy.stale.length && (
            <li className="caption-style text-fg-tertiary border-border border-t py-3">
              Showing the {privacy.stale.length} oldest of {total}.
            </li>
          )}
        </ul>
      )}
    </SettingsSection>
  );
}

function EmptyRow({ children }: { children: string }) {
  return (
    <p className="caption-style text-fg-tertiary border-border flex min-h-12 items-center border-t">
      {children}
    </p>
  );
}

function RowSkeleton() {
  return (
    <div className="border-border flex h-12 items-center gap-3 border-t">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="ml-auto h-3 w-16" />
    </div>
  );
}
