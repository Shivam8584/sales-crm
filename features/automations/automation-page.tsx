"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import InlineText from "@/components/fields/inline-text";
import { useCommandActions } from "@/components/shell/command-actions";
import {
  Page,
  PageActions,
  PageHeader,
  PageToolbar,
  PageViews,
} from "@/components/shell/page";
import { useViewer } from "@/hooks/use-viewer";
import { useUrlState } from "@/hooks/use-url-state";
import {
  AUTOMATION_STATUS_LABEL,
  validateAutomation,
  type AutomationSettings,
  type GraphNode,
  type Issue,
  type NameLookup,
  type SubjectKind,
  type Trigger,
} from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import PlayIcon from "@/public/assets/icons/automations/play.svg";
import { describeStep } from "./describe";
import Canvas from "./editor/canvas";
import {
  EditorContext,
  type AutomationDoc,
  type EditorContextValue,
} from "./editor/editor-context";
import { useEditorStore } from "./editor/editor-store";
import NodePanel from "./editor/node-panel";
import TestRunDialog from "./editor/test-run-dialog";
import { stopTestRun } from "./editor/test-run";
import { STATUS_TONE } from "./node-meta";
import { StoppedStatus } from "./automation-parts";
import SequenceView from "./sequence-view";
import AutomationAnalytics from "./automation-analytics";
import AutomationRuns from "./automation-runs";

const CRUMBS = [{ label: "Sequences", href: "/automations" }];
const SAVE_DELAY = 600;
const RULE_FIELDS = new Set([
  "goal",
  "dailyCap",
  "conditions",
  "purpose",
  "event",
  "leadKinds",
  "leadSources",
  "leadStatuses",
  "dealStages",
  "accountStages",
  "eventTypes",
  "campaignStatuses",
  "pauseReasons",
  "ruleIds",
]);

export default function AutomationPage({ id }: { id: Id<"automations"> }) {
  const viewer = useViewer();
  const automation = useQuery(api.automations.get, { id });
  if (automation === undefined) return <EditorSkeleton />;
  if (automation === null) {
    return (
      <Page>
        <PageHeader crumbs={CRUMBS} title="Not found" />
        <EmptyState
          icon={AutomationIcon}
          title="This sequence doesn't exist"
          description="It may have been deleted, or the link is wrong."
          action={
            <Button variant="secondary" size="sm" href="/automations">
              Back to sequences
            </Button>
          }
        />
      </Page>
    );
  }
  if (viewer.role === "rep") return <SequenceView automation={automation} />;
  return <Editor key={id} automation={automation} />;
}

function EditorSkeleton() {
  return (
    <Page>
      <PageHeader crumbs={CRUMBS} title={<Skeleton className="h-4 w-48" />} />
      <div className="flex flex-1 items-start justify-center pt-24">
        <div className="flex w-80 flex-col items-center gap-16">
          <Skeleton className="h-26 w-80 rounded-xl" />
          <Skeleton className="h-26 w-80 rounded-xl" />
        </div>
      </div>
    </Page>
  );
}

