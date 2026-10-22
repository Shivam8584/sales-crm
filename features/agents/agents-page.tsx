"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import { Switch } from "@/components/_ui/switch";
import { Page, PageHeader } from "@/components/shell/page";
import { describeTrigger } from "@/lib/domain/agents";
import { readError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import NewAgentDialog from "./new-agent-dialog";
import RunStatus from "./run-status";

type Agent = FunctionReturnType<typeof api.agents.list>[number];

export default function AgentsPage() {
  const status = useQuery(api.agents.status, {});
  const agents = useQuery(api.agents.list, {});
  const [creating, setCreating] = useState(false);
  const ready = status?.ai === true;

  return (
    <Page>
      <PageHeader
        title="Agents"
        actions={
          ready && (
            <Button
              variant="primary"
              size="md"
              disabled={(agents?.length ?? 0) >= status.max}
              onClick={() => setCreating(true)}
            >
              New agent
            </Button>
          )
        }
      />
      <div className="px-(--page-x) pb-8">
        {status === undefined || agents === undefined ? (
          <ListSkeleton />
        ) : !status.ai ? (
          <EmptyState
            title="Agents need an AI key"
            description={
              status.canTeam
                ? "Add one under Integrations and agents appear here."
                : "Ask an admin to add one under Integrations."
            }
            action={
              status.canTeam && (
                <Button
                  variant="secondary"
                  size="sm"
                  href={routes.integrations}
                >
                  Open Integrations
                </Button>
              )
            }
          />
        ) : (
          <>
            {!status.enabled && (
              <p className="text-warning pb-3 text-sm">
                An admin has switched all agents off. Nothing runs until they
                turn them back on.
              </p>
            )}
            {agents.length === 0 ? (
              <EmptyState
                title="No agents yet"
                description="Write a job in a sentence, like “every Monday list my deals with no activity for 10 days and make a task for each”."
              />
            ) : (
              <ul className="border-border border-t">
                {agents.map((agent) => (
                  <AgentRow key={agent._id} agent={agent} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <NewAgentDialog
        open={creating}
        onOpenChange={setCreating}
        canTeam={status?.canTeam ?? false}
      />
    </Page>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const update = useMutation(api.agents.update);

  async function toggle(enabled: boolean) {
    try {
      await update({ id: agent._id, patch: { enabled } });
    } catch (error) {
      toast(readError(error, "Couldn't update the agent").message, {
        tone: "danger",
      });
    }
  }

  return (
    <li className="border-border flex items-center gap-4 border-b py-3.5">
      <Link
        href={routes.agent(agent._id)}
        className="focus-visible:ring-ring -m-1 flex min-w-0 flex-1 flex-col gap-1 rounded-md p-1 outline-none focus-visible:ring-2"
      >
        <span className="text-body truncate font-medium">{agent.name}</span>
        <span className="text-fg-secondary truncate text-sm">
          {describeTrigger(agent.trigger)}
          {agent.scope === "team" && " · whole team"}
          {!agent.allowChanges && " · preview only"}
        </span>
      </Link>
      {agent.lastStatus && agent.lastRunAt && (
        <span className="flex shrink-0 items-baseline gap-2 max-sm:hidden">
          <RunStatus status={agent.lastStatus} />
          <time className="text-fg-tertiary caption-style tabular-nums">
            {relativeTime(agent.lastRunAt)}
          </time>
        </span>
      )}
      <Switch
        checked={agent.enabled}
        onCheckedChange={(enabled) => void toggle(enabled)}
        aria-label={`${agent.name} on or off`}
      />
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="border-border border-t">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="border-border flex items-center gap-4 border-b py-3.5"
        >
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-48 max-w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      ))}
    </div>
  );
}
