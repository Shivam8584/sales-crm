"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
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
import { formatDay } from "@/features/tasks/task-meta";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { aiError } from "./use-ai";

type Item = FunctionReturnType<typeof api.ai.parseCapture>["items"][number];
type Row = { item: Item; on: boolean };
export type CaptureRequest = FunctionArgs<typeof api.ai.parseCapture>;

const KIND_LABEL = { task: "Task", note: "Note", call: "Call" } as const;

function text(item: Item) {
  return item.kind === "task"
    ? item.title
    : item.kind === "note"
      ? item.body
      : item.summary;
}

function logTarget(item: Item) {
  if (item.dealId) return { dealId: item.dealId };
  if (item.personId) return { personId: item.personId };
  if (item.accountId) return { accountId: item.accountId };
  return null;
}

const canCreate = (item: Item) => item.kind === "task" || logTarget(item);

/** Shows what AI understood from one line; only the checked items are created, through the normal mutations. */
export function CaptureDialog({
  request,
  onClose,
}: {
  request: CaptureRequest | null;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-110">
        {shown && <CaptureBody request={shown} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CaptureBody({
  request,
  onClose,
}: {
  request: CaptureRequest;
  onClose: () => void;
}) {
  const parse = useAction(api.ai.parseCapture);
  const createTask = useMutation(api.tasks.create);
  const removeTask = useMutation(api.tasks.remove);
  const log = useMutation(api.timeline.log);
  const removeEntry = useMutation(api.timeline.remove);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unresolved, setUnresolved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    if (!started.current) {
      started.current = true;
      parse(request).then(
        (capture) => {
          if (!live.current) return;
          setRows(
            capture.items.map((item) => ({
              item,
              on: Boolean(canCreate(item)),
            })),
          );
          setUnresolved(capture.unresolved);
        },
        (failure) => {
          if (!live.current) return;
          aiError(failure, "Couldn't read that");
          onClose();
        },
      );
    }
    return () => {
      live.current = false;
    };
  }, [parse, request, onClose]);

  async function create() {
    if (!rows || saving) return;
    setSaving(true);
    setError(null);
    const undos: (() => Promise<unknown>)[] = [];
    const failed: Row[] = [];
    let message = "";
    for (const row of rows) {
      if (!row.on) continue;
      const { item } = row;
      try {
        if (item.kind === "task") {
          const id = await createTask({
            title: item.title,
            dueDate: item.dueDate ?? undefined,
            accountId: item.accountId ?? undefined,
            personId: item.personId ?? undefined,
            dealId: item.dealId ?? undefined,
          });
          undos.push(() => removeTask({ id }));
        } else {
          const target = logTarget(item);
          if (!target) continue;
          const { id } = await log(
            item.kind === "note"
              ? { target, kind: "note", body: item.body }
              : { target, kind: "call", body: item.summary },
          );
          undos.push(() => removeEntry({ id }));
        }
      } catch (failure) {
        failed.push(row);
        message = readError(failure, "Couldn't add everything").message;
      }
    }
    setSaving(false);
    if (undos.length) {
      toast(`Added ${undos.length} ${undos.length === 1 ? "item" : "items"}`, {
        undo: () =>
          void Promise.all(undos.map((undo) => undo())).catch((failure) =>
            toast(readError(failure, "Couldn't undo that").message, {
              tone: "danger",
            }),
          ),
      });
    }
    if (failed.length) {
      setRows(failed);
      setError(message);
    } else {
      onClose();
    }
  }

  const checked = rows?.filter((row) => row.on).length ?? 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add with AI</DialogTitle>
        <DialogDescription className="line-clamp-2">
          “{request.text}”
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 px-6 py-5">
        {rows === null ? (
          <p className="caption-style text-fg-tertiary">Reading that…</p>
        ) : (
          <>
            {rows.length === 0 && (
              <p className="caption-style text-fg-tertiary">
                Nothing to add from that.
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {rows.map((row, index) => {
                const { item } = row;
                const allowed = canCreate(item);
                const due =
                  item.kind === "task" && item.dueDate
                    ? `Due ${formatDay(item.dueDate)}`
                    : null;
                return (
                  <li key={index} className="flex items-start gap-3">
                    <Checkbox
                      id={`capture-${index}`}
                      checked={row.on}
                      disabled={!allowed}
                      onCheckedChange={(on) =>
                        setRows(
                          rows.map((other, at) =>
                            at === index
                              ? { ...other, on: on === true }
                              : other,
                          ),
                        )
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`capture-${index}`}
                      className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-sm leading-snug"
                    >
                      <span className="text-foreground wrap-break-word">
                        {text(item)}
                      </span>
                      <span className="caption-style text-fg-tertiary">
                        {[
                          KIND_LABEL[item.kind],
                          item.subjectName ?? "No account matched",
                          due,
                          !allowed && "can't be logged without one",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {unresolved && (
              <p className="caption-style text-fg-tertiary">
                Couldn’t place: {unresolved}
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="caption-style text-danger">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="subtle" size="sm">
            Cancel
          </Button>
        </DialogClose>
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={checked === 0}
          onClick={() => void create()}
        >
          Create
        </Button>
      </DialogFooter>
    </>
  );
}
