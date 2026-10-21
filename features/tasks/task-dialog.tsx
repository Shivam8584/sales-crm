"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
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
import Kbd from "@/components/_ui/kbd";
import { Input } from "@/components/_ui/input";
import Skeleton from "@/components/_ui/skeleton";
import OptionPicker, { type Option } from "@/components/fields/option-picker";
import AccountPicker from "@/features/accounts/account-picker";
import MemberPicker from "@/features/members/member-picker";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import {
  PRIORITIES,
  TASK_STATUSES,
  type Priority,
  type TaskStatus,
} from "@/lib/domain/enums";
import {
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  personName,
} from "@/lib/domain/labels";
import { readError } from "@/lib/errors";
import { MOD_KEY } from "@/lib/keyboard";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import StatusBadge from "@/components/_common/status-badge";
import Pills from "./pills";
import { chipClass } from "./task-chips";
import {
  PriorityIcon,
  QUICK_DATES,
  STATUS_BADGE,
  dayFromToday,
  type TaskRow,
} from "./task-meta";
import {
  useTaskActions,
  useUpdateTask,
  type TaskPatch,
} from "./use-task-actions";

type Draft = {
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: Id<"members">;
  dueDate: string | null;
  accountId: Id<"accounts"> | null;
  personId: Id<"people"> | null;
};

type FieldName =
  | "title"
  | "notes"
  | "dueDate"
  | "assigneeId"
  | "accountId"
  | "personId"
  | "form";
type Errors = Partial<Record<FieldName, string>>;

const FIELDS = new Set<FieldName>([
  "title",
  "notes",
  "dueDate",
  "assigneeId",
  "accountId",
  "personId",
]);

const MAX_MEMBER_PILLS = 8;

const PICKER_CLASS = "border-input bg-secondary mx-0 h-9 w-full border px-3";