function Editor({ automation }: { automation: AutomationDoc }) {
  const router = useRouter();
  const id = automation._id as Id<"automations">;
  const catalog = useQuery(api.automations.catalog, {});
  const nodeStats = useQuery(api.automations.nodeStats, { id });
  const update = useMutation(api.automations.update);
  const activate = useMutation(api.automations.activate);
  const pause = useMutation(api.automations.pause);
  const duplicate = useMutation(api.automations.duplicate);
  const remove = useMutation(api.automations.remove);
  const restore = useMutation(api.automations.restore);

  const [view, setView] = useUrlState("view", "editor");
  const [testing, setTesting] = useState(false);
  const [savedRevision, setSavedRevision] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const nodes = useEditorStore((state) => state.nodes);
  const edges = useEditorStore((state) => state.edges);
  const revision = useEditorStore((state) => state.revision);
  const loadedFor = useEditorStore((state) => state.automationId);

  useEffect(() => {
    if (useEditorStore.getState().automationId !== id) {
      useEditorStore.getState().load(id, automation.graph);
    }
    return () => stopTestRun();
    // Load once per automation; later server copies are our own saves echoing back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const pending = useRef<Promise<unknown> | null>(null);
  const persist = useCallback(async () => {
    const { nodes, edges, automationId, revision } = useEditorStore.getState();
    if (automationId !== id) return;
    const promise = update({ id, patch: { graph: { nodes, edges } } });
    pending.current = promise;
    try {
      await promise;
      setSaveFailed(false);
      setSavedRevision((current) => Math.max(current, revision));
    } catch (error) {
      setSaveFailed(true);
      toast(readError(error, "Couldn't save the automation").message, {
        tone: "danger",
      });
    }
  }, [id, update]);

  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (revision === 0) return;
    saveTimer.current = window.setTimeout(() => void persist(), SAVE_DELAY);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [revision, persist]);

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (useEditorStore.getState().revision > 0) await persist();
    }
    await pending.current;
  }, [persist]);

  const names: NameLookup = useMemo(() => {
    const members = new Map(
      (catalog?.members ?? []).map((member) => [
        member._id as string,
        member.name,
      ]),
    );
    const automations = new Map(
      (catalog?.automations ?? []).map((item) => [
        item._id as string,
        item.name,
      ]),
    );
    const rules = new Map(
      (catalog?.stallRules ?? []).map((rule) => [rule.id, rule.label]),
    );
    return {
      member: (key) => members.get(key),
      automation: (key) => automations.get(key),
      rule: (key) => rules.get(key),
    };
  }, [catalog]);

  const graph = useMemo(
    () => (loadedFor === id ? { nodes, edges } : automation.graph),
    [loadedFor, id, nodes, edges, automation.graph],
  );
  const issues: Issue[] = useMemo(
    () =>
      validateAutomation(
        {
          subjectKind: automation.subjectKind,
          trigger: automation.trigger,
          graph,
          settings: automation.settings,
        },
        catalog
          ? {
              memberIds: catalog.members.map((member) => member._id),
              automationIds: catalog.automations.map((item) => item._id),
              ruleIds: catalog.stallRules.map((rule) => rule.id),
              selfId: id,
            }
          : {},
      ),
    [
      automation.subjectKind,
      automation.trigger,
      automation.settings,
      graph,
      catalog,
      id,
    ],
  );
  const issuesByNode = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const issue of issues) {
      const key =
        issue.nodeId ?? graph.nodes.find((node) => node.kind === "trigger")?.id;
      if (key) (out[key] ??= []).push(issue.message);
    }
    return out;
  }, [issues, graph.nodes]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(nodeStats ?? {}).map(([key, value]) => [
          key,
          {
            reached: value.reached,
            passed: value.passed,
            current: value.current,
          },
        ]),
      ),
    [nodeStats],
  );
  const describe = useCallback(
    (node: GraphNode) =>
      describeStep(node, automation.trigger, automation.subjectKind, names),
    [automation.trigger, automation.subjectKind, names],
  );

  const patch = useCallback(
    async (fields: {
      trigger?: Trigger;
      settings?: AutomationSettings;
      subjectKind?: SubjectKind;
      name?: string;
      description?: string;
    }) => {
      try {
        await update({ id, patch: fields });
      } catch (error) {
        toast(readError(error).message, { tone: "danger" });
      }
    },
    [id, update],
  );

  const context: EditorContextValue = {
    automation,
    catalog,
    names,
    readOnly: false,
    nodeStats,
    setTrigger: (trigger) => void patch({ trigger }),
    setSettings: (settings) => void patch({ settings }),
    setSubjectKind: (subjectKind) => void patch({ subjectKind }),
    startTestRun: () => setTesting(true),
  };

  const openIssue = (issue: Issue | undefined) => {
    const nodeId =
      issue?.nodeId ?? graph.nodes.find((node) => node.kind === "trigger")?.id;
    if (!nodeId) return;
    setView("editor");
    const state = useEditorStore.getState();
    const field = issue?.field?.split(".")[0];
    state.openInspector(
      nodeId,
      field && RULE_FIELDS.has(field) ? "rules" : "build",
    );
    state.request("focus", nodeId);
  };

  async function onActivate() {
    if (issues.length) {
      toast(
        issues.length === 1
          ? issues[0].message
          : `Fix ${issues.length} problems before activating`,
        { tone: "warning" },
      );
      openIssue(issues[0]);
      return;
    }
    setBusy(true);
    try {
      await flush();
      const result = await activate({ id });
      const resumed = result.resumed
        ? ` · ${result.resumed} held ${result.resumed === 1 ? "run" : "runs"} resumed`
        : "";
      toast(`${automation.name} is live · version ${result.version}${resumed}`);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function onPause() {
    try {
      await pause({ id });
      toast(
        `${automation.name} paused. Runs hold where they are.`,
        () => void activate({ id }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function onDuplicate() {
    try {
      await flush();
      const copy = await duplicate({ id });
      router.push(`/automations/${copy}`);
      toast("Duplicated as a draft");
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function onDelete() {
    try {
      await flush();
      const { ended } = await remove({ id });
      router.push("/automations");
      toast(
        `${automation.name} deleted${ended ? ` · ${ended} live ${ended === 1 ? "run" : "runs"} ended` : ""}`,
        () => void restore({ id }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  const active = automation.status === "active";
  const changed = active && automation.hasChanges;

  useCommandActions([
    {
      id: "automation-test",
      label: "Test run",
      perform: () => setTesting(true),
      icon: PlayIcon,
    },
    active
      ? {
          id: "automation-pause",
          label: "Pause sequence",
          perform: () => void onPause(),
        }
      : {
          id: "automation-activate",
          label: "Activate sequence",
          perform: () => void onActivate(),
        },
  ]);

  const primary =
    active && !changed ? (
      <Button
        variant="secondary"
        size="sm"
        className="h-control-md py-0"
        onClick={() => void onPause()}
      >
        Pause
      </Button>
    ) : (
      <Tooltip
        content={
          issues.length
            ? `${issues.length} to fix first`
            : changed
              ? `Publish as version ${automation.version + 1}`
              : "Start enrolling"
        }
      >
        <Button
          variant="primary"
          size="sm"
          className="h-control-md py-0"
          loading={busy}
          onClick={() => void onActivate()}
        >
          {changed ? "Publish changes" : "Activate"}
        </Button>
      </Tooltip>
    );

  const saveLabel = saveFailed
    ? "Not saved"
    : revision > savedRevision
      ? "Saving…"
      : `Saved ${relativeTime(automation.updatedAt)}`;
  const stats = automation.stats;

  return (
    <EditorContext.Provider value={context}>
      <Page className="min-h-0">
        <PageHeader
          crumbs={CRUMBS}
          title={automation.name}
          meta={
            <>
              <Tag tone={STATUS_TONE[automation.status]} size="xs">
                {AUTOMATION_STATUS_LABEL[automation.status]}
                {automation.version > 0 && (
                  <span className="opacity-70">v{automation.version}</span>
                )}
              </Tag>
              {changed && (
                <Tag tone="amber" size="xs">
                  Unpublished changes
                </Tag>
              )}
              <StoppedStatus />
            </>
          }
          actions={
            <>
              <Tooltip content="Dry-run on a record">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-control-md max-sm:w-control-md py-0 max-sm:px-0"
                  onClick={() => setTesting(true)}
                  aria-label="Test run"
                >
                  <PlayIcon aria-hidden className="size-3.5" />
                  <span className="max-sm:sr-only">Test run</span>
                </Button>
              </Tooltip>
              <PageActions
                label="Automation actions"
                primary={primary}
                primaryItem={{
                  label:
                    active && !changed
                      ? "Pause"
                      : changed
                        ? "Publish changes"
                        : "Activate",
                  onSelect: () =>
                    void (active && !changed ? onPause() : onActivate()),
                }}
                actions={[
                  changed && {
                    label: "Pause",
                    onSelect: () => void onPause(),
                  },
                  {
                    label: "Duplicate",
                    onSelect: () => void onDuplicate(),
                  },
                  {
                    label: "Delete",
                    icon: TrashIcon,
                    tone: "danger",
                    separated: true,
                    onSelect: () => void onDelete(),
                  },
                ]}
              />
            </>
          }
        />
        <PageViews
          value={view === "runs" || view === "analytics" ? view : "editor"}
          onChange={setView}
          views={[
            { id: "editor", label: "Editor" },
            { id: "runs", label: "Runs", count: stats.enrolled },
            { id: "analytics", label: "Analytics" },
          ]}
        />
        <PageToolbar
          actions={
            saveLabel && (
              <span
                className="caption-style text-fg-tertiary max-sm:hidden"
                aria-live="polite"
              >
                {saveLabel}
              </span>
            )
          }
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <InlineText
              label="Description"
              value={automation.description || null}
              placeholder="Add a description"
              className="max-w-xl min-w-0 flex-1 text-sm"
              onSave={async (description) => {
                try {
                  await update({ id, patch: { description } });
                } catch (error) {
                  return readError(error).message;
                }
              }}
            />
          </div>
          <dl className="flex shrink-0 items-center gap-3 text-xs max-md:hidden">
            {(
              [
                ["Enrolled", stats.enrolled],
                ["Active", stats.active],
                ["Completed", stats.completed],
                ["Exited", stats.exited + stats.failed],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-1">
                <dt className="text-fg-tertiary">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {issues.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="text-warning shrink-0"
              onClick={() => openIssue(issues[0])}
            >
              <AlertIcon aria-hidden className="size-3.5" />
              {issues.length} to fix
            </Button>
          )}
        </PageToolbar>

        {view === "analytics" ? (
          <AutomationAnalytics id={id} />
        ) : view === "runs" ? (
          <AutomationRuns
            id={id}
            graph={automation.graph}
            trigger={automation.trigger}
            subjectKind={automation.subjectKind}
            names={names}
          />
        ) : (
          <Canvas
            subjectKind={automation.subjectKind}
            readOnly={false}
            describe={describe}
            issues={issuesByNode}
            counts={counts}
          >
            <NodePanel issues={issues} />
          </Canvas>
        )}
      </Page>
      <TestRunDialog
        automationId={id}
        subjectKind={automation.subjectKind}
        open={testing}
        onOpenChange={setTesting}
        onResult={() => setView("editor")}
      />
    </EditorContext.Provider>
  );
}
