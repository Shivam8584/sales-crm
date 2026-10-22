"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { DetailSection } from "@/components/record/detail";
import { Evidence } from "@/features/enrichment/evidence";
import { factLabel } from "@/features/enrichment/labels";
import { SourceNote } from "@/features/enrichment/source-badge";
import { Suggestions, type Fact } from "@/features/enrichment/suggestions";
import { formatPhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";

type Subject = { accountId: Id<"accounts"> } | { personId: Id<"people"> };

const show = (field: string, value: string) =>
  field === "phone" ? formatPhone(value) : value;

/** What the research agent found on a record and when it will look again; hidden while the agent is off. */
export default function AgentSection({
  subject,
  className,
}: {
  subject: Subject;
  className?: string;
}) {
  const data = useQuery(api.research.forRecord, { subject });
  const requestNow = useMutation(api.research.requestNow);
  const undoFill = useMutation(api.research.undoFill);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const { task } = data;

  async function check() {
    setBusy(true);
    try {
      await requestNow({ subject });
    } catch (error) {
      toast(readError(error, "Couldn't start the check").message, {
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  async function undo(fact: Fact) {
    try {
      await undoFill({ factId: fact._id });
      toast(`${factLabel(fact.field)} cleared`);
    } catch (error) {
      toast(readError(error, "Couldn't undo that").message, { tone: "danger" });
    }
  }

  const status = !task
    ? "Not checked yet"
    : task.running
      ? "Checking now"
      : task.due
        ? "Due for a check"
        : `Checking again ${relativeTime(task.dueAt)}${task.note ? `: ${task.note}` : ""}`;

  return (
    <DetailSection
      collapsible
      defaultOpen={false}
      title="Research agent"
      className={className}
    >
      <div className="flex flex-col gap-3">
        {task?.summary && (
          <p className="text-sm leading-snug">{task.summary}</p>
        )}
        <p className="caption-style text-fg-tertiary" aria-live="polite">
          {status}
          {task?.lastRunAt
            ? ` · Last checked ${relativeTime(task.lastRunAt)}`
            : ""}
        </p>
        {data.filled.length > 0 && (
          <ul
            aria-label="Filled in automatically"
            className="divide-border flex flex-col divide-y"
          >
            {data.filled.map((fact) => (
              <li
                key={fact._id}
                className="flex flex-col gap-1 py-2 first:pt-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="caption-style text-fg-tertiary">
                      {factLabel(fact.field)} filled in
                    </span>
                    <span className="text-sm break-words">
                      {show(fact.field, fact.value)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void undo(fact)}
                    aria-label={`Undo ${factLabel(fact.field)} ${fact.value}`}
                  >
                    Undo
                  </Button>
                </div>
                <SourceNote source={fact.source} confidence={fact.confidence} />
                <Evidence evidence={fact.evidence} />
              </li>
            ))}
          </ul>
        )}
        {"personId" in subject && (
          <Suggestions
            facts={data.review}
            currentValue={(field) => data.current[field]}
            display={show}
          />
        )}
        <div>
          <Button
            variant="secondary"
            size="xs"
            loading={busy}
            disabled={task?.running}
            onClick={() => void check()}
          >
            Research now
          </Button>
        </div>
      </div>
    </DetailSection>
  );
}
