"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import { Input } from "@/components/_ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import type { Id } from "@/convex/_generated/dataModel";
import { useMembers } from "@/hooks/use-viewer";
import {
  PRIORITIES,
  TASK_STATUSES,
  type Priority,
  type TaskStatus,
} from "@/lib/domain/enums";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import CalendarIcon from "@/public/assets/icons/calendar.svg";
import {
  PRIORITY_TEXT,
  PriorityIcon,
  QUICK_DATES,
  StatusIcon,
  dayFromToday,
  formatDay,
  isOverdue,
  shortDay,
  type TaskRow,
} from "./task-meta";
import { useTaskActions } from "./use-task-actions";

const stop = (event: SyntheticEvent) => event.stopPropagation();

/**
 * Stops presses inside a board card (including portalled menus, whose React
 * events still bubble to the card) from starting a drag or opening the task.
 */
export function CardSafe({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      onMouseDown={stop}
      onTouchStart={stop}
      onKeyDown={stop}
      onClick={stop}
      className={cn("contents", className)}
    >
      {children}
    </span>
  );
}

export const CHIP_CLASS =
  "caption-style border-line-strong text-fg-secondary duration-fast ease-power3-out hover:bg-overlay-2 hover:text-foreground data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground focus-visible:ring-ring inline-flex h-6 min-w-0 cursor-pointer items-center gap-1 rounded-full border px-2 whitespace-nowrap outline-none transition-colors focus-visible:ring-2";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

type ChipTask = Pick<
  TaskRow,
  | "_id"
  | "title"
  | "priority"
  | "assigneeId"
  | "assignee"
  | "dueDate"
  | "status"
>;

