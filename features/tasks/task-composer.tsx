"use client";

import { useId, useState, type FocusEvent, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import type { Priority, TaskStatus } from "@/lib/domain/enums";
import { TASK_STATUS_LABEL } from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { DuePicker, PriorityPicker } from "./task-chips";

type TaskComposerProps = {
  status?: TaskStatus;
  assigneeId?: Id<"members">;
  accountId?: Id<"accounts">;
  personId?: Id<"people">;
  dealId?: Id<"deals">;
  leadId?: Id<"leads">;
  defaultDueDate?: string;
  /** Accessible name, e.g. "New task in To do". */
  label?: string;
  onClose: () => void;
  className?: string;
};

// Menus and popovers portal out of the form, so focus moving into them must not count as leaving.
const inPopup = (node: Node | null) =>
  node instanceof Element &&
  Boolean(
    node.closest(
      "[role=menu], [role=dialog], [data-radix-popper-content-wrapper]",
    ),
  );

/** One-line task entry with due date and priority chips: Enter adds and stays open, Esc closes. */
export default function TaskComposer({
  status = "todo",
  assigneeId,
  accountId,
  personId,
  dealId,
  leadId,
  defaultDueDate,
  label = `New task in ${TASK_STATUS_LABEL[status]}`,
  onClose,
  className,
}: TaskComposerProps) {
  const create = useMutation(api.tasks.create);
  const errorId = useId();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(defaultDueDate ?? null);
  const [priority, setPriority] = useState<Priority>("normal");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await create({
        title: trimmed,
        status,
        priority,
        dueDate: dueDate ?? undefined,
        assigneeId,
        accountId,
        personId,
        dealId,
        leadId,
      });
      setTitle("");
      setError(null);
    } catch (caught) {
      setError(readError(caught, "Couldn't add the task").message);
    } finally {
      setSaving(false);
    }
  }

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    const next = event.relatedTarget as Node | null;
    if (
      !title.trim() &&
      !event.currentTarget.contains(next) &&
      !inPopup(next)
    ) {
      onClose();
    }
  }

  return (
    <form
      onSubmit={submit}
      onBlur={onBlur}
      aria-label={label}
      className={cn("bg-card shadow-card flex flex-col rounded-2xl", className)}
    >
      <div className="flex flex-col gap-2 p-4 pb-2">
        <input
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
          aria-describedby={error ? errorId : undefined}
          className="lead-style placeholder:text-fg-tertiary min-w-0 bg-transparent leading-5 font-medium outline-none"
        />
        {error && (
          <p id={errorId} role="alert" className="caption-style text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 pb-3">
        <PriorityPicker value={priority} onChange={setPriority} />
        <DuePicker value={dueDate} onChange={setDueDate} />
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
