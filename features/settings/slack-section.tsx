"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Switch } from "@/components/_ui/switch";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import {
  Code,
  IntegrationCard,
  SettingsRow,
  SettingsSkeleton,
  StatusText,
} from "./settings-ui";

type Status = FunctionReturnType<typeof api.slack.status>;

const PROBLEM = {
  not_connected: "Add a bot token or webhook URL under Keys first",
  disabled: "That event is switched off",
  no_channel: "Choose a default channel first",
  rate_limited: "Too many messages just now. Try again in a minute",
  failed: "Slack refused the message",
} as const;

/** Slack posts for hot leads, closed deals, missed SLAs, the weekly summary and agents. */
export default function SlackSection() {
  const status = useQuery(api.slack.status, {});
  const sendTest = useAction(api.slack.sendTest);
  const [testing, setTesting] = useState(false);
  if (!status) return <SettingsSkeleton rows={3} />;

  async function test() {
    setTesting(true);
    try {
      const result = await sendTest({});
      if (result.ok) toast("Test message sent", { tone: "success" });
      else {
        toast(
          result.error
            ? `${PROBLEM[result.reason]} (${result.error})`
            : PROBLEM[result.reason],
          { tone: "danger" },
        );
      }
    } catch (error) {
      toast(readError(error, "Couldn't send the test").message, {
        tone: "danger",
      });
    } finally {
      setTesting(false);
    }
  }

  const connected = status.mode !== null;
  return (
    <IntegrationCard
      title="Slack"
      description="Post hot leads, closed deals, missed SLAs, the weekly summary and agent output to a channel. Messages carry names and links, never emails or phone numbers."
      health={connected ? "connected" : "off"}
      action={
        connected && (
          <Button
            variant="secondary"
            size="sm"
            loading={testing}
            onClick={() => void test()}
          >
            Send test message
          </Button>
        )
      }
    >
      {connected ? (
        <Connected status={status} />
      ) : (
        <p className="caption-style border-border text-fg-tertiary border-t py-3.5 leading-relaxed">
          Add a bot token (<Code>SLACK_BOT_TOKEN</Code>, with the{" "}
          <Code>chat:write</Code> scope) or an incoming webhook URL (
          <Code>SLACK_WEBHOOK_URL</Code>) under Keys above. Until then nothing
          is posted.
        </p>
      )}
    </IntegrationCard>
  );
}

function Connected({ status }: { status: Status }) {
  const setDefault = useMutation(api.slack.setDefaultChannel);
  const setRoute = useMutation(api.slack.setRoute);
  const channels = status.mode === "bot";

  async function run(job: Promise<unknown>) {
    try {
      await job;
    } catch (error) {
      toast(readError(error, "Couldn't save").message, { tone: "danger" });
    }
  }

  return (
    <>
      {channels && (
        <SettingsRow
          label="Default channel"
          htmlFor="slack-default"
          description="Where messages go unless an event has its own channel. Invite the bot to the channel."
        >
          <ChannelInput
            id="slack-default"
            label="Default channel"
            value={status.defaultChannel ?? ""}
            placeholder="#sales"
            onSave={(channel) => run(setDefault({ channel }))}
          />
        </SettingsRow>
      )}
      {status.routes.map((route) => (
        <SettingsRow
          key={route.id}
          label={route.label}
          htmlFor={`slack-${route.id}`}
          description={route.hint}
        >
          {channels && route.enabled && (
            <ChannelInput
              label={`${route.label} channel`}
              value={route.channel ?? ""}
              placeholder={status.defaultChannel ?? "Default"}
              onSave={(channel) =>
                run(
                  setRoute({
                    event: route.id,
                    enabled: true,
                    channel,
                  }),
                )
              }
            />
          )}
          <Switch
            id={`slack-${route.id}`}
            checked={route.enabled}
            onCheckedChange={(enabled) =>
              void run(
                setRoute({
                  event: route.id,
                  enabled,
                  channel: route.channel ?? undefined,
                }),
              )
            }
          />
        </SettingsRow>
      ))}
      {status.last && (
        <SettingsRow label="Last message">
          <StatusText tone={status.last.ok ? "neutral" : "danger"}>
            {status.last.ok
              ? `Sent ${relativeTime(status.last.at)}`
              : `Failed ${relativeTime(status.last.at)}: ${status.last.error}`}
          </StatusText>
        </SettingsRow>
      )}
    </>
  );
}

function ChannelInput({
  id,
  label,
  value,
  placeholder,
  onSave,
}: {
  id?: string;
  label: string;
  value: string;
  placeholder: string;
  onSave: (channel: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  return (
    <Input
      id={id}
      aria-label={label}
      autoComplete="off"
      spellCheck={false}
      className="w-36"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() !== value) {
          void onSave(draft).then(() => setDraft(value));
        }
      }}
    />
  );
}