/** Create and edit dialog for tasks, driven by `useUiStore` create/edit state. */
export default function TaskDialog() {
  const create = useUiStore((state) => state.create);
  const edit = useUiStore((state) => state.edit);
  const setCreate = useUiStore((state) => state.setCreate);
  const setEdit = useUiStore((state) => state.setEdit);
  const creating = create?.type === "task" ? create : null;
  const editingId =
    edit?.type === "task" ? (edit.id as Id<"tasks">) : undefined;
  const open = creating !== null || editingId !== undefined;

  function close() {
    if (creating) setCreate(null);
    if (editingId) setEdit(null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-150">
        {editingId ? (
          <EditTask key={editingId} id={editingId} onClose={close} />
        ) : creating ? (
          <TaskForm
            key={JSON.stringify(creating)}
            initial={{
              status: TASK_STATUSES.includes(creating.status as TaskStatus)
                ? (creating.status as TaskStatus)
                : "todo",
              accountId: (creating.accountId as Id<"accounts">) ?? null,
              personId: (creating.personId as Id<"people">) ?? null,
            }}
            dealId={creating.dealId as Id<"deals"> | undefined}
            leadId={creating.leadId as Id<"leads"> | undefined}
            onClose={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditTask({ id, onClose }: { id: Id<"tasks">; onClose: () => void }) {
  const task = useQuery(api.tasks.get, { id });
  if (task === undefined) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Task</DialogTitle>
          <DialogDescription className="sr-only">Loading</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 py-5">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-9 w-2/3 rounded-lg" />
        </div>
      </>
    );
  }
  if (task === null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Task not found</DialogTitle>
          <DialogDescription>
            It may have been deleted by a teammate.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }
  return <TaskForm task={task} onClose={onClose} />;
}

type TaskFormProps = {
  task?: TaskRow;
  initial?: Partial<Draft>;
  dealId?: Id<"deals">;
  leadId?: Id<"leads">;
  onClose: () => void;
};

function TaskForm({ task, initial, dealId, leadId, onClose }: TaskFormProps) {
  const viewer = useViewer();
  const members = useMembers();
  const createTask = useMutation(api.tasks.create);
  const update = useUpdateTask();
  const { remove } = useTaskActions();
  const [saved] = useState<Draft>(() =>
    task
      ? {
          title: task.title,
          notes: task.notes ?? "",
          status: task.status,
          priority: task.priority,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          accountId: task.account?._id ?? null,
          personId: task.person?._id ?? null,
        }
      : {
          title: "",
          notes: "",
          status: "todo",
          priority: "normal",
          assigneeId: viewer._id,
          dueDate: null,
          accountId: null,
          personId: null,
          ...initial,
        },
  );
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);

  const people = useQuery(
    api.people.list,
    draft.accountId ? { accountId: draft.accountId } : {},
  );

  const changed = (Object.keys(draft) as (keyof Draft)[]).filter((key) =>
    key === "title" || key === "notes"
      ? draft[key].trim() !== saved[key].trim()
      : draft[key] !== saved[key],
  );
  const valid = draft.title.trim().length > 0;
  const dirty = changed.length > 0;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  }

  function changedPatch(): TaskPatch {
    const patch: Record<string, unknown> = {};
    for (const key of changed) {
      const value = draft[key];
      patch[key] = key === "notes" ? (value as string).trim() || null : value;
    }
    return patch as TaskPatch;
  }

  function showError(error: unknown, fallback: string) {
    const { message, field } = readError(error, fallback);
    setErrors({
      [field && FIELDS.has(field as FieldName) ? field : "form"]: message,
    });
  }

  async function submit(event?: FormEvent, status?: TaskStatus) {
    event?.preventDefault();
    if (!valid) {
      setErrors({ title: "Enter a title" });
      return;
    }
    setSaving(true);
    try {
      if (task) {
        const patch = changedPatch();
        if (status) patch.status = status;
        const previous = await update({ id: task._id, patch });
        onClose();
        const restore = Object.fromEntries(
          Object.keys(patch).map((key) => [
            key,
            previous[key as keyof typeof previous],
          ]),
        ) as TaskPatch;
        const message =
          status === "done"
            ? `Completed “${draft.title.trim()}”`
            : status === "todo"
              ? `Reopened “${draft.title.trim()}”`
              : "Task updated";
        toast(message, () => {
          update({ id: task._id, patch: restore }).catch((error) =>
            toast(readError(error, "Couldn't undo that").message, {
              tone: "danger",
            }),
          );
        });
      } else {
        await createTask({
          title: draft.title,
          notes: draft.notes.trim() || undefined,
          status: draft.status,
          priority: draft.priority,
          assigneeId: draft.assigneeId,
          dueDate: draft.dueDate ?? undefined,
          accountId: draft.accountId ?? undefined,
          personId: draft.personId ?? undefined,
          dealId,
          leadId,
        });
        onClose();
        toast(`Added “${draft.title.trim()}”`);
      }
    } catch (error) {
      showError(
        error,
        task ? "Couldn't save the task" : "Couldn't add the task",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!task) return;
    if (await remove(task)) onClose();
  }

  const personOptions: Option[] = (people ?? []).map((person) => ({
    value: person._id,
    label: personName(person),
    hint: person.account?.name ?? person.title ?? undefined,
    icon: <Avatar name={personName(person)} size="xs" />,
  }));
  if (
    draft.personId &&
    task?.person &&
    draft.personId === task.person._id &&
    !personOptions.some((option) => option.value === draft.personId)
  ) {
    personOptions.unshift({
      value: task.person._id,
      label: task.person.name,
      icon: <Avatar name={task.person.name} size="xs" />,
    });
  }

  const canSave = valid && !saving && (task ? dirty : true);

  const assigneeOptions = [...(members ?? [])];
  if (
    task?.assignee &&
    !assigneeOptions.some((member) => member._id === task.assigneeId)
  ) {
    assigneeOptions.unshift({
      _id: task.assigneeId,
      name: task.assignee.name,
      email: "",
      role: "rep",
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (canSave) void submit();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
        <DialogDescription>
          {task
            ? [
                `Created ${relativeTime(task._creationTime)}`,
                task.automated && "added automatically",
                task.completedAt &&
                  `completed ${relativeTime(task.completedAt)}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Something to follow up on, for you or a teammate."}
        </DialogDescription>
        {task && (task.deal || task.lead) && (
          <p className="caption-style text-fg-tertiary flex flex-wrap items-center gap-x-1.5">
            {task.deal && (
              <>
                For the deal
                <Link
                  href={`/deals/${task.deal._id}`}
                  onClick={onClose}
                  className="text-fg-secondary hover:text-foreground focus-visible:ring-ring rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                >
                  {task.deal.title}
                </Link>
              </>
            )}
            {!task.deal && task.lead && (
              <>
                For the lead
                <Link
                  href={`/leads/${task.lead._id}`}
                  onClick={onClose}
                  className="text-fg-secondary hover:text-foreground focus-visible:ring-ring rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                >
                  {task.lead.name}
                </Link>
              </>
            )}
          </p>
        )}
      </DialogHeader>
      <div className="flex flex-col gap-5 px-6 py-5">
        <Choice label="Status">
          <Pills
            label="Status"
            value={draft.status}
            onChange={(value) => set("status", value)}
            options={TASK_STATUSES.map((value) => ({
              value,
              label: TASK_STATUS_LABEL[value],
              icon: (
                <StatusBadge
                  icon={STATUS_BADGE[value].icon}
                  tone={STATUS_BADGE[value].tone}
                />
              ),
            }))}
          />
        </Choice>
        <Field label="Title" htmlFor="task-title" required error={errors.title}>
          <Input
            id="task-title"
            autoFocus
            autoComplete="off"
            maxLength={200}
            value={draft.title}
            onChange={(event) => {
              setTitleTouched(true);
              set("title", event.target.value);
            }}
            onBlur={() => {
              if (titleTouched && !draft.title.trim()) {
                setErrors((current) => ({
                  ...current,
                  title: "Enter a title",
                }));
              }
            }}
            placeholder="Call Priya about the GST certificate"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? "task-title-error" : undefined}
            className="aria-invalid:border-danger"
          />
        </Field>
        <Field label="Description" htmlFor="task-notes" error={errors.notes}>
          <textarea
            id="task-notes"
            value={draft.notes}
            maxLength={5000}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="Context, links, what was promised…"
            rows={3}
            aria-invalid={errors.notes ? true : undefined}
            className="border-input bg-secondary text-foreground placeholder:text-fg-tertiary focus-visible:border-selected focus-visible:ring-selected/20 duration-fast aria-invalid:border-danger field-sizing-content max-h-60 min-h-22 w-full resize-none rounded-lg border px-3 py-2.5 text-sm leading-snug transition-[border-color,box-shadow] outline-none focus-visible:ring-3"
          />
        </Field>
        <Choice label="Priority">
          <Pills
            label="Priority"
            value={draft.priority}
            onChange={(value) => set("priority", value)}
            options={PRIORITIES.map((value) => ({
              value,
              label: PRIORITY_LABEL[value],
              icon: <PriorityIcon priority={value} />,
            }))}
          />
        </Choice>
        <Choice label="Assignee" error={errors.assigneeId}>
          {members && members.length <= MAX_MEMBER_PILLS ? (
            <Pills
              label="Assignee"
              value={draft.assigneeId as string}
              onChange={(value) => set("assigneeId", value as Id<"members">)}
              options={assigneeOptions.map((member) => ({
                value: member._id,
                label: member.name,
                icon: <Avatar name={member.name} size="xs" className="-ml-1" />,
              }))}
            />
          ) : (
            <MemberPicker
              label="Assignee"
              value={draft.assigneeId}
              currentName={task?.assignee?.name}
              onChange={(id) => set("assigneeId", id as Id<"members">)}
              className={PICKER_CLASS}
            />
          )}
        </Choice>
        <Field
          label="Due date"
          htmlFor="task-due"
          error={errors.dueDate}
          trailing={
            <div className="-my-1 flex flex-wrap justify-end gap-1">
              {QUICK_DATES.map((item) => {
                const day = dayFromToday(item.days);
                const active = draft.dueDate === day;
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set("dueDate", active ? null : day)}
                    className={cn(
                      chipClass("sm"),
                      "text-fg-tertiary aria-pressed:text-foreground aria-pressed:shadow-[0_0_0_1px_var(--foreground)]",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          }
        >
          <Input
            id="task-due"
            type="date"
            value={draft.dueDate ?? ""}
            onChange={(event) => set("dueDate", event.target.value || null)}
            aria-invalid={errors.dueDate ? true : undefined}
            className="aria-invalid:border-danger tabular-nums"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Choice label="Account" error={errors.accountId}>
            <AccountPicker
              value={draft.accountId}
              currentName={task?.account?.name}
              onChange={(id) => {
                const accountId = id as Id<"accounts"> | null;
                const person = people?.find((p) => p._id === draft.personId);
                set("accountId", accountId);
                if (
                  draft.personId &&
                  accountId &&
                  person?.account?._id !== accountId
                ) {
                  set("personId", null);
                }
              }}
              className={PICKER_CLASS}
            />
          </Choice>
          <Choice label="Person" error={errors.personId}>
            <OptionPicker
              value={draft.personId}
              options={personOptions}
              label="Person"
              placeholder={
                people && people.length === 0 ? "No people" : "No person"
              }
              searchPlaceholder="Search people…"
              clearLabel="Remove person"
              onChange={(id) => {
                const personId = id as Id<"people"> | null;
                set("personId", personId);
                const person = people?.find((p) => p._id === personId);
                if (!draft.accountId && person?.account) {
                  set("accountId", person.account._id);
                }
              }}
              className={PICKER_CLASS}
            />
          </Choice>
        </div>
        {errors.form && (
          <p role="alert" className="caption-style text-danger">
            {errors.form}
          </p>
        )}
      </div>
      <DialogFooter className="flex-wrap">
        {task && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onDelete()}
            className="text-danger hover:bg-danger/10 hover:text-danger mr-auto"
          >
            Delete
          </Button>
        )}
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
          disabled={!valid || (task ? !dirty : false)}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          {task ? "Save changes" : "Add task"}
          <Kbd className="-mr-1 border-current/25 bg-transparent text-current opacity-75 max-sm:hidden">
            {MOD_KEY}↵
          </Kbd>
        </Button>
      </DialogFooter>
    </form>
  );
}

function Choice({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span aria-hidden className="caption-style text-fg-secondary">
        {label}
      </span>
      {children}
      {error && (
        <span role="alert" className="caption-style text-danger leading-snug">
          {error}
        </span>
      )}
    </div>
  );
}
