"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Page, PageHeader, PageViews } from "@/components/shell/page";
import { useUrlState } from "@/hooks/use-url-state";
import {
  NODE_LABEL,
  SUBJECT_LABEL,
  describeTrigger,
  stepOrder,
} from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { StatusTag, StoppedStatus } from "./automation-parts";
import AutomationRuns from "./automation-runs";
import { describeStep } from "./describe";
import type { AutomationDoc } from "./editor/editor-context";

const CRUMBS = [{ label: "Sequences", href: "/automations" }];

/** What a rep sees instead of the canvas: the steps in order, with start, pause and test. */
export default function SequenceView({
  automation,
}: {
  automation: AutomationDoc;
}) {
  const id = automation._id;
  const activate = useMutation(api.automations.activate);
  const pause = useMutation(api.automations.pause);
  const sendTest = useMutation(api.automations.sendTest);
  const [view, setView] = useUrlState("view", "steps");
  const [busy, setBusy] = useState(false);

  const active = automation.status === "active";
  const reason = active
    ? null
    : (automation.issues[0]?.message ?? automation.blocked);
  const steps = stepOrder(automation.graph).flatMap((nodeId) => {
    const node = automation.graph.nodes.find((item) => item.id === nodeId);
    return node && node.kind !== "trigger" ? [node] : [];
  });
  const hasEmail = steps.some((node) => node.kind === "send_email");

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      toast(await action());
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader
        crumbs={CRUMBS}
        title={automation.name}
        meta={
          <>
            <StatusTag status={automation.status} />
            <StoppedStatus />
          </>
        }
        actions={
          <>
            {hasEmail && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    async () =>
                      `Test email on its way to ${await sendTest({ id })}`,
                  )
                }
              >
                Email me a test
              </Button>
            )}
            {automation.mine && (
              <Button
                variant={active ? "secondary" : "primary"}
                size="sm"
                loading={busy}
                disabled={Boolean(reason)}
                onClick={() =>
                  void run(async () => {
                    if (active) {
                      await pause({ id });
                      return `${automation.name} paused`;
                    }
                    await activate({ id });
                    return `${automation.name} is live. Add ${SUBJECT_LABEL[automation.subjectKind][1]} with “Add to sequence”.`;
                  })
                }
              >
                {active ? "Pause" : "Activate"}
              </Button>
            )}
          </>
        }
      />
      <PageViews
        value={view === "runs" ? "runs" : "steps"}
        onChange={setView}
        views={[
          { id: "steps", label: "Steps" },
          { id: "runs", label: "Runs", count: automation.stats.enrolled },
        ]}
      />
      {view === "runs" ? (
        <AutomationRuns
          id={id}
          graph={automation.graph}
          trigger={automation.trigger}
          subjectKind={automation.subjectKind}
          names={{}}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
            <p className="caption-style text-fg-tertiary leading-snug">
              {automation.trigger.kind === "manual"
                ? `Runs on ${SUBJECT_LABEL[automation.subjectKind][1]} you add by hand.`
                : `Starts when: ${describeTrigger(automation.trigger).toLowerCase()}.`}{" "}
              {automation.description}
            </p>
            {reason && (
              <p role="status" className="caption-style text-warning">
                Can’t activate yet: {reason}
              </p>
            )}
            <ol className="bg-card shadow-card flex flex-col overflow-hidden rounded-xl">
              {steps.map((node, index) => {
                const { title, detail } = describeStep(
                  node,
                  automation.trigger,
                  automation.subjectKind,
                  {},
                );
                return (
                  <li
                    key={node.id}
                    className="border-border flex items-baseline gap-3 px-4 py-3 not-last:border-b"
                  >
                    <span className="caption-style text-fg-tertiary w-4 shrink-0 tabular-nums">
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm">{title}</span>
                      {node.kind !== "wait" && (
                        <span className="caption-style text-fg-tertiary">
                          {[NODE_LABEL[node.kind], detail]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </Page>
  );
}
