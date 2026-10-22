"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
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
import MentionTextarea, { useMentionDraft } from "./mention-textarea";

const PLACEHOLDER: Record<LoggableKind, string> = {
  note: "Write a note. @ to mention a teammate.",
  call: "What was discussed on the call?",
  meeting: "Meeting notes…",
  email: "Summary of the email…",
  whatsapp: "Summary of the WhatsApp conversation…",
};

const KIND_KEY = "timeline:kind";

function readLastKind(): LoggableKind {
  if (typeof window === "undefined") return "note";
  try {
    const stored = localStorage.getItem(KIND_KEY);
    return LOGGABLE_KINDS.find((kind) => kind === stored) ?? "note";
  } catch {
    return "note";
  }
}

/** Logs a note, call, meeting, email or WhatsApp; the last kind used is remembered. */
export default function TimelineComposer({
  target,
}: {
  target: TimelineTarget;
}) {
  const log = useMutation(api.timeline.log);
  const bodyId = useId();
  const [kind, setKindState] = useState<LoggableKind>(readLastKind);
  const draft = useMentionDraft();
  const [outcome, setOutcome] = useState<CallOutcome>("connected");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setKind(next: LoggableKind) {
    setKindState(next);
    try {
      localStorage.setItem(KIND_KEY, next);
    } catch {}
  }

  const canSubmit = kind === "note" ? draft.text.trim().length > 0 : true;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { firstTouch } = await log({
        target,
        kind,
        body: draft.encoded() || undefined,
        outcome: kind === "call" ? outcome : undefined,
        durationMin: duration ? Number(duration) : undefined,
      });
      draft.reset();
      setDuration("");
      toast(
        firstTouch
          ? `${KIND_META[kind].label} logged · SLA clock stopped`
          : `${KIND_META[kind].label} logged`,
      );
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
    <form onSubmit={submit} className="bg-well rounded-3xl p-1.5">
      <div
        role="tablist"
        aria-label="Entry type"
        className="scrollbar-none flex gap-1 overflow-x-auto p-1 pb-2 max-sm:mask-r-from-[calc(100%-1.5rem)] max-sm:pr-6"
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
                "text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-base flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-[color,background-color,scale] outline-none focus-visible:ring-2 active:scale-[0.97]",
                kind === value &&
                  "bg-background text-foreground shadow-capsule",
              )}
            >
              <meta.icon aria-hidden className="size-3" />
              {meta.label}
            </button>
          );
        })}
      </div>
      <div className="bg-background shadow-tile rounded-[1.25rem]">
        <label htmlFor={bodyId} className="sr-only">
          {KIND_META[kind].label}
        </label>
        <MentionTextarea
          id={bodyId}
          draft={draft}
          onKeyDown={onKeyDown}
          placeholder={PLACEHOLDER[kind]}
          rows={2}
          className="placeholder:text-fg-tertiary text-body block field-sizing-content max-h-60 min-h-18 w-full resize-none rounded-t-[1.25rem] bg-transparent px-4 pt-3.5 pb-2 outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
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
            className="max-sm:ml-auto"
            disabled={!canSubmit}
            loading={saving}
          >
            {kind === "note"
              ? "Add note"
              : `Log ${KIND_META[kind].label.toLowerCase()}`}
          </Button>
        </div>
      </div>
    </form>
  );
}
