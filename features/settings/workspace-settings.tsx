"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import { Input } from "@/components/_ui/input";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import { useMembers } from "@/hooks/use-viewer";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { PageStatus } from "@/components/shell/page";
import { ROLE_TONE } from "@/features/team/roles";
import PrivacySettings from "@/features/consent/privacy-settings";
import {
  AdminOnly,
  SettingsIntro,
  SettingsRow,
  SettingsSection,
} from "./settings-ui";

const SLA_KEY = "leads.slaMinutes";
const ROTATION_KEY = "leads.roundRobinMemberIds";
const SLA_MIN = 1;
const SLA_MAX = 120;

type Settings = FunctionReturnType<typeof api.settings.get>;

function minutes(value: number) {
  return `${value} ${value === 1 ? "minute" : "minutes"}`;
}

/** /settings/workspace: lead SLA, round-robin participants and sign-up domains. */
export default function WorkspaceSettings() {
  return (
    <AdminOnly>
      <SettingsIntro>
        Rules that apply to everyone: how fast new leads must be contacted, who
        gets them, and who can join.
      </SettingsIntro>
      <WorkspaceForm />
      <PrivacySettings />
    </AdminOnly>
  );
}

function useSetSetting() {
  return useMutation(api.settings.set).withOptimisticUpdate(
    (store, { setting }) => {
      const current = store.getQuery(api.settings.get, {});
      if (!current) return;
      const value =
        setting.value ??
        (setting.key === SLA_KEY ? current.defaults[SLA_KEY] : []);
      store.setQuery(api.settings.get, {}, {
        ...current,
        [setting.key]: value,
        isDefault: { ...current.isDefault, [setting.key]: !setting.value },
      } as Settings);
    },
  );
}

