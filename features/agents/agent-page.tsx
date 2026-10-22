"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/_ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import EmptyState from "@/components/_ui/empty-state";
import { Input } from "@/components/_ui/input";
import Skeleton from "@/components/_ui/skeleton";
import { Switch } from "@/components/_ui/switch";
import { Textarea } from "@/components/_ui/textarea";
import OptionPicker from "@/components/fields/option-picker";
import {
  Page,
  PageActions,
  PageHeader,
  PageStatus,
} from "@/components/shell/page";
import { SettingsRow, SettingsSection } from "@/features/settings/settings-ui";
import {
  CAPS,
  LIMITS,
  MAX_INSTRUCTION,
  MAX_NAME,
  describeTrigger,
  type AgentScope,
  type AgentTrigger,
} from "@/lib/domain/agents";
import { readError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { toast } from "@/stores/toast-store";
import TrashIcon from "@/public/assets/icons/trash.svg";
import { SCOPE_OPTIONS } from "./new-agent-dialog";
import RunList from "./run-log";
import TriggerPicker from "./trigger-picker";

const PICKER = "bg-well h-9 px-3";

export default function AgentPage({ id }: { id: Id<"agents"> }) {
  const router = useRouter();
  const status = useQuery(api.agents.status, {});
  const agent = useQuery(api.agents.get, { id });
  const runs = useQuery(api.agents.runs, { agentId: id });
  const update = useMutation(api.agents.update);
  const runNow = useMutation(api.agents.runNow);
  const remove = useMutation(api.agents.remove);
  const [openId, setOpenId] = useState<Id<"agentRuns"> | null>(null);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (agent === undefined || status === undefined) return <PageSkeleton />;
  if (agent === null) {
    return (
      <Page>
        <PageHeader
          title="Agent"
          crumbs={[{ label: "Agents", href: routes.agents }]}
        />
        <div className="px-(--page-x)">
          <EmptyState
            title="This agent doesn't exist"
            description="It may have been deleted."
            action={
              <Button variant="secondary" size="sm" href={routes.agents}>
                Back to agents
              </Button>
            }
          />
        </div>
      </Page>
    );
  }

  const canRun = status.ai && status.enabled;

  async function save(
    patch: Parameters<typeof update>[0]["patch"],
    done?: string,
  ) {
    try {
      await update({ id, patch });
      if (done) toast(done);
    } catch (error) {
      toast(readError(error, "Couldn't save that").message, { tone: "danger" });
    }
  }

  async function start(preview: boolean) {
    setStarting(true);
    try {
      setOpenId(await runNow({ id, preview }));
    } catch (error) {
      toast(readError(error, "Couldn't start the run").message, {
        tone: "danger",
      });
    } finally {
      setStarting(false);
    }
  }

  async function destroy() {
    try {
      await remove({ id });
      router.push(routes.agents);
    } catch (error) {
      toast(readError(error, "Couldn't delete the agent").message, {
        tone: "danger",
      });
    }
  }

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: "Agents", href: routes.agents }]}
        title={agent.name}
        meta={
          <PageStatus tone={agent.enabled ? "success" : "neutral"}>
            {agent.enabled ? describeTrigger(agent.trigger) : "Off"}
          </PageStatus>
        }
        actions={
          <PageActions
            primary={
              <Button
                variant="primary"
                size="md"
                loading={starting}
                disabled={!canRun}
                onClick={() => void start(true)}
              >
                Preview
              </Button>
            }
            actions={[
              agent.allowChanges && {
                label: "Run now",
                disabled: !canRun,
                onSelect: () => void start(false),
              },
              {
                label: "Delete agent",
                icon: TrashIcon,
                tone: "danger",
                separated: agent.allowChanges,
                onSelect: () => setDeleting(true),
              },
            ]}
          />
        }
      />
      <div className="flex flex-col gap-10 px-(--page-x) pb-10">
        {!status.ai ? (
          <p className="text-warning text-sm">
            Agents are paused: there is no AI key on this server.
          </p>
        ) : !status.enabled ? (
          <p className="text-warning text-sm">
            An admin has switched all agents off.
          </p>
        ) : null}

        <SettingsSection title="Instruction">
          <InstructionEditor
            key={agent.instruction}
            value={agent.instruction}
            onSave={(instruction) => save({ instruction }, "Instruction saved")}
          />
        </SettingsSection>

        <SettingsSection title="Settings">
          <SettingsRow label="Runs">
            <TriggerPicker
              value={agent.trigger}
              onChange={(trigger: AgentTrigger) => void save({ trigger })}
              className={PICKER}
            />
          </SettingsRow>
          <SettingsRow
            label="Allow changes"
            htmlFor="agent-allow"
            description={
              agent.allowChanges
                ? "It can add notes, tasks and leads, log calls, move deals and add tags as you. Each change can be undone from its run. It never deletes, merges or emails."
                : "Off. Runs only list what they would do, so you can check the plan first."
            }
          >
            <Switch
              id="agent-allow"
              checked={agent.allowChanges}
              onCheckedChange={(allowChanges) =>
                void save(
                  { allowChanges },
                  allowChanges ? "Changes allowed" : "Changes off",
                )
              }
            />
          </SettingsRow>
          <SettingsRow
            label="On"
            htmlFor="agent-enabled"
            description="Turn it off to stop scheduled and event runs."
          >
            <Switch
              id="agent-enabled"
              checked={agent.enabled}
              onCheckedChange={(enabled) => void save({ enabled })}
            />
          </SettingsRow>
          <MoreOptions
            key={`${agent.name}-${agent.dailyRuns}`}
            agent={agent}
            canTeam={status.canTeam}
            onSave={save}
          />
        </SettingsSection>

        <SettingsSection
          title="Runs"
          description={`Each run takes up to ${CAPS.steps} steps and ${CAPS.toolCalls} tool calls.`}
        >
          {runs === undefined ? (
            <div
              aria-hidden
              className="border-border flex flex-col gap-3 border-t py-4"
            >
              <Skeleton className="h-3 w-64 max-w-full" />
              <Skeleton className="h-3 w-40" />
            </div>
          ) : runs.length === 0 ? (
            <p className="border-border text-fg-secondary border-t py-4 text-sm">
              No runs yet. Preview it to see what it would do.
            </p>
          ) : (
            <RunList runs={runs} openId={openId} onOpen={setOpenId} />
          )}
        </SettingsSection>
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="max-w-100">
          <DialogHeader>
            <DialogTitle>Delete {agent.name}?</DialogTitle>
            <DialogDescription>
              Its run history goes too. Changes it already made stay, and can
              still be undone from Profile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="primary" size="sm" onClick={() => void destroy()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function InstructionEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  const dirty = text.trim() !== value && text.trim() !== "";

  return (
    <div className="border-border flex flex-col gap-3 border-t py-4">
      <Textarea
        aria-label="Instruction"
        rows={3}
        maxLength={MAX_INSTRUCTION}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {dirty && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(text);
              setSaving(false);
            }}
          >
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setText(value)}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}

