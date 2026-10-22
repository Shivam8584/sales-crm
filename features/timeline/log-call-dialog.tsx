"use client";

import { useState, type FormEvent } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import OptionPicker from "@/components/fields/option-picker";
import { aiError, useAiEnabled } from "@/features/ai/use-ai";
import { formatDay } from "@/features/tasks/task-meta";
import { CALL_OUTCOMES, type CallOutcome } from "@/lib/domain/enums";
import { CALL_OUTCOME_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { MOD_KEY } from "@/lib/keyboard";
import { toast } from "@/stores/toast-store";
import type { TimelineTarget } from "./kinds";
import MentionTextarea, { useMentionDraft } from "./mention-textarea";

type Errors = Partial<Record<"durationMin" | "body" | "form", string>>;
type ActionItem = { title: string; dueDate: string | null; on: boolean };

const SUMMARY_MIN = 60;

/** Logs a call against a record without opening it, e.g. from a list row. */
export default function LogCallDialog({
  call,
  onClose,
}: {
  call: { target: TimelineTarget; name: string } | null;
  onClose: () => void;
}) {
  const log = useMutation(api.timeline.log);
  const createTask = useMutation(api.tasks.create);
  const summarizeCall = useAction(api.ai.summarizeCall);
  const aiEnabled = useAiEnabled();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome>("connected");
  const [duration, setDuration] = useState("");
  const draft = useMentionDraft();
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setOutcome("connected");
    setDuration("");
    draft.reset();
    setErrors({});
    setSuggestion(null);
    setActions([]);
  }

  async function summarize() {
    if (!call || summarizing) return;
    setSummarizing(true);
    try {
      const result = await summarizeCall({
        target: call.target,
        notes: draft.text.trim(),
      });
      setSuggestion(result.summary);
      setActions(result.actionItems.map((item) => ({ ...item, on: false })));
    } catch (error) {
      aiError(error, "Couldn't summarize the call");
    } finally {
      setSummarizing(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!call || saving) return;
    setSaving(true);
    try {
      await log({
        target: call.target,
        kind: "call",
        outcome,
        durationMin: duration ? Number(duration) : undefined,
        body: draft.encoded() || undefined,
      });
      const picked = actions.filter((item) => item.on);
      const results = await Promise.allSettled(
        picked.map((item) =>
          createTask({
            title: item.title,
            dueDate: item.dueDate ?? undefined,
            ...call.target,
          }),
        ),
      );
      const added = results.filter((r) => r.status === "fulfilled").length;
      onClose();
      toast(
        `Call with ${call.name} logged${added ? `, ${added} ${added === 1 ? "task" : "tasks"} added` : ""}`,
      );
      if (added < picked.length) {
        toast("Some tasks couldn't be added", { tone: "danger" });
      }
    } catch (error) {
      const { message, field } = readError(error, "Couldn't log the call");
      setErrors({
        [field === "durationMin" || field === "body" ? field : "form"]: message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={call !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-110" onCloseAutoFocus={reset}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Log call</DialogTitle>
            <DialogDescription>
              With {call?.name}. It appears on their timeline.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4">
              <div className="flex flex-col gap-2">
                <span className="caption-style text-fg-secondary">Outcome</span>
                <OptionPicker
                  value={outcome}
                  label="Outcome"
                  options={CALL_OUTCOMES.map((value) => ({
                    value,
                    label: CALL_OUTCOME_LABEL[value],
                  }))}
                  onChange={(value) =>
                    value && setOutcome(value as CallOutcome)
                  }
                  className="border-input bg-secondary mx-0 h-9 border px-3"
                />
              </div>
              <Field
                label="Minutes"
                htmlFor="log-call-duration"
                error={errors.durationMin}
              >
                <Input
                  id="log-call-duration"
                  type="number"
                  min={0}
                  max={600}
                  inputMode="numeric"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  placeholder="0"
                  aria-invalid={errors.durationMin ? true : undefined}
                  className="aria-invalid:border-danger tabular-nums"
                />
              </Field>
            </div>
            <Field label="Notes" htmlFor="log-call-notes" error={errors.body}>
              <MentionTextarea
                id="log-call-notes"
                autoFocus
                draft={draft}
                aria-invalid={errors.body ? true : undefined}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={4}
                placeholder="What was discussed? Type @ to mention a teammate."
                className="border-input bg-secondary text-foreground duration-fast ease-power3-out placeholder:text-fg-tertiary hover:border-fg-tertiary focus-visible:border-selected focus-visible:ring-selected/20 aria-invalid:border-danger field-sizing-content max-h-40 min-h-24 w-full resize-none rounded-lg border px-3 py-2.5 text-sm leading-snug transition-[border-color,box-shadow] outline-none focus-visible:ring-3 pointer-coarse:text-base"
              />
            </Field>
            {aiEnabled && draft.text.trim().length >= SUMMARY_MIN && (
              <Button
                variant="ghost"
                size="xs"
                loading={summarizing}
                onClick={() => void summarize()}
                className="-mt-2 self-start"
              >
                Summarize with AI
              </Button>
            )}
            {suggestion && (
              <div className="flex flex-col gap-2">
                <p className="caption-style text-fg-secondary leading-snug">
                  {suggestion}
                </p>
                <Button
                  variant="subtle"
                  size="xs"
                  className="self-start"
                  onClick={() => {
                    draft.setText(suggestion);
                    setSuggestion(null);
                  }}
                >
                  Use summary
                </Button>
              </div>
            )}
            {actions.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <Checkbox
                  id={`log-call-task-${index}`}
                  checked={item.on}
                  onCheckedChange={(on) =>
                    setActions(
                      actions.map((other, at) =>
                        at === index ? { ...other, on: on === true } : other,
                      ),
                    )
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor={`log-call-task-${index}`}
                  className="text-fg-secondary cursor-pointer text-sm leading-snug select-none"
                >
                  Create task: {item.title}
                  {item.dueDate && ` (due ${formatDay(item.dueDate)})`}
                </label>
              </div>
            ))}
            {errors.form && (
              <p role="alert" className="caption-style text-danger">
                {errors.form}
              </p>
            )}
          </div>
          <DialogFooter>
            <span className="caption-style text-fg-tertiary mr-auto max-sm:hidden">
              {MOD_KEY} ↵ to save
            </span>
            <DialogClose asChild>
              <Button variant="subtle" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Log call
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
