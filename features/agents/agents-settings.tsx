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
} from "@/features/settings/settings-ui";
import { LIMITS } from "@/lib/domain/agents";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

/** Kill switch and the workspace's daily run limit for custom agents; mounted on the System page. */
export default function AgentsSettings() {
  const status = useQuery(api.agents.status, {});
  const set = useMutation(api.agents.setConfig);
  if (!status) return <SettingsSkeleton rows={2} />;

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
      title="Custom agents"
      description="Instructions people write in plain English, run with the AI key as their owner. They can only use the same tools as an MCP token, and changes are off until the owner allows them."
    >
      <SettingsRow
        label="Let agents run"
        htmlFor="agents-enabled"
        description={
          status.enabled
            ? `${status.usedToday} of ${status.dailyCap} runs used today`
            : "Off. Nothing runs, scheduled or by hand."
        }
      >
        <Switch
          id="agents-enabled"
          checked={status.enabled}
          onCheckedChange={(enabled) =>
            void save({ enabled }, enabled ? "Agents on" : "Agents off")
          }
        />
      </SettingsRow>
      <CapRow
        key={status.dailyCap}
        value={status.dailyCap}
        onSave={(dailyCap) => save({ dailyCap }, "Daily limit saved")}
      />
    </SettingsSection>
  );
}

function CapRow({
  value,
  onSave,
}: {
  value: number;
  onSave: (value: number) => Promise<void>;
}) {
  const { min, max } = LIMITS.globalDailyRuns;
  const [text, setText] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const parsed = Number(text);
  const valid = Number.isInteger(parsed) && parsed >= min && parsed <= max;

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
        label="Runs per day"
        htmlFor="agents-cap"
        description={
          valid
            ? "Across every agent. Each run makes up to 8 AI calls."
            : `Enter a whole number from ${min} to ${max}.`
        }
      >
        <Input
          id="agents-cap"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={valid ? undefined : true}
          className="w-24 [appearance:textfield] tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
        />
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