function MoreOptions({
  agent,
  canTeam,
  onSave,
}: {
  agent: NonNullable<ReturnType<typeof useQuery<typeof api.agents.get>>>;
  canTeam: boolean;
  onSave: (patch: {
    name?: string;
    dailyRuns?: number;
    scope?: AgentScope;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(agent.name);
  const [runs, setRuns] = useState(String(agent.dailyRuns));
  const { min, max } = LIMITS.dailyRuns;
  const runsValid =
    Number.isInteger(Number(runs)) &&
    Number(runs) >= min &&
    Number(runs) <= max;

  return (
    <Collapsible className="group/collapsible border-border flex flex-col border-t py-3">
      <CollapsibleTrigger className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-fast -mx-1 flex w-fit cursor-pointer items-center gap-1.5 rounded-sm px-1 py-1 transition-colors outline-none focus-visible:ring-2">
        More options
        <CollapsibleChevron />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SettingsRow label="Name" htmlFor="agent-name" className="border-t-0">
          <Input
            id="agent-name"
            maxLength={MAX_NAME}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => name.trim() !== agent.name && void onSave({ name })}
            className="w-56"
          />
        </SettingsRow>
        <SettingsRow
          label="Runs per day"
          htmlFor="agent-daily"
          description={
            runsValid
              ? "Stops for the day at this many."
              : `Enter ${min} to ${max}.`
          }
        >
          <Input
            id="agent-daily"
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={runs}
            onChange={(event) => setRuns(event.target.value)}
            onBlur={() =>
              runsValid &&
              Number(runs) !== agent.dailyRuns &&
              void onSave({ dailyRuns: Number(runs) })
            }
            aria-invalid={runsValid ? undefined : true}
            className="w-24 [appearance:textfield] tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
          />
        </SettingsRow>
        {canTeam && (
          <SettingsRow label="Works on">
            <OptionPicker
              label="Works on"
              value={agent.scope}
              options={SCOPE_OPTIONS}
              onChange={(next) =>
                void onSave({ scope: (next ?? "own") as AgentScope })
              }
              className={PICKER}
            />
          </SettingsRow>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function PageSkeleton() {
  return (
    <Page>
      <PageHeader
        title="Agent"
        crumbs={[{ label: "Agents", href: routes.agents }]}
      />
      <div aria-hidden className="flex flex-col gap-4 px-(--page-x)">
        <Skeleton className="h-20 w-full max-w-2xl" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-3 w-48" />
      </div>
    </Page>
  );
}
