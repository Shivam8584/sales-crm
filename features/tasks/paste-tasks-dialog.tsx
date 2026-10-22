"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { Textarea } from "@/components/_ui/textarea";
import MemberPicker from "@/features/members/member-picker";
import { useViewer } from "@/hooks/use-viewer";
import { ROLE_RANK } from "@/lib/domain/enums";
import { PRIORITY_LABEL } from "@/lib/domain/labels";
import { MAX_TASK_LINES, parseTaskLines } from "@/lib/domain/task-lines";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { formatDay } from "./task-meta";

export default function PasteTasksDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const viewer = useViewer();
  const createMany = useMutation(api.tasks.createMany);
  const remove = useMutation(api.tasks.remove);
  const [text, setText] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>(viewer._id);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isManager = ROLE_RANK[viewer.role] >= ROLE_RANK.manager;

  const { tasks, overflow } = useMemo(() => parseTaskLines(text), [text]);
  const valid = tasks.filter((task) => !task.error);
  const count = valid.length;

  function reset() {
    setText("");
    setAssigneeId(viewer._id);
    setError(null);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!count || saving) return;
    setSaving(true);
    try {
      const ids = await createMany({
        tasks: valid.map((task) => ({
          title: task.title,
          priority: task.priority ?? undefined,
          dueDate: task.dueDate ?? undefined,
          assigneeId: isManager ? (assigneeId as Id<"members">) : undefined,
        })),
      });
      onOpenChange(false);
      toast(`Added ${count} ${count === 1 ? "task" : "tasks"}`, () => {
        Promise.all(ids.map((id) => remove({ id }))).catch((caught) =>
          toast(readError(caught, "Couldn't undo that").message, {
            tone: "danger",
          }),
        );
      });
    } catch (caught) {
      setError(readError(caught, "Couldn't add the tasks").message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-120" onCloseAutoFocus={reset}>
        <form
          onSubmit={submit}
          noValidate
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Paste tasks</DialogTitle>
            <DialogDescription>
              Add several tasks at once, one per line.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-5">
            <Field
              label="Tasks"
              htmlFor="paste-tasks"
              hint={`Optional at the end of a line: !urgent !high !normal !low for priority, @today @tomorrow @mon–@sun or @2026-11-05 for the due date. Up to ${MAX_TASK_LINES} lines.`}
            >
              <Textarea
                id="paste-tasks"
                autoFocus
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setError(null);
                }}
                placeholder={
                  "Call Priya about GST !high @tomorrow\nSend the proposal @fri"
                }
                rows={4}
                spellCheck={false}
                className="max-h-48 min-h-28"
              />
            </Field>
            {isManager && (
              <div className="flex flex-col gap-2">
                <span className="caption-style text-fg-secondary">
                  Assignee
                </span>
                <MemberPicker
                  label="Assignee"
                  value={assigneeId}
                  onChange={setAssigneeId}
                  className="bg-well mx-0 h-10 px-3"
                />
              </div>
            )}
            {tasks.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="caption-style text-fg-secondary">
                  {count} {count === 1 ? "task" : "tasks"}
                  {!isManager && " for you"}
                </span>
                <ul className="scrollbar-none flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                  {tasks.map((task) => (
                    <li key={task.line} className="flex flex-col gap-0.5">
                      <div className="flex min-h-5.5 items-center gap-2">
                        <span
                          className={
                            task.error
                              ? "text-fg-tertiary min-w-0 flex-1 truncate text-sm line-through"
                              : "min-w-0 flex-1 truncate text-sm"
                          }
                        >
                          {task.title || "Untitled"}
                        </span>
                        {(task.priority || task.dueDate) && (
                          <span className="caption-style text-fg-tertiary shrink-0">
                            {[
                              task.priority && PRIORITY_LABEL[task.priority],
                              task.dueDate && formatDay(task.dueDate),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </div>
                      {task.error && (
                        <span className="caption-style text-danger leading-snug">
                          Line {task.line}: {task.error}. Skipped.
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {overflow > 0 && (
                  <span className="caption-style text-danger leading-snug">
                    {overflow} more {overflow === 1 ? "line" : "lines"} past the
                    first {MAX_TASK_LINES} will be ignored.
                  </span>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="caption-style text-danger">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!count}
            >
              {count
                ? `Add ${count} ${count === 1 ? "task" : "tasks"}`
                : "Add tasks"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
