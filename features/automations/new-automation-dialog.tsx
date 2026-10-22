"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import SelectField from "@/components/_ui/select-field";
import {
  SUBJECT_LABEL,
  TRIGGER_KINDS,
  TRIGGER_LABEL,
  TRIGGER_SUBJECTS,
  type SubjectKind,
  type TriggerKind,
} from "@/lib/domain/automations";
import { readError } from "@/lib/errors";

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Name, trigger and record type for a blank sequence; opens the editor after. */
export default function NewAutomationDialog({
  open,
  onOpenChange,
  onBrowseTemplates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBrowseTemplates: () => void;
}) {
  const router = useRouter();
  const create = useMutation(api.automations.create);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<TriggerKind>("lead_created");
  const [subject, setSubject] = useState<SubjectKind>("lead");
  const [error, setError] = useState<{
    field?: string;
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const id = await create({
        name: name.trim() || undefined,
        subjectKind: subject,
        triggerKind: trigger,
      });
      onOpenChange(false);
      router.push(`/automations/${id}`);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New sequence</DialogTitle>
            <DialogDescription>
              Pick what starts it and which records go through it. You’ll add
              the steps on the canvas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 px-6 py-5">
            <Field
              label="Name"
              htmlFor="automation-name"
              error={error?.field === "name" ? error.message : undefined}
            >
              <Input
                id="automation-name"
                autoFocus
                value={name}
                maxLength={120}
                placeholder="Untitled sequence"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Starts when" htmlFor="automation-trigger">
              <SelectField<TriggerKind>
                id="automation-trigger"
                value={trigger}
                options={TRIGGER_KINDS.map((kind) => ({
                  value: kind,
                  label: TRIGGER_LABEL[kind],
                }))}
                onChange={(kind) => {
                  setTrigger(kind);
                  if (!TRIGGER_SUBJECTS[kind].includes(subject))
                    setSubject(TRIGGER_SUBJECTS[kind][0]);
                }}
              />
            </Field>
            <Field
              label="Enrols"
              htmlFor="automation-subject"
              error={
                error && error.field !== "name" ? error.message : undefined
              }
            >
              <SelectField<SubjectKind>
                id="automation-subject"
                value={subject}
                options={TRIGGER_SUBJECTS[trigger].map((kind) => ({
                  value: kind,
                  label: capital(SUBJECT_LABEL[kind][1]),
                }))}
                onChange={setSubject}
              />
            </Field>
          </div>
          <DialogFooter className="justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onBrowseTemplates();
              }}
            >
              Start from a template
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Create and open
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
