"use client";

import { useState, type FormEvent } from "react";
import { useAction } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { DetailSection } from "@/components/record/detail";
import { aiError, useAiEnabled } from "./use-ai";

type Target = FunctionArgs<typeof api.ai.askRecord>["target"];

/** One question box for a record; the last answer lives in this component only. */
export function AskField({ target, noun }: { target: Target; noun: string }) {
  const ask = useAction(api.ai.askRecord);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || pending) return;
    setPending(true);
    try {
      setAnswer((await ask({ target, question: text })).answer);
    } catch (error) {
      aiError(error, "Couldn't answer that");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Ask about this ${noun}`}
          autoComplete="off"
          maxLength={500}
          disabled={pending}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={`Ask about this ${noun}…`}
        />
        <Button
          type="submit"
          variant="secondary"
          size="xs"
          loading={pending}
          disabled={!question.trim()}
        >
          Ask
        </Button>
      </div>
      {answer && (
        <>
          <p className="text-sm whitespace-pre-line">{answer}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="caption-style text-fg-tertiary">
              Answered from this record&apos;s data
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setAnswer(null);
                setQuestion("");
              }}
            >
              Clear
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

/** The question box as its own sidebar section, for pages without an AI brief. */
export default function AskRecord({
  target,
  noun,
  className,
  divider,
}: {
  target: Target;
  noun: string;
  className?: string;
  divider?: boolean;
}) {
  if (!useAiEnabled()) return null;
  return (
    <DetailSection
      collapsible
      title="Ask AI"
      className={className}
      divider={divider}
    >
      <AskField key={JSON.stringify(target)} target={target} noun={noun} />
    </DetailSection>
  );
}
