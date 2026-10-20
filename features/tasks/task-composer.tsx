"use client";

import { useState, type FocusEvent, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import Kbd from "@/components/_ui/kbd";
import type { TaskStatus } from "@/lib/domain/enums";
import { TASK_STATUS_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";

type TaskComposerProps = {
  status?: TaskStatus;
  assigneeId?: Id<"members">;
  accountId?: Id<"accounts">;
  personId?: Id<"people">;
  /** Accessible name, e.g. "New task in To do". */
  label?: string;
  onClose: () => void;
  className?: string;
};

/** One-line task entry: Enter adds and keeps it open for the next, Esc closes. */
export default function TaskComposer({
  status = "todo",
  assigneeId,
  accountId,
  personId,
  label = `New task in ${TASK_STATUS_LABEL[status]}`,
  onClose,
  className,
}: TaskComposerProps) {
  const create = useMutation(api.tasks.create);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await create({ title: trimmed, status, assigneeId, accountId, personId });
      setTitle("");
      setError(null);
    } catch (caught) {
      setError(readError(caught, "Couldn't add the task").message);
    } finally {
      setSaving(false);
    }
  }

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    if (
      !title.trim() &&
      !event.currentTarget.contains(event.relatedTarget as Node | null)
    ) {
      onClose();
    }
  }

  return (
    <form
      onSubmit={submit}
      onBlur={onBlur}
      aria-label={label}
      className={cn(
        "bg-card shadow-card flex flex-col gap-2 rounded-xl p-2",
        className,
      )}
    >
      <Input
        autoFocus
        value={title}
        maxLength={200}
        onChange={(event) => {
          setTitle(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        placeholder="What needs to happen?"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "task-composer-error" : undefined}
        className="h-control-md aria-invalid:border-danger"
      />
      {error && (
        <p
          id="task-composer-error"
          role="alert"
          className="caption-style text-danger px-1"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="caption-style text-fg-tertiary flex items-center gap-1 max-sm:hidden">
          <Kbd>Enter</Kbd> to add
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="xs"
            type="submit"
            loading={saving}
            disabled={!title.trim()}
          >
            Add task
          </Button>
        </div>
      </div>
    </form>
  );
}
