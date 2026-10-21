"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
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
import { CALL_OUTCOMES, type CallOutcome } from "@/lib/domain/enums";
import { CALL_OUTCOME_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { MOD_KEY } from "@/lib/keyboard";
import { toast } from "@/stores/toast-store";
import type { TimelineTarget } from "./kinds";

type Errors = Partial<Record<"durationMin" | "body" | "form", string>>;

/** Logs a call against a record without opening it, e.g. from a list row. */
export default function LogCallDialog({
  call,
  onClose,
}: {
  call: { target: TimelineTarget; name: string } | null;
  onClose: () => void;
}) {
  const log = useMutation(api.timeline.log);
  const [outcome, setOutcome] = useState<CallOutcome>("connected");
  const [duration, setDuration] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setOutcome("connected");
    setDuration("");
    setBody("");
    setErrors({});
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
        body: body.trim() || undefined,
      });
      onClose();
      toast(`Call with ${call.name} logged`);
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
              <textarea
                id="log-call-notes"
                autoFocus
                value={body}
                onChange={(event) => setBody(event.target.value)}
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
                placeholder="What was discussed?"
                className="border-input bg-secondary placeholder:text-fg-tertiary focus-visible:border-selected focus-visible:ring-selected/20 min-h-24 w-full resize-none rounded-lg border px-3 py-2 text-sm leading-snug outline-none focus-visible:ring-3"
              />
            </Field>
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