function WorkspaceForm() {
  const settings = useQuery(api.settings.get, {});
  const environment = useQuery(api.settings.environment, {});

  return (
    <>
      <SettingsSection
        title="Lead routing"
        description="Changes apply to leads that arrive from now on; existing leads keep their owner."
      >
        {settings ? (
          <SlaRow key={settings[SLA_KEY]} settings={settings} />
        ) : (
          <RowSkeleton />
        )}
      </SettingsSection>

      <RotationSection settings={settings} />

      <SettingsSection title="Joining the workspace">
        <SettingsRow
          label="Allowed sign-up domains"
          description={
            <>
              People with these email domains can join as reps without an
              invite. Set with{" "}
              <code className="text-fg-secondary font-mono">
                ALLOWED_EMAIL_DOMAINS
              </code>{" "}
              on the Convex deployment.
            </>
          }
        >
          {!environment ? (
            <Skeleton className="h-5.5 w-24 rounded-full" />
          ) : environment.allowedDomains.length > 0 ? (
            <span className="flex flex-wrap gap-1.5 sm:justify-end">
              {environment.allowedDomains.map((domain) => (
                <Tag key={domain} size="sm" className="font-mono text-xs">
                  @{domain}
                </Tag>
              ))}
            </span>
          ) : (
            <PageStatus tone="neutral">Invite only</PageStatus>
          )}
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

function SlaRow({ settings }: { settings: Settings }) {
  const set = useSetSetting();
  const current = settings[SLA_KEY];
  const fallback = settings.defaults[SLA_KEY];
  const isDefault = settings.isDefault[SLA_KEY];
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const parsed = Number(value);
  const dirty = value.trim() !== String(current);

  async function save(next: number | null) {
    setSaving(true);
    setError(undefined);
    try {
      const { previous } = await set({
        setting: { key: SLA_KEY, value: next },
      });
      toast(
        next === null
          ? `Lead SLA reset to ${minutes(fallback)}`
          : `Lead SLA set to ${minutes(next)}`,
        () => {
          set({
            setting: { key: SLA_KEY, value: previous as number | null },
          }).catch((reason) =>
            toast(readError(reason).message, { tone: "danger" }),
          );
        },
      );
    } catch (reason) {
      setError(readError(reason, "Couldn't save the SLA").message);
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !Number.isInteger(parsed) ||
      parsed < SLA_MIN ||
      parsed > SLA_MAX ||
      value.trim() === ""
    ) {
      setError(`Enter whole minutes between ${SLA_MIN} and ${SLA_MAX}`);
      return;
    }
    if (parsed !== current || isDefault) void save(parsed);
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsRow
        label="First-touch SLA"
        htmlFor="sla-minutes"
        description={
          <>
            A new lead is flagged and the team alerted when nobody contacts it
            within this time.{" "}
            {isDefault
              ? "Using the default."
              : `Default is ${minutes(fallback)}.`}
          </>
        }
        className="sm:items-start"
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex items-center gap-2">
            {!isDefault && !dirty && (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => void save(null)}
                disabled={saving}
              >
                Reset
              </Button>
            )}
            <div className="relative">
              <Input
                id="sla-minutes"
                type="number"
                inputMode="numeric"
                min={SLA_MIN}
                max={SLA_MAX}
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
                aria-describedby={error ? "sla-minutes-error" : undefined}
                className="aria-invalid:border-danger w-28 [appearance:textfield] pr-12 tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span
                aria-hidden
                className="caption-style text-fg-tertiary pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
              >
                min
              </span>
            </div>
            <Button
              type="submit"
              variant={dirty ? "primary" : "secondary"}
              size="control"
              className="h-9 px-4"
              disabled={!dirty}
              loading={saving}
            >
              Save
            </Button>
          </div>
          {error && (
            <span
              id="sla-minutes-error"
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

function RotationSection({ settings }: { settings: Settings | undefined }) {
  const members = useMembers();
  const set = useSetSetting();
  const chosen = settings?.[ROTATION_KEY] ?? [];
  const everyone = chosen.length === 0;

  async function save(next: Id<"members">[], message: string) {
    try {
      const { previous } = await set({
        setting: { key: ROTATION_KEY, value: next.length > 0 ? next : null },
      });
      toast(message, () => {
        set({
          setting: {
            key: ROTATION_KEY,
            value: previous as Id<"members">[] | null,
          },
        }).catch((reason) =>
          toast(readError(reason).message, { tone: "danger" }),
        );
      });
    } catch (reason) {
      toast(readError(reason, "Couldn't update the rotation").message, {
        tone: "danger",
      });
    }
  }

  function toggle(id: Id<"members">, name: string, include: boolean) {
    const all = members?.map((member) => member._id) ?? [];
    const base = everyone ? all : chosen;
    const next = include ? [...base, id] : base.filter((item) => item !== id);
    if (next.length === 0) {
      toast("Keep at least one person in the rotation", { tone: "warning" });
      return;
    }
    const covers = all.every((item) => next.includes(item));
    void save(
      covers ? [] : next,
      covers
        ? "New leads now rotate through everyone"
        : include
          ? `${name} added to the lead rotation`
          : `${name} removed from the lead rotation`,
    );
  }

  return (
    <SettingsSection
      title="Round-robin"
      description={
        everyone
          ? "New leads rotate through every active member, including people who join later. Untick someone to leave them out."
          : `New leads rotate through ${chosen.length} of ${members?.length ?? "…"} active members.`
      }
      action={
        !everyone && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() =>
              void save([], "New leads now rotate through everyone")
            }
          >
            Include everyone
          </Button>
        )
      }
    >
      {!settings || !members ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : (
        <ul aria-label="Lead rotation" className="flex flex-col">
          {members.map((member) => {
            const included = everyone || chosen.includes(member._id);
            const id = `rotation-${member._id}`;
            return (
              <li key={member._id}>
                <label
                  htmlFor={id}
                  className="border-border hover:bg-overlay-1 duration-fast flex h-12 cursor-pointer items-center gap-3 border-t px-6 transition-colors"
                >
                  <Checkbox
                    id={id}
                    checked={included}
                    onCheckedChange={(checked) =>
                      toggle(member._id, member.name, checked === true)
                    }
                  />
                  <Avatar name={member.name} size="sm" />
                  <span className="lead-style min-w-0 flex-1 truncate">
                    {member.name}
                  </span>
                  <Tag
                    tone={ROLE_TONE[member.role]}
                    size="xs"
                    className="max-sm:hidden"
                  >
                    {ROLE_LABEL[member.role]}
                  </Tag>
                  <span className="flex w-24 shrink-0 justify-end">
                    <PageStatus tone={included ? "success" : "neutral"}>
                      {included ? "In rotation" : "Left out"}
                    </PageStatus>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}

function RowSkeleton() {
  return (
    <div className="border-border flex h-12 items-center gap-3 border-t px-6">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="ml-auto h-3 w-16" />
    </div>
  );
}
