"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import {
  AdminOnly,
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
  StatusText,
} from "./settings-ui";
import { routes } from "@/lib/routes";
import ResearchSettings from "@/features/research/research-settings";

type Overview = FunctionReturnType<typeof api.system.overview>;
type Table = "accounts" | "people" | "leads";

const TABLES: { table: Table; label: string }[] = [
  { table: "accounts", label: "Accounts" },
  { table: "people", label: "People" },
  { table: "leads", label: "Leads" },
];

/** /settings/system: is everything working, and what failed. */
export default function SystemSettings() {
  return (
    <AdminOnly>
      <SystemOverview />
    </AdminOnly>
  );
}

function SystemOverview() {
  const overview = useQuery(api.system.overview, {});
  if (!overview) {
    return (
      <>
        <SettingsSkeleton rows={4} />
        <SettingsSkeleton />
        <SettingsSkeleton rows={4} />
      </>
    );
  }
  return (
    <>
      <ServicesSection services={overview.services} />
      <ResearchSettings />
      <FailuresSection failures={overview.failures} />
      <DataSection members={overview.members} />
    </>
  );
}

function ModeTag({ mode }: { mode: "live" | "sandbox" | null }) {
  if (mode === "live") return <StatusText>Connected</StatusText>;
  if (mode === "sandbox")
    return <StatusText tone="warning">Sandbox</StatusText>;
  return <StatusText tone="muted">Not configured</StatusText>;
}

function ProviderRow({
  label,
  service,
}: {
  label: string;
  service: Overview["services"]["email"];
}) {
  return (
    <SettingsRow
      label={label}
      description={service.provider ?? service.problem ?? undefined}
    >
      <ModeTag mode={service.provider ? "live" : null} />
    </SettingsRow>
  );
}

function ServicesSection({ services }: { services: Overview["services"] }) {
  const { platformSync: sync, push } = services;
  return (
    <SettingsSection title="Services">
      <ProviderRow label="Email" service={services.email} />
      <ProviderRow label="WhatsApp" service={services.whatsapp} />
      <SettingsRow
        label="Push notifications"
        description={
          push.configured
            ? `${push.subscriptions} ${push.subscriptions === 1 ? "device" : "devices"} subscribed`
            : undefined
        }
      >
        <ModeTag mode={push.configured ? "live" : null} />
      </SettingsRow>
      <SettingsRow
        label="Platform sync"
        description={
          sync.failing > 0
            ? `${sync.failing} failing: ${sync.lastError}`
            : sync.lastFetchedAt
              ? `Last synced ${relativeTime(sync.lastFetchedAt)}`
              : undefined
        }
      >
        <ModeTag mode={sync.mode} />
      </SettingsRow>
      <SettingsRow label="GST and DIN verification">
        <ModeTag mode={services.enrichment} />
      </SettingsRow>
      <SettingsRow label="Product scraper">
        <ModeTag mode={services.scraper} />
      </SettingsRow>
      <SettingsRow
        label="AI"
        description={
          services.ai.configured
            ? `${services.ai.main}, ${services.ai.fast}`
            : "Add an OpenAI key under Integrations → Keys"
        }
      >
        <ModeTag mode={services.ai.configured ? "live" : null} />
      </SettingsRow>
    </SettingsSection>
  );
}

function FailuresSection({ failures }: { failures: Overview["failures"] }) {
  const items = [
    ...failures.messages.map((message) => ({
      id: message._id,
      title: `${message.automation} (${message.channel})`,
      error: message.error,
      at: message.at,
    })),
    ...failures.runs.map((run) => ({
      id: run._id,
      title: `Lookup via ${run.provider}`,
      error: run.error,
      at: run.at,
    })),
  ].sort((a, b) => b.at - a.at);
  const empty = items.length === 0 && failures.platformEvents === 0;

  return (
    <SettingsSection title="Failures in the last 7 days">
      {empty && (
        <p className="caption-style text-fg-tertiary border-border border-t py-3.5">
          Nothing failed in the last 7 days.
        </p>
      )}
      {failures.platformEvents > 0 && (
        <SettingsRow
          label="Platform events"
          description={`${failures.platformEvents} parked with an error.`}
        >
          <Button variant="secondary" size="xs" href={routes.integrations}>
            Review
          </Button>
        </SettingsRow>
      )}
      {items.length > 0 && (
        <ul aria-label="Recent failures" className="flex flex-col">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-border flex min-h-10.5 items-center gap-3 border-t py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="lead-style truncate">{item.title}</span>
                <span
                  className="caption-style text-fg-tertiary truncate"
                  title={item.error}
                >
                  {item.error}
                </span>
              </div>
              <Tooltip content={dateTime(item.at)}>
                <span
                  tabIndex={0}
                  className="caption-style text-fg-tertiary shrink-0 rounded-sm"
                >
                  {relativeTime(item.at)}
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function DataSection({ members }: { members: Overview["members"] }) {
  return (
    <SettingsSection
      title="Data"
      description="List counts come from a maintained counter. A mismatch means it drifted; rebuilding recounts it from the table."
    >
      <SettingsRow label="Members">
        <span className="lead-style text-fg-secondary">
          {members.active} active, {members.deactivated} deactivated
        </span>
      </SettingsRow>
      {TABLES.map(({ table, label }) => (
        <CountRow key={table} table={table} label={label} />
      ))}
    </SettingsSection>
  );
}

function CountRow({ table, label }: { table: Table; label: string }) {
  const check = useQuery(api.system.dataCheck, { table });
  const rebuild = useMutation(api.system.rebuildCounts);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await rebuild({ table });
      toast(`Recounting ${label.toLowerCase()}. This takes a moment.`);
    } catch (error) {
      toast(readError(error, "Couldn't start the rebuild").message, {
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsRow
      label={label}
      description={
        check
          ? `Counter ${check.aggregate.toLocaleString("en-IN")}, table ${typeof check.actual === "number" ? check.actual.toLocaleString("en-IN") : check.actual}`
          : undefined
      }
    >
      {check && (
        <StatusText tone={check.ok ? "neutral" : "danger"}>
          {check.ok ? "In sync" : "Mismatch"}
        </StatusText>
      )}
      <Button
        variant="ghost"
        size="xs"
        loading={busy}
        disabled={!check}
        onClick={() => void run()}
        aria-label={`Rebuild ${label.toLowerCase()} count`}
      >
        Rebuild
      </Button>
    </SettingsRow>
  );
}
