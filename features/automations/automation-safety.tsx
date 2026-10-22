"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import Skeleton from "@/components/_ui/skeleton";
import { Switch } from "@/components/_ui/switch";
import { PageStatus } from "@/components/shell/page";
import { SettingsRow, SettingsSection } from "@/features/settings/settings-ui";
import { FREQUENCY_WINDOW_DAYS } from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";

type Safety = FunctionReturnType<typeof api.automations.safety>;

const messages = (count: number) =>
  `${count} ${count === 1 ? "message" : "messages"}`;

/** Settings → Workspace: the sequences kill switch and the per-person frequency cap. */
export default function AutomationSafety() {
  const safety = useQuery(api.automations.safety, {});
  return (
    <SettingsSection
      tone={safety?.killSwitch ? "danger" : "default"}
      title="Sequence safety"
      description="Limits that apply to every sequence, whoever built it."
    >
      {safety ? (
        <>
          <KillSwitchRow safety={safety} />
          <FrequencyRow key={safety.frequencyCap} safety={safety} />
        </>
      ) : (
        <>
          <RowSkeleton />
          <RowSkeleton />
        </>
      )}
    </SettingsSection>
  );
}

function RowSkeleton() {
  return (
    <div className="border-border flex h-18 items-center gap-3 border-t px-4 sm:px-5">
      <span className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-2.5 w-64 max-w-full" />
      </span>
      <Skeleton className="h-5 w-9 rounded-full" />
    </div>
  );
}

function KillSwitchRow({ safety }: { safety: Safety }) {
  const set = useMutation(api.automations.setKillSwitch);
  const [saving, setSaving] = useState(false);
  const stopped = Boolean(safety.killSwitch);

  async function toggle(on: boolean) {
    setSaving(true);
    try {
      const result = await set({ on });
      const undo = () =>
        void set({ on: result.previous }).catch((reason) =>
          toast(readError(reason).message, { tone: "danger" }),
        );
      if (on) {
        toast("All sequences stopped. Runs hold where they are.", {
          tone: "warning",
          undo,
        });
      } else {
        const resumed = result.resumed
          ? ` · ${result.resumed} held ${result.resumed === 1 ? "run" : "runs"} resumed`
          : "";
        toast(`Sequences running again${resumed}`, undo);
      }
    } catch (reason) {
      toast(readError(reason).message, { tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsRow
      label="Stop all sequences"
      htmlFor="automations-kill-switch"
      description={
        stopped && safety.killSwitch ? (
          <>
            <span className="text-danger font-medium">
              Stopped by {safety.killSwitch.by}{" "}
              <time title={dateTime(safety.killSwitch.at)}>
                {relativeTime(safety.killSwitch.at)}
              </time>
              .
            </span>{" "}
            {safety.held
              ? `${safety.held} ${safety.held === 1 ? "run is" : "runs are"} held. `
              : ""}
            Nothing enrols or sends until you turn this off; held runs then
            carry on from where they stopped.
          </>
        ) : (
          "An emergency stop for every sequence: runs hold where they are, nothing new enrols and no message goes out until you turn it off."
        )
      }
    >
      <span className="flex items-center gap-3">
        {stopped && <PageStatus tone="danger">Stopped</PageStatus>}
        <Switch
          id="automations-kill-switch"
          checked={stopped}
          disabled={saving}
          onCheckedChange={(on) => void toggle(on)}
        />
      </span>
    </SettingsRow>
  );
}

function FrequencyRow({ safety }: { safety: Safety }) {
  const set = useMutation(api.automations.setFrequencyCap);
  const { min, max } = safety.frequencyCapLimits;
  const current = safety.frequencyCap;
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const parsed = Number(value);
  const dirty = value.trim() !== String(current);

  async function save(next: number | null) {
    setSaving(true);
    setError(undefined);
    try {
      const { previous } = await set({ value: next });
      toast(
        next === null
          ? `Frequency cap reset to ${messages(safety.frequencyCapLimits.default)}`
          : `At most ${messages(next)} per person every ${FREQUENCY_WINDOW_DAYS} days`,
        () =>
          void set({ value: previous }).catch((reason) =>
            toast(readError(reason).message, { tone: "danger" }),
          ),
      );
    } catch (reason) {
      setError(readError(reason, "Couldn't save the cap").message);
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      value.trim() === "" ||
      !Number.isInteger(parsed) ||
      parsed < min ||
      parsed > max
    ) {
      setError(`Enter a whole number from ${min} to ${max}`);
      return;
    }
    if (dirty) void save(parsed);
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsRow
        label="Frequency cap"
        htmlFor="automations-frequency-cap"
        description={
          <>
            The most automated emails and WhatsApp messages one person gets in
            any {FREQUENCY_WINDOW_DAYS} days, across all sequences. Further
            messages wait until they’re under the cap.{" "}
            {safety.frequencyCapIsDefault
              ? "Using the default."
              : `Default is ${messages(safety.frequencyCapLimits.default)}.`}
          </>
        }
        className="sm:items-start"
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex items-center gap-2">
            {!safety.frequencyCapIsDefault && !dirty && (
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
                id="automations-frequency-cap"
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
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
                aria-describedby={
                  error ? "automations-frequency-cap-error" : undefined
                }
                className="aria-invalid:border-danger w-28 [appearance:textfield] pr-14 text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span
                aria-hidden
                className="caption-style text-fg-tertiary pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
              >
                / {FREQUENCY_WINDOW_DAYS}d
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
              id="automations-frequency-cap-error"
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
