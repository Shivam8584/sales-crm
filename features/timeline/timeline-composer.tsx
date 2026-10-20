"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Kbd from "@/components/_ui/kbd";
import OptionPicker from "@/components/fields/option-picker";
import { CALL_OUTCOMES, type CallOutcome } from "@/lib/domain/enums";
import { CALL_OUTCOME_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { MOD_KEY } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import {
  LOGGABLE_KINDS,
  KIND_META,
  type LoggableKind,
  type TimelineTarget,
} from "./kinds";

const PLACEHOLDER: Record<LoggableKind, string> = {
  note: "Write a note…",
  call: "What was discussed on the call?",
  meeting: "Meeting notes…",
  email: "Summary of the email…",
  whatsapp: "Summary of the WhatsApp conversation…",
};

export default function TimelineComposer({
  target,
}: {
  target: TimelineTarget;
}) {
  const log = useMutation(api.timeline.log);
  const [kind, setKind] = useState<LoggableKind>("note");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState<CallOutcome>("connected");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = kind === "note" ? body.trim().length > 0 : true;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      await log({
        target,
        kind,
        body: body.trim() || undefined,
        outcome: kind === "call" ? outcome : undefined,
        durationMin: duration ? Number(duration) : undefined,
      });
      setBody("");
      setDuration("");
      toast(`${KIND_META[kind].label} logged`);
    } catch (caught) {
      setError(readError(caught, "Couldn't save that").message);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-border bg-card focus-within:border-line-strong duration-fast rounded-xl border transition-colors"
    >
      <div
        role="tablist"
        aria-label="Entry type"
        className="flex gap-1 px-2 pt-2"
      >
        {LOGGABLE_KINDS.map((value) => {
          const meta = KIND_META[value];
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                "caption-style text-fg-tertiary hover:text-foreground focus-visible:ring-ring duration-fast flex h-7 items-center gap-1.5 rounded-md px-2 transition-colors outline-none focus-visible:ring-2",
                kind === value && "bg-overlay-2 text-foreground",
              )}
            >
              <meta.icon aria-hidden className="size-3" />
              {meta.label}
            </button>
          );
        })}
      </div>
      <label htmlFor="timeline-body" className="sr-only">
        {KIND_META[kind].label}
      </label>
      <textarea
        id="timeline-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={PLACEHOLDER[kind]}
        rows={2}
        className="placeholder:text-fg-tertiary block field-sizing-content max-h-60 min-h-16 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-snug outline-none"
      />
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5">
        {kind === "call" && (
          <OptionPicker
            value={outcome}
            label="Outcome"
            onChange={(value) => value && setOutcome(value as CallOutcome)}
            options={CALL_OUTCOMES.map((value) => ({
              value,
              label: CALL_OUTCOME_LABEL[value],
            }))}
            className="border-border h-control-sm mx-0 border px-2 text-xs"
          />
        )}
        {(kind === "call" || kind === "meeting") && (
          <label className="caption-style text-fg-tertiary border-border h-control-sm flex items-center gap-1.5 rounded-md border px-2">
            <input
              type="number"
              min={0}
              max={600}
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              aria-label="Duration in minutes"
              placeholder="0"
              className="text-foreground w-8 bg-transparent text-right tabular-nums outline-none"
            />
            min
          </label>
        )}
        {error && (
          <span role="alert" className="caption-style text-danger">
            {error}
          </span>
        )}
        <span className="caption-style text-fg-tertiary ml-auto flex items-center gap-1 max-sm:hidden">
          <Kbd>{MOD_KEY}</Kbd>
          <Kbd>↵</Kbd>
        </span>
        <Button
          type="submit"
          variant="primary"
          size="xs"
          disabled={!canSubmit}
          loading={saving}
        >
          {kind === "note"
            ? "Add note"
            : `Log ${KIND_META[kind].label.toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}
