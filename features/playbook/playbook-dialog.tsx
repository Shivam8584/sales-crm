"use client";

import { useState, type FormEvent } from "react";
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
import { Textarea } from "@/components/_ui/textarea";
import OptionPicker from "@/components/fields/option-picker";
import TagsField from "@/components/fields/tags-field";
import {
  PLAYBOOK_KIND_LABEL,
  PLAYBOOK_KINDS,
  PLAYBOOK_LIMITS,
  type PlaybookKind,
} from "@/lib/domain/playbook";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import type { PlaybookEntry } from "./playbook-browser";

const KIND_OPTIONS = PLAYBOOK_KINDS.map((value) => ({
  value,
  label: PLAYBOOK_KIND_LABEL[value],
}));

/** Create or edit one entry; managers and admins only. */
export default function PlaybookDialog({
  open,
  entry,
  onOpenChange,
}: {
  open: boolean;
  entry?: PlaybookEntry;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <EntryForm entry={entry} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({
  entry,
  onDone,
}: {
  entry?: PlaybookEntry;
  onDone: () => void;
}) {
  const save = useMutation(api.playbook.save);
  const [kind, setKind] = useState<PlaybookKind>(entry?.kind ?? "objection");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [tags, setTags] = useState(entry?.tags ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await save({ id: entry?._id, kind, title, body, tags });
      toast(entry ? "Entry saved" : "Entry added");
      onDone();
    } catch (caught) {
      const error = readError(caught, "Couldn't save the entry");
      if (error.field) setErrors({ [error.field]: error.message });
      else toast(error.message, { tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{entry ? "Edit entry" : "New entry"}</DialogTitle>
        <DialogDescription>
          Plain text. Reps copy it into emails and messages as written.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex flex-col gap-2">
          <span className="caption-style text-fg-secondary">Kind</span>
          <OptionPicker
            value={kind}
            options={KIND_OPTIONS}
            label="Kind"
            onChange={(value) => value && setKind(value as PlaybookKind)}
            className="border-input bg-secondary mx-0 h-9 w-full border px-3"
          />
        </div>
        <Field label="Title" htmlFor="playbook-title" error={errors.title}>
          <Input
            id="playbook-title"
            autoFocus
            value={title}
            maxLength={PLAYBOOK_LIMITS.titleMax}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Is this legal?"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? "playbook-title-error" : undefined}
          />
        </Field>
        <Field
          label="Text"
          htmlFor="playbook-body"
          error={errors.body}
          hint="Leave a blank line between paragraphs."
          trailing={
            <span className="caption-style text-fg-tertiary tabular-nums">
              {body.length}/{PLAYBOOK_LIMITS.bodyMax}
            </span>
          }
        >
          <Textarea
            id="playbook-body"
            value={body}
            maxLength={PLAYBOOK_LIMITS.bodyMax}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={
              errors.body ? "playbook-body-error" : "playbook-body-hint"
            }
            className="max-h-72 min-h-40"
          />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="caption-style text-fg-secondary">Tags</span>
          <div className="border-input bg-secondary rounded-lg border px-3 py-1.5">
            <TagsField value={tags} onChange={setTags} label="Tags" />
          </div>
          {errors.tags && (
            <span
              role="alert"
              className="caption-style text-danger leading-snug"
            >
              {errors.tags}
            </span>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={saving}>
          {entry ? "Save" : "Add entry"}
        </Button>
      </DialogFooter>
    </form>
  );
}
