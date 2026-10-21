"use client";

import { useEffect, useRef, useState } from "react";
import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import SelectionBar from "@/components/data-table/selection-bar";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import CalendarIcon from "@/public/assets/icons/calendar.svg";
import CheckIcon from "@/public/assets/icons/check-circle.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import { DueDateOptions } from "./task-chips";
import { formatDay, type TaskRow } from "./task-meta";
import { useUpdateMany } from "./use-task-actions";

type Patch = FunctionArgs<
  typeof api.tasks.updateMany
>["updates"][number]["patch"];

const plural = (count: number) => (count === 1 ? "1 task" : `${count} tasks`);

/** Complete, reassign or reschedule the selected tasks at once, with undo. */
export default function TaskBulkBar({
  tasks,
  selected,
  onClear,
}: {
  tasks: TaskRow[];
  selected: Set<string>;
  onClear: () => void;
}) {
  const viewer = useViewer();
  const members = useMembers();
  const updateMany = useUpdateMany();
  const [dueOpen, setDueOpen] = useState(false);
  const typing = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (typing.current) window.clearTimeout(typing.current);
    },
    [],
  );
  const picked = tasks.filter((task) => selected.has(task._id));

  async function apply(patch: Patch, message: string, ids = picked) {
    if (ids.length === 0) return;
    try {
      const previous = await updateMany({
        updates: ids.map((task) => ({ id: task._id, patch })),
      });
      onClear();
      toast(message, () => {
        updateMany({ updates: previous }).catch((error) =>
          toast(readError(error, "Couldn't undo that").message, {
            tone: "danger",
          }),
        );
      });
    } catch (error) {
      toast(readError(error, "Couldn't update the tasks").message, {
        tone: "danger",
      });
    }
  }

  const open = picked.filter((task) => task.status !== "done");

  return (
    <SelectionBar
      count={picked.length}
      noun={["task", "tasks"]}
      onClear={onClear}
    >
      <Button
        variant="ghost"
        size="sm"
        disabled={open.length === 0}
        onClick={() =>
          void apply(
            { status: "done" },
            `Completed ${plural(open.length)}`,
            open,
          )
        }
      >
        <CheckIcon aria-hidden className="size-3.5" />
        Complete
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <UsersIcon aria-hidden className="size-3.5" />
            Assign
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="min-w-48">
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          {(members ?? []).map((member) => (
            <DropdownMenuItem
              key={member._id}
              onSelect={() =>
                void apply(
                  { assigneeId: member._id as Id<"members"> },
                  `Assigned ${plural(picked.length)} to ${member._id === viewer._id ? "you" : member.name}`,
                )
              }
            >
              <Avatar name={member.name} size="xs" />
              <span className="truncate">
                {member.name}
                {member._id === viewer._id && (
                  <span className="text-fg-tertiary"> (you)</span>
                )}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
            <CalendarIcon aria-hidden className="size-3.5" />
            Due date
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          sideOffset={10}
          className="w-56 rounded-lg p-1"
          aria-label="Set due date for the selected tasks"
        >
          <DueDateOptions
            value={null}
            onChange={(day, via) => {
              if (typing.current) window.clearTimeout(typing.current);
              const save = () => {
                setDueOpen(false);
                void apply(
                  { dueDate: day },
                  day
                    ? `Moved ${plural(picked.length)} to ${formatDay(day)}`
                    : `Cleared the due date on ${plural(picked.length)}`,
                );
              };
              // Typing a date fires a change per keystroke, so wait until it settles.
              if (via === "type") typing.current = window.setTimeout(save, 700);
              else save();
            }}
          />
        </PopoverContent>
      </Popover>
    </SelectionBar>
  );
}
