"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Switch } from "@/components/_ui/switch";
import {
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
  StatusText,
} from "@/features/settings/settings-ui";
import { LIMITS } from "@/lib/domain/research";
import { readError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { toast } from "@/stores/toast-store";

type Limit = keyof typeof LIMITS;

/** Switch, daily limit and recheck interval for the research agent; mounted on the System page. */
export default function ResearchSettings() {
  const status = useQuery(api.research.status, {});
  const set = useMutation(api.research.setConfig);
  if (!status) return <SettingsSkeleton rows={3} />;

  async function save(change: Parameters<typeof set>[0], done: string) {
    try {
      await set(change);
      toast(done);
    } catch (error) {
      toast(readError(error, "Couldn't save that").message, { tone: "danger" });
    }
  }

  return (
    <SettingsSection
      title="Research agent"
      description="Keeps account and person records fresh from your own history and enrichment providers. Strong evidence fills empty fields; anything weaker waits for a person."
    >
      <SettingsRow
        label="Run the agent"
        htmlFor="research-enabled"
        description={
          status.enabled
            ? `${status.usedToday} of ${status.dailyCap} checks used today`
            : "Off. Nothing is checked until you turn it on."
        }
      >
        <Switch
          id="research-enabled"
          checked={status.enabled}
          onCheckedChange={(enabled) =>
            void save(
              { enabled },
              enabled ? "Research agent on" : "Research agent off",
            )
          }
        />
      </SettingsRow>
      <LimitRow
        key={`cap-${status.dailyCap}`}
        field="dailyCap"
        label="Checks per day"
        description="The agent stops for the day when it reaches this."
        value={status.dailyCap}
        onSave={(dailyCap) => save({ dailyCap }, "Daily limit saved")}
      />
      <LimitRow
        key={`stale-${status.staleDays}`}
        field="staleDays"
        label="Check again after"
        unit="days"
        description="How long a record can sit before its routine refresh."
        value={status.staleDays}
        onSave={(staleDays) => save({ staleDays }, "Refresh interval saved")}
      />
      {!status.ai && (
        <SettingsRow
          label="Written summaries"
          description={
            <>
              Add an AI key under{" "}
              <a className="underline" href={routes.integrations}>
                Integrations
              </a>{" "}
              to get a short summary on each record. Checks work without one.
            </>
          }
        >
          <StatusText tone="muted">Not configured</StatusText>
        </SettingsRow>
      )}
    </SettingsSection>
  );
}

function LimitRow({
  field,
  label,
  description,
  unit,
  value,
  onSave,
}: {
  field: Limit;
  label: string;
  description: string;
  unit?: string;
  value: number;
  onSave: (value: number) => Promise<void>;
}) {
  const { min, max } = LIMITS[field];
  const [text, setText] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const parsed = Number(text);
  const valid = Number.isInteger(parsed) && parsed >= min && parsed <= max;
  const id = `research-${field}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    await onSave(parsed);
    setSaving(false);
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsRow
        label={label}
        htmlFor={id}
        description={
          valid ? description : `Enter a whole number from ${min} to ${max}.`
        }
      >
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={valid ? undefined : true}
          className="w-24 [appearance:textfield] tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && <span className="caption-style text-fg-tertiary">{unit}</span>}
        {text.trim() !== String(value) && (
          <Button
            type="submit"
            variant="secondary"
            size="xs"
            loading={saving}
            disabled={!valid}
          >
            Save
          </Button>
        )}
      </SettingsRow>
    </form>
  );
}
