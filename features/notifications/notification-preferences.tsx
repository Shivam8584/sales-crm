"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Switch } from "@/components/_ui/switch";
import Tooltip from "@/components/_ui/tooltip";
import { PageStatus } from "@/components/shell/page";
import {
  Code,
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
} from "@/features/settings/settings-ui";
import { NOTIFICATION_GROUPS } from "@/lib/domain/notifications";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import BellIcon from "@/public/assets/icons/bell.svg";
import MailIcon from "@/public/assets/icons/mail.svg";

const DAY_TIME = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const STATUS = {
  sent: { tone: "success", label: "Sent" },
  queued: { tone: "warning", label: "Not sent" },
  failed: { tone: "danger", label: "Failed" },
} as const;

/** Settings → Profile: which notifications reach the inbox, and the daily email digest. */
export default function NotificationPreferences() {
  const prefs = useQuery(api.notifications.prefs);
  const setPrefs = useMutation(api.notifications.setPrefs).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.notifications.prefs, {});
      if (!current) return;
      store.setQuery(
        api.notifications.prefs,
        {},
        {
          ...current,
          muted: args.muted ?? current.muted,
          emailDigest: args.emailDigest ?? current.emailDigest,
        },
      );
    },
  );

  if (prefs === undefined) return <SettingsSkeleton rows={4} />;

  function save(args: { muted?: string[]; emailDigest?: boolean }) {
    setPrefs(args).catch((error) =>
      toast(readError(error, "Couldn't save that").message, {
        tone: "danger",
      }),
    );
  }

  function toggleGroup(group: string, on: boolean) {
    const muted = new Set(prefs!.muted);
    if (on) muted.delete(group);
    else muted.add(group);
    save({ muted: [...muted] });
  }

  const noEmail = prefs.emailProvider === "outbox";
  const last = prefs.lastDigest;

  return (
    <>
      <SettingsSection
        icon={BellIcon}
        title="Notifications"
        description="What reaches your inbox and the bell. Turning a kind off stops new ones; the inbox keeps what's there."
      >
        {NOTIFICATION_GROUPS.map((group) => {
          const id = `notify-${group.value}`;
          const required = "required" in group && group.required;
          const on = required || !prefs.muted.includes(group.value);
          return (
            <SettingsRow
              key={group.value}
              label={group.label}
              htmlFor={id}
              description={group.description}
              className="max-sm:flex-row max-sm:items-center"
            >
              {required ? (
                <Tooltip content="SLA alerts can't be turned off">
                  <span tabIndex={0} className="flex rounded-full">
                    <Switch id={id} checked disabled aria-readonly />
                  </span>
                </Tooltip>
              ) : (
                <Switch
                  id={id}
                  checked={on}
                  onCheckedChange={(checked) =>
                    toggleGroup(group.value, checked)
                  }
                />
              )}
            </SettingsRow>
          );
        })}
      </SettingsSection>

      <SettingsSection
        icon={MailIcon}
        title="Email and Slack"
        description="Catch up away from the CRM."
      >
        <SettingsRow
          label="Daily digest"
          htmlFor="notify-digest"
          className="max-sm:flex-row max-sm:items-center"
          description={
            <>
              Unread notifications by email at 9:00 India time
              {prefs.emailDigest && (
                <>
                  , next on{" "}
                  <span className="text-fg-secondary tabular-nums">
                    {DAY_TIME.format(prefs.nextDigestAt)}
                  </span>
                </>
              )}
              . Nothing is sent on days with nothing unread.
              {noEmail && (
                <span className="text-warning mt-1.5 block">
                  {prefs.emailProblem ??
                    "No email provider is configured, so digests are prepared but not sent."}{" "}
                  An admin can set <Code>EMAIL_PROVIDER</Code>.
                </span>
              )}
            </>
          }
        >
          <Switch
            id="notify-digest"
            checked={prefs.emailDigest}
            onCheckedChange={(checked) => save({ emailDigest: checked })}
          />
        </SettingsRow>
        {last && (
          <SettingsRow
            label="Last digest"
            description={
              <>
                {last.count}{" "}
                {last.count === 1 ? "notification" : "notifications"},{" "}
                <Tooltip content={dateTime(last.at)}>
                  <time
                    tabIndex={0}
                    dateTime={new Date(last.at).toISOString()}
                    className="rounded-sm"
                  >
                    {relativeTime(last.at)}
                  </time>
                </Tooltip>
                {last.error && (
                  <span className="text-danger block">{last.error}</span>
                )}
              </>
            }
            className="max-sm:flex-row max-sm:items-center"
          >
            <PageStatus tone={STATUS[last.status].tone}>
              {STATUS[last.status].label}
            </PageStatus>
          </SettingsRow>
        )}
        <SettingsRow
          label="Slack"
          className="max-sm:flex-row max-sm:items-center"
          description={
            prefs.slackConfigured ? (
              "SLA and platform alerts post to your team's Slack channel. Direct messages need a Slack app, which isn't connected."
            ) : (
              <>
                Not connected. An admin can post alerts to a Slack channel with{" "}
                <Code>ALERT_SLACK_WEBHOOK_URL</Code>.
              </>
            )
          }
        >
          <PageStatus tone={prefs.slackConfigured ? "success" : "neutral"}>
            {prefs.slackConfigured ? "Team channel" : "Off"}
          </PageStatus>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
