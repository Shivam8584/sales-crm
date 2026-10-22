"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { PageStatus } from "@/components/shell/page";
import { PLATFORM_EVENTS } from "@/lib/domain/platform";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import BellIcon from "@/public/assets/icons/bell.svg";
import CalendarIcon from "@/public/assets/icons/calendar.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import MailIcon from "@/public/assets/icons/mail.svg";
import DemoFormCard from "./demo-form-card";
import PlatformSyncCard from "./platform-sync-card";
import {
  AdminOnly,
  Code,
  ConfiguredTag,
  CopyField,
  IconTile,
  IntegrationCard,
  SettingsBlock,
  SettingsIntro,
  SettingsRow,
  SettingsSkeleton,
  type Health,
} from "./settings-ui";

type Status = FunctionReturnType<typeof api.settings.integrations>;
type WaitingEvent = Status["platform"]["waiting"][number];

const CALCOM_LINK = process.env.NEXT_PUBLIC_CALCOM_LINK?.trim();

/** /settings/integrations: connection status for every system that talks to the CRM. */
export default function IntegrationsSettings() {
  return (
    <AdminOnly>
      <SettingsIntro>
        Systems that send data to the CRM or receive it. Secrets live in the
        Convex deployment&apos;s environment and are never shown here.
      </SettingsIntro>
      <IntegrationList />
    </AdminOnly>
  );
}

function IntegrationList() {
  const status = useQuery(api.settings.integrations, {});
  if (!status) {
    return (
      <>
        <SettingsSkeleton rows={3} />
        <SettingsSkeleton />
        <SettingsSkeleton />
      </>
    );
  }
  return (
    <>
      <PlatformCard platform={status.platform} />
      <PlatformSyncCard />
      <KycCard kyc={status.kyc} />
      <AlertsCard alerts={status.alerts} />
      <CalcomCard calcom={status.calcom} />
      <EmailLogCard address={status.emailLog.address} />
      <DemoFormCard />
    </>
  );
}

function EnvHint({ children }: { children: ReactNode }) {
  return (
    <p className="caption-style border-border bg-overlay-1 text-fg-secondary border-t px-4 py-3.5 leading-relaxed sm:px-5">
      {children}
    </p>
  );
}

/** The logo artwork carries its own tile, so it is sized to line up with `IconTile`. */
function BrandTile() {
  return (
    <span className="flex size-10 shrink-0">
      <Logo
        aria-hidden
        className="-mx-[5px] -mt-[1.25px] h-[51.25px] w-[50px] max-w-none shrink-0 overflow-visible"
      />
    </span>
  );
}