export function StatusChip({ task }: { task: ChipTask }) {
  const { update, setDone } = useTaskActions();
  return (
    <CardSafe>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Status: ${TASK_STATUS_LABEL[task.status]}. Change status`}
          className={CHIP_CLASS}
        >
          <StatusIcon status={task.status} className="size-3" />
          {TASK_STATUS_LABEL[task.status]}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-36">
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={task.status}
            onValueChange={(value) => {
              const status = value as TaskStatus;
              if (status === task.status) return;
              if (status === "done") void setDone(task, true);
              else if (status === "todo" && task.status === "done") {
                void setDone(task, false);
              } else void update(task._id, { status }, "Status");
            }}
          >
            {TASK_STATUSES.map((status) => (
              <DropdownMenuRadioItem key={status} value={status}>
                <StatusIcon status={status} />
                {TASK_STATUS_LABEL[status]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardSafe>
  );
}

export function PriorityChip({ task }: { task: ChipTask }) {
  const { update } = useTaskActions();
  return (
    <CardSafe>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Priority: ${PRIORITY_LABEL[task.priority]}. Change priority`}
          className={cn(
            CHIP_CLASS,
            (task.priority === "urgent" || task.priority === "high") &&
              PRIORITY_TEXT[task.priority],
          )}
        >
          <PriorityIcon priority={task.priority} className="size-3" />
          {PRIORITY_LABEL[task.priority]}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-36">
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={task.priority}
            onValueChange={(value) => {
              if (value !== task.priority) {
                void update(
                  task._id,
                  { priority: value as Priority },
                  "Priority",
                );
              }
            }}
          >
            {PRIORITIES.map((priority) => (
              <DropdownMenuRadioItem key={priority} value={priority}>
                <PriorityIcon priority={priority} />
                {PRIORITY_LABEL[priority]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardSafe>
  );
}

export function AssigneeChip({ task }: { task: ChipTask }) {
  const { update } = useTaskActions();
  const members = useMembers();
  const name = task.assignee?.name ?? "Unassigned";
  const options = [...(members ?? [])];
  if (task.assignee && !options.some((m) => m._id === task.assigneeId)) {
    options.unshift({
      _id: task.assigneeId,
      name: task.assignee.name,
      email: "",
      role: "rep",
    });
  }
  return (
    <CardSafe>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Assignee: ${name}. Change assignee`}
          className={cn(CHIP_CLASS, "max-w-36 pl-1")}
        >
          <Avatar name={name} size="xs" />
          <span className="truncate">{firstName(name)}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-48">
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={task.assigneeId}
            onValueChange={(value) => {
              if (value !== task.assigneeId) {
                void update(
                  task._id,
                  { assigneeId: value as Id<"members"> },
                  "Assignee",
                );
              }
            }}
          >
            {options.map((member) => (
              <DropdownMenuRadioItem key={member._id} value={member._id}>
                <Avatar name={member.name} size="xs" />
                <span className="truncate">{member.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardSafe>
  );
}

/** Quick picks plus a date field; shared by the due chip and the task dialog. */
export function DueDateOptions({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (day: string | null, via: "pick" | "type") => void;
}) {
  const [previous, setPrevious] = useState(value);
  const [typed, setTyped] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  if (value !== previous) {
    setPrevious(value);
    if (value !== typed) setVersion(version + 1);
  }

  return (
    <div className="flex flex-col">
      {QUICK_DATES.map((item) => {
        const day = dayFromToday(item.days);
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => onChange(day, "pick")}
            className="caption-style text-fg-secondary hover:bg-overlay-2 hover:text-foreground focus-visible:bg-overlay-2 focus-visible:text-foreground duration-fast ease-power3-out flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors outline-none"
          >
            <span className="flex-1">{item.label}</span>
            <span className="text-fg-tertiary tabular-nums">
              {shortDay(day)}
            </span>
            {value === day && (
              <span aria-hidden className="bg-selected size-1.5 rounded-full" />
            )}
          </button>
        );
      })}
      <div className="bg-line-strong -mx-1 my-1 h-px" />
      <label className="flex flex-col gap-1.5 px-2 pt-1 pb-2">
        <span className="caption-style text-fg-tertiary">Pick a date</span>
        <Input
          key={version}
          type="date"
          defaultValue={value ?? ""}
          onChange={(event) => {
            const day = event.target.value;
            if (!day) return;
            setTyped(day);
            onChange(day, "type");
          }}
          className="h-control-md tabular-nums"
        />
      </label>
      {value && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onChange(null, "pick")}
          className="text-danger hover:text-danger justify-start rounded-sm"
        >
          Remove due date
        </Button>
      )}
    </div>
  );
}

// A popover rather than a menu: menus capture typing for typeahead, which breaks the date field.
export function DueChip({
  task,
  hideEmpty = false,
}: {
  task: ChipTask;
  hideEmpty?: boolean;
}) {
  const { update } = useTaskActions();
  const [open, setOpen] = useState(false);
  const overdue = isOverdue(task);
  const label = task.dueDate ? formatDay(task.dueDate) : null;

  const typing = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (typing.current) window.clearTimeout(typing.current);
    },
    [],
  );

  // Typing a date fires a change per keystroke, so wait until it settles.
  const setDue = (dueDate: string | null, via: "pick" | "type") => {
    if (typing.current) window.clearTimeout(typing.current);
    const save = () => {
      if (dueDate !== task.dueDate) {
        void update(task._id, { dueDate }, "Due date");
      }
    };
    if (via === "type") {
      typing.current = window.setTimeout(save, 700);
      return;
    }
    setOpen(false);
    save();
  };

  return (
    <CardSafe>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={
            label
              ? `Due ${label}${overdue ? ", overdue" : ""}. Change due date`
              : "Set due date"
          }
          className={cn(
            CHIP_CLASS,
            !label && "text-fg-tertiary",
            !label &&
              hideEmpty &&
              "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100",
            overdue &&
              "text-danger hover:text-danger data-[state=open]:text-danger border-current/30",
          )}
        >
          <CalendarIcon aria-hidden className="size-3 shrink-0" />
          <span className="tabular-nums">{label ?? "Due date"}</span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-56 rounded-lg p-1"
          aria-label="Set due date"
        >
          <DueDateOptions value={task.dueDate} onChange={setDue} />
        </PopoverContent>
      </Popover>
    </CardSafe>
  );
}

export default function TaskChips({ task }: { task: ChipTask }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <PriorityChip task={task} />
      <AssigneeChip task={task} />
      <DueChip task={task} />
    </div>
  );
}
