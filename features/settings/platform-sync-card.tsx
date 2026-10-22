"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Tooltip from "@/components/_ui/tooltip";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import {
  Code,
  IntegrationCard,
  SettingsRow,
  SettingsSkeleton,
  type Health,
} from "./settings-ui";
import { routes } from "@/lib/routes";

type Overview = FunctionReturnType<typeof api.account360.syncOverview>;
type Issue = Overview["failures"][number];

const MODE_LABEL = { live: "Live", sandbox: "Sandbox" } as const;

/** The nightly pull from the Hypedrive admin API: mode, last run, failures and a manual run. */
export default function PlatformSyncCard() {
  const overview = useQuery(api.account360.syncOverview, {});
  if (!overview) return <SettingsSkeleton rows={3} />;
  return <SyncCard overview={overview} />;
}

function SyncCard({ overview }: { overview: Overview }) {
  const runSync = useAction(api.account360.runSync);
  const [busy, setBusy] = useState(false);
  const health: Health =
    overview.mode === "live"
      ? overview.failures.length
        ? "partial"
        : "connected"
      : overview.mode === "sandbox"
        ? "sandbox"
        : "off";

  async function run() {
    setBusy(true);
    try {
      const result = await runSync({});
      if (result.skipped) {
        toast("Sync is off, so nothing ran", { tone: "warning" });
        return;
      }
      toast(
        result.failed
          ? `Synced ${result.synced}, ${result.failed} failed`
          : `Synced ${result.synced} ${result.synced === 1 ? "account" : "accounts"}`,
        { tone: result.failed ? "warning" : "success" },
      );
    } catch (error) {
      toast(readError(error, "Couldn't run the sync").message, {
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  const issues = [...overview.failures, ...overview.neverSynced];

  return (
    <IntegrationCard
      title="Platform sync"
      description="Reads balance, campaigns, deposits, listings, review backlog and team for every linked account from the Hypedrive admin API. Account health is scored from it."
      health={health}
      action={
        overview.mode && (
          <Button
            variant="secondary"
            size="xs"
            loading={busy}
            disabled={overview.linked === 0}
            onClick={() => void run()}
          >
            Run sync now
          </Button>
        )
      }
    >
      {overview.mode !== "live" && (
        <p className="caption-style border-border text-fg-tertiary border-t py-3.5 leading-relaxed">
          {overview.mode === "sandbox" ? (
            <>
              <Code>PLATFORM_SANDBOX=1</Code> answers from each org&apos;s own
              events instead of calling Hypedrive. Turn it off in production and
              set the live API credentials.
            </>
          ) : (
            overview.envHint
          )}
        </p>
      )}
      <SettingsRow label="Mode" description={overview.schedule}>
        <span
          className={cn(
            "lead-style",
            overview.mode === "sandbox"
              ? "text-warning"
              : overview.mode
                ? "text-fg-secondary"
                : "text-fg-tertiary",
          )}
        >
          {overview.mode ? MODE_LABEL[overview.mode] : "Off"}
        </span>
      </SettingsRow>
      <SettingsRow
        label="Last run"
        description={`${overview.synced} of ${overview.linked} linked ${overview.linked === 1 ? "account" : "accounts"} synced cleanly`}
      >
        {overview.lastRunAt ? (
          <Tooltip content={dateTime(overview.lastRunAt)}>
            <span
              tabIndex={0}
              className="lead-style text-fg-secondary relative rounded-sm pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5 pointer-coarse:after:content-['']"
            >
              {relativeTime(overview.lastRunAt)}
            </span>
          </Tooltip>
        ) : (
          <span className="lead-style text-fg-tertiary">Never</span>
        )}
      </SettingsRow>
      <div className="border-border flex flex-col border-t">
        <div className="flex flex-col gap-1.5 py-3.5">
          <span className="lead-style">Accounts needing attention</span>
          <span className="caption-style text-fg-tertiary leading-snug">
            {issues.length === 0
              ? "Every linked account synced on its last attempt."
              : `${overview.failures.length} failed on the last attempt, ${overview.neverSynced.length} never synced.`}
          </span>
        </div>
        {issues.length > 0 && (
          <ul
            aria-label="Accounts with sync problems"
            className="flex flex-col"
          >
            {issues.map((issue) => (
              <IssueRow key={issue.accountId} issue={issue} />
            ))}
          </ul>
        )}
      </div>
    </IntegrationCard>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <li className="border-border flex min-h-10.5 items-center gap-3 border-t py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <Link
            href={`${routes.account(issue.accountId)}?tab=platform`}
            className="lead-style focus-visible:ring-ring truncate rounded-sm outline-none hover:underline focus-visible:ring-2"
          >
            {issue.name}
          </Link>
          <span
            className={cn(
              "caption-style",
              issue.error ? "text-danger" : "text-fg-tertiary",
            )}
          >
            {issue.error ? "Failed" : "Never synced"}
          </span>
        </span>
        <span
          className="caption-style text-fg-tertiary truncate"
          title={issue.error ?? undefined}
        >
          {issue.error ?? issue.orgId}
        </span>
      </div>
      {issue.attemptedAt && (
        <Tooltip
          content={`Tried ${dateTime(issue.attemptedAt)}${issue.fetchedAt ? ` · data from ${dateTime(issue.fetchedAt)}` : ""}`}
        >
          <span
            tabIndex={0}
            className="caption-style text-fg-tertiary shrink-0 rounded-sm max-sm:hidden"
          >
            {relativeTime(issue.attemptedAt)}
          </span>
        </Tooltip>
      )}
    </li>
  );
}