function PlatformCard({ platform }: { platform: Status["platform"] }) {
  const retry = useMutation(api.settings.retryPlatformEvents);
  const [busy, setBusy] = useState<string | null>(null);
  const waitingCount = platform.parked + platform.pending;

  async function run(ids: Id<"platformEvents">[] | undefined, key: string) {
    setBusy(key);
    try {
      const counts = await retry(ids ? { ids } : {});
      if (ids?.length === 1) {
        toast(
          counts.processed
            ? "Event processed"
            : counts.pending
              ? "Still waiting for its organisation"
              : "Still parked. Check the error and retry once it's fixed.",
          { tone: counts.processed ? "success" : "warning" },
        );
        return;
      }
      const parts = [
        counts.processed && `${counts.processed} processed`,
        counts.pending &&
          `${counts.pending} still waiting for their organisation`,
        counts.parked && `${counts.parked} still parked`,
      ].filter(Boolean);
      toast(parts.length ? parts.join(", ") : "Nothing left to retry", {
        tone: counts.parked || counts.pending ? "warning" : "success",
      });
    } catch (error) {
      toast(readError(error, "Couldn't retry").message, { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <IntegrationCard
      visual={<BrandTile />}
      title="Hypedrive platform"
      description="Sign-ups, organisations, GST checks, top-ups and campaigns from the platform update leads and accounts as they happen."
      health={platform.secretSet ? "connected" : "off"}
    >
      {!platform.secretSet && (
        <EnvHint>
          Set <Code>PLATFORM_WEBHOOK_SECRET</Code> on the Convex deployment and
          share it with the platform team. Until then the endpoint rejects every
          event.
        </EnvHint>
      )}
      <SettingsBlock>
        <span className="lead-style font-medium">Endpoint</span>
        {platform.endpoint ? (
          <CopyField
            id="platform-endpoint"
            label="Platform webhook URL"
            value={platform.endpoint}
          />
        ) : (
          <span className="caption-style text-fg-tertiary">
            The deployment didn&apos;t report its site URL.
          </span>
        )}
        <span className="caption-style text-fg-tertiary leading-snug">
          POST the envelope{" "}
          <Code>{"{event_id, event, occurred_at, data}"}</Code> signed with{" "}
          <Code>X-Hypedrive-Signature: sha256=&lt;hex HMAC&gt;</Code>. The
          contract lives in <Code>lib/domain/platform.ts</Code>.
        </span>
      </SettingsBlock>
      <SettingsBlock>
        <span className="flex flex-col gap-1.5">
          <span className="lead-style font-medium">Events understood</span>
          <span className="caption-style text-fg-tertiary leading-snug">
            Payloads only gain fields; a breaking change gets a new event name.
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {PLATFORM_EVENTS.map((event) => (
            <Tag key={event} size="xs" className="font-mono text-[11px]">
              {event}
            </Tag>
          ))}
        </span>
      </SettingsBlock>
      <SettingsRow label="Last event received">
        {platform.lastReceivedAt ? (
          <Tooltip content={dateTime(platform.lastReceivedAt)}>
            <span
              tabIndex={0}
              className="lead-style text-fg-secondary rounded-sm"
            >
              {relativeTime(platform.lastReceivedAt)}
            </span>
          </Tooltip>
        ) : (
          <span className="lead-style text-fg-tertiary">None yet</span>
        )}
      </SettingsRow>
      <div className="border-border flex flex-col border-t">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="lead-style font-medium">Waiting events</span>
            <span className="caption-style text-fg-tertiary leading-snug">
              {waitingCount === 0
                ? "Every event received has been processed."
                : `${platform.parked} parked with an error, ${platform.pending} waiting for their organisation${platform.capped ? " (in the latest 2,000 events)" : ""}.`}
            </span>
          </div>
          {waitingCount > 0 && (
            <Button
              variant="secondary"
              size="xs"
              loading={busy === "all"}
              disabled={busy !== null}
              onClick={() => void run(undefined, "all")}
            >
              Retry all
            </Button>
          )}
        </div>
        {platform.waiting.length > 0 && (
          <WaitingTable
            events={platform.waiting}
            busy={busy}
            onRetry={(event) => void run([event._id], event._id)}
          />
        )}
      </div>
    </IntegrationCard>
  );
}

const EVENT_TONE = { parked: "danger", pending: "warning" } as const;

function WaitingTable({
  events,
  busy,
  onRetry,
}: {
  events: WaitingEvent[];
  busy: string | null;
  onRetry: (event: WaitingEvent) => void;
}) {
  return (
    <ul aria-label="Waiting platform events" className="flex flex-col">
      {events.map((event) => {
        const status = event.status === "parked" ? "parked" : "pending";
        return (
          <li
            key={event._id}
            className="border-border flex min-h-10.5 items-center gap-3 border-t px-4 py-2 sm:px-5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="lead-style truncate font-mono text-xs">
                  {event.type}
                </span>
                <PageStatus tone={EVENT_TONE[status]}>
                  {status === "parked" ? "Parked" : "Waiting"}
                </PageStatus>
              </span>
              <span
                className="caption-style text-fg-tertiary truncate"
                title={event.error ?? undefined}
              >
                {event.error ??
                  (event.orgId
                    ? `Organisation ${event.orgId} isn't known yet`
                    : "Waiting")}
              </span>
            </div>
            <Tooltip content={`Received ${dateTime(event.receivedAt)}`}>
              <span
                tabIndex={0}
                className="caption-style text-fg-tertiary shrink-0 rounded-sm max-sm:hidden"
              >
                {relativeTime(event.receivedAt)}
              </span>
            </Tooltip>
            <Button
              variant="secondary"
              size="xs"
              loading={busy === event._id}
              disabled={busy !== null}
              onClick={() => onRetry(event)}
              aria-label={`Retry ${event.type} event ${event.eventId}`}
            >
              Retry
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function KycCard({ kyc }: { kyc: Status["kyc"] }) {
  const health: Health =
    kyc.mode === "live"
      ? "connected"
      : kyc.mode === "sandbox"
        ? "sandbox"
        : "off";
  return (
    <IntegrationCard
      visual={<IconTile icon={CheckCircleIcon} />}
      title="GST and DIN verification"
      description="Looks up GSTINs and director numbers through the KYC service and fills verified details on accounts and people."
      health={health}
    >
      {kyc.mode === "sandbox" && (
        <EnvHint>
          <Code>ENRICHMENT_SANDBOX=1</Code> returns fixed test data instead of
          calling the registry. Turn it off in production.
        </EnvHint>
      )}
      {kyc.mode === null && (
        <EnvHint>
          Set <Code>KYC_BASE_URL</Code> and <Code>KYC_API_TOKEN</Code> on the
          Convex deployment, or <Code>ENRICHMENT_SANDBOX=1</Code> for local test
          data. Until then lookups are switched off.
        </EnvHint>
      )}
      <SettingsRow
        label="Provider"
        description="The registry lookups go through kyc-service."
      >
        <ConfiguredTag
          on={kyc.mode !== null}
          label={
            kyc.mode === "live"
              ? "kyc-service"
              : kyc.mode === "sandbox"
                ? "Sandbox data"
                : "Off"
          }
        />
      </SettingsRow>
      <SettingsRow
        label="Response signatures"
        description={
          <>
            With <Code>KYC_HMAC_SECRET</Code> set, unsigned or tampered
            responses are discarded.
          </>
        }
      >
        <ConfiguredTag
          on={kyc.signatureCheck}
          label={kyc.signatureCheck ? "Checked" : "Not checked"}
        />
      </SettingsRow>
    </IntegrationCard>
  );
}

function AlertsCard({ alerts }: { alerts: Status["alerts"] }) {
  return (
    <IntegrationCard
      visual={<IconTile icon={BellIcon} />}
      title="Lead alerts"
      description="New leads, demo bookings and missed SLAs are posted to Slack and to a webhook of your choice."
      health={alerts.slack || alerts.webhook ? "connected" : "off"}
    >
      {!alerts.slack && !alerts.webhook && (
        <EnvHint>
          Set <Code>ALERT_SLACK_WEBHOOK_URL</Code> (a Slack incoming webhook) or{" "}
          <Code>ALERT_WEBHOOK_URL</Code> (any JSON endpoint) on the Convex
          deployment. In-app notifications work either way.
        </EnvHint>
      )}
      <SettingsRow
        label="Slack"
        description={<Code>ALERT_SLACK_WEBHOOK_URL</Code>}
      >
        <ConfiguredTag on={alerts.slack} />
      </SettingsRow>
      <SettingsRow label="Webhook" description={<Code>ALERT_WEBHOOK_URL</Code>}>
        <ConfiguredTag on={alerts.webhook} />
      </SettingsRow>
    </IntegrationCard>
  );
}

function EmailLogCard({ address }: { address: string }) {
  return (
    <IntegrationCard
      visual={<IconTile icon={MailIcon} />}
      title="Log emails to the CRM"
      description="BCC this address on emails to customers, or forward them to it. Only works from your own CRM email address."
    >
      <SettingsBlock>
        <CopyField id="email-log-address" label="BCC address" value={address} />
      </SettingsBlock>
    </IntegrationCard>
  );
}

function CalcomCard({ calcom }: { calcom: Status["calcom"] }) {
  const linkSet = Boolean(CALCOM_LINK);
  const health: Health =
    calcom.secretSet && linkSet
      ? "connected"
      : calcom.secretSet || linkSet
        ? "partial"
        : "off";
  return (
    <IntegrationCard
      visual={<IconTile icon={CalendarIcon} />}
      title="Cal.com"
      description="After the demo form, people pick a slot on your booking page. Bookings, reschedules and cancellations come back to the lead."
      health={health}
    >
      <SettingsBlock>
        <span className="lead-style font-medium">Webhook URL</span>
        {calcom.endpoint ? (
          <CopyField
            id="calcom-endpoint"
            label="Cal.com webhook URL"
            value={calcom.endpoint}
          />
        ) : (
          <span className="caption-style text-fg-tertiary">
            The deployment didn&apos;t report its site URL.
          </span>
        )}
        <span className="caption-style text-fg-tertiary leading-snug">
          In Cal.com, add a webhook for booking created, rescheduled and
          cancelled, with the same secret as <Code>CALCOM_WEBHOOK_SECRET</Code>.
        </span>
      </SettingsBlock>
      <SettingsRow
        label="Webhook secret"
        description={<Code>CALCOM_WEBHOOK_SECRET</Code>}
      >
        <ConfiguredTag on={calcom.secretSet} />
      </SettingsRow>
      <SettingsRow
        label="Booking link"
        description={
          <>
            <Code>NEXT_PUBLIC_CALCOM_LINK</Code>, set when the app is built.
            Without it the form ends by promising a call back.
          </>
        }
      >
        {CALCOM_LINK ? (
          <span
            className="lead-style text-fg-secondary truncate sm:max-w-56"
            title={CALCOM_LINK}
          >
            {CALCOM_LINK}
          </span>
        ) : (
          <ConfiguredTag on={false} />
        )}
      </SettingsRow>
    </IntegrationCard>
  );
}
