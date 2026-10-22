"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import type { RecordTab } from "@/components/record/record-tabs";
import { AskField } from "@/features/ai/ask-record";
import { useAiEnabled } from "@/features/ai/use-ai";
import { Evidence } from "@/features/enrichment/evidence";
import { factLabel } from "@/features/enrichment/labels";
import { SourceNote } from "@/features/enrichment/source-badge";
import { Suggestions, type Fact } from "@/features/enrichment/suggestions";
import { SKIP_ANSWER } from "@/lib/domain/research";
import { formatPhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";

type Subject = { accountId: Id<"accounts"> } | { personId: Id<"people"> };
type View = NonNullable<FunctionReturnType<typeof api.research.forRecord>>;

const COLLAPSED_STEPS = 6;

const show = (field: string, value: string) =>
  field === "phone" ? formatPhone(value) : value;

const failed = (error: unknown, fallback: string) =>
  toast(readError(error, fallback).message, { tone: "danger" });

/** The record page's Agent tab, or nothing while the research agent is off. */
export function useAgentTab(subject: Subject): RecordTab[] {
  const data = useQuery(api.research.forRecord, { subject });
  if (!data) return [];
  return [
    {
      id: "agent",
      label: "Agent",
      count: data.questions.length,
      content: <AgentTab subject={subject} data={data} />,
    },
  ];
}

function AgentTab({ subject, data }: { subject: Subject; data: View }) {
  const requestNow = useMutation(api.research.requestNow);
  const undoFill = useMutation(api.research.undoFill);
  const ai = useAiEnabled();
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const { task } = data;
  const isPerson = "personId" in subject;

  async function check() {
    setBusy(true);
    try {
      await requestNow({ subject });
    } catch (error) {
      failed(error, "Couldn't start the check");
    } finally {
      setBusy(false);
    }
  }

  async function undo(fact: Fact) {
    try {
      await undoFill({ factId: fact._id });
      toast(`${factLabel(fact.field)} cleared`);
    } catch (error) {
      failed(error, "Couldn't undo that");
    }
  }

  const status = !task
    ? "Not checked yet"
    : task.running
      ? "Checking now"
      : task.due
        ? "Due for a check"
        : `Checking again ${relativeTime(task.dueAt)}${task.note ? `: ${task.note}` : ""}`;
  const steps = all ? data.steps : data.steps.slice(0, COLLAPSED_STEPS);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <p className="caption-style text-fg-tertiary" aria-live="polite">
          {status}
          {task?.lastRunAt
            ? ` · Last checked ${relativeTime(task.lastRunAt)}`
            : ""}
        </p>
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

      {task?.summary && <p className="text-sm leading-snug">{task.summary}</p>}

      {data.questions.length > 0 && (
        <Block title="Waiting on you">
          {data.questions.map((question) => (
            <Question key={question._id} question={question} />
          ))}
        </Block>
      )}

      {data.filled.length > 0 && (
        <Block title="Filled in automatically">
          {data.filled.map((fact) => (
            <li key={fact._id} className="flex flex-col gap-1 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="caption-style text-fg-tertiary">
                    {factLabel(fact.field)}
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
        </Block>
      )}

      {isPerson && data.review.length > 0 && (
        <Suggestions
          facts={data.review}
          currentValue={(field) => data.current[field]}
          display={show}
        />
      )}

      <Block title="What the agent did">
        {steps.length === 0 ? (
          <li className="text-fg-tertiary py-2.5 text-sm">
            Nothing yet. Research now starts a check.
          </li>
        ) : (
          steps.map((step) => (
            <li
              key={step._id}
              className="flex items-baseline justify-between gap-4 py-2.5 text-sm"
            >
              <span className="min-w-0 break-words">{step.text}</span>
              <span className="caption-style text-fg-tertiary shrink-0 tabular-nums">
                {relativeTime(step.at)}
              </span>
            </li>
          ))
        )}
        {data.steps.length > COLLAPSED_STEPS && (
          <li className="pt-2">
            <Button variant="ghost" size="xs" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : "Show all"}
            </Button>
          </li>
        )}
      </Block>

      {ai && (
        <AskField
          key={JSON.stringify(subject)}
          target={subject}
          noun={isPerson ? "person" : "account"}
        />
      )}
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="caption-style text-fg-tertiary">{title}</h3>
      <ul className="divide-border flex flex-col divide-y">{children}</ul>
    </section>
  );
}

function Question({ question }: { question: View["questions"][number] }) {
  const answer = useMutation(api.research.answerQuestion);
  const [pending, setPending] = useState<string | null>(null);

  async function pick(value: string) {
    setPending(value);
    try {
      await answer({ questionId: question._id, answer: value });
    } catch (error) {
      failed(error, "Couldn't save that answer");
      setPending(null);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-2.5">
      <p className="text-sm">{question.prompt}</p>
      {question.evidence && (
        <Evidence evidence={question.evidence} label="Where this came from" />
      )}
      <div className="flex flex-wrap gap-2">
        {question.options.map((option) => (
          <Button
            key={option.value}
            variant="secondary"
            size="xs"
            loading={pending === option.value}
            disabled={pending !== null}
            onClick={() => void pick(option.value)}
          >
            {option.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="xs"
          loading={pending === SKIP_ANSWER}
          disabled={pending !== null}
          onClick={() => void pick(SKIP_ANSWER)}
        >
          Not sure
        </Button>
      </div>
    </li>
  );
}
