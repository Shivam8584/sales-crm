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
import UserIcon from "@/public/assets/icons/kanban/user-03.svg";
import {
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

export type ChipSize = "sm" | "md";

const CHIP_BASE =
  "text-fg-secondary shadow-hairline duration-fast ease-power3-out hover:text-foreground hover:shadow-[0_0_0_1px_var(--line-strong)] data-[state=open]:text-foreground data-[state=open]:shadow-[0_0_0_1px_var(--fg-tertiary)] focus-visible:ring-ring inline-flex min-w-0 cursor-pointer items-center rounded-full whitespace-nowrap outline-none transition-[color,box-shadow] focus-visible:ring-2";

/** Pill used for task properties: `md` on cards, `sm` in dense rows. */
export function chipClass(size: ChipSize = "sm") {
  return cn(
    CHIP_BASE,
    size === "md"
      ? "h-7 gap-1.5 px-2.5 text-[13px] leading-none"
      : "caption-style h-6 gap-1 px-2",
  );
}

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

export function StatusChip({
  task,
  size,
}: {
  task: ChipTask;
  size?: ChipSize;
}) {
  const { update, setDone } = useTaskActions();
  return (
    <CardSafe>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Status: ${TASK_STATUS_LABEL[task.status]}. Change status`}
          className={chipClass(size)}
        >
          <StatusIcon status={task.status} />
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

/** Priority chip with a menu; used on rows and in the composer before a task exists. */
export function PriorityPicker({
  value,
  onChange,
  size,
}: {
  value: Priority;
  onChange: (priority: Priority) => void;
  size?: ChipSize;
}) {
  return (
    <CardSafe>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Priority: ${PRIORITY_LABEL[value]}. Change priority`}
          className={chipClass(size)}
        >
          <PriorityIcon priority={value} />
          {PRIORITY_LABEL[value]}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-36">
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => {
              if (next !== value) onChange(next as Priority);
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

export function PriorityChip({
  task,
  size,
}: {
  task: ChipTask;
  size?: ChipSize;
}) {
  const { update } = useTaskActions();
  return (
    <PriorityPicker
      size={size}
      value={task.priority}
      onChange={(priority) => void update(task._id, { priority }, "Priority")}
    />
  );
}

export function AssigneeChip({
  task,
  size = "sm",
}: {
  task: ChipTask;
  size?: ChipSize;
}) {
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
          className={cn(chipClass(size), "max-w-36")}
        >
          <UserIcon
            aria-hidden
            className="text-fg-tertiary size-3.5 shrink-0"
          />
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
/** Due date chip with quick picks; `onChange` fires once a typed date settles. */
export function DuePicker({
  value,
  onChange,
  overdue = false,
  hideEmpty = false,
  size,
}: {
  value: string | null;
  onChange: (day: string | null) => void;
  overdue?: boolean;
  hideEmpty?: boolean;
  size?: ChipSize;
}) {
  const [open, setOpen] = useState(false);
  const label = value ? formatDay(value) : null;

  const typing = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (typing.current) window.clearTimeout(typing.current);
    },
    [],
  );

  // Typing a date fires a change per keystroke, so wait until it settles.
  const setDue = (day: string | null, via: "pick" | "type") => {
    if (typing.current) window.clearTimeout(typing.current);
    const save = () => {
      if (day !== value) onChange(day);
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
          title={overdue && value ? `Was due ${shortDay(value)}` : undefined}
          className={cn(
            chipClass(size),
            !label && "text-fg-tertiary",
            !label &&
              hideEmpty &&
              "opacity-0 group-hover/card:opacity-100 group-data-[cursor=true]/card:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100",
            overdue &&
              "text-danger hover:text-danger data-[state=open]:text-danger",
          )}
        >
          {overdue && label ? (
            "Overdue"
          ) : (
            <>
              <CalendarIcon
                aria-hidden
                className="text-fg-tertiary size-3.5 shrink-0"
              />
              <span className="tabular-nums">{label ?? "Due date"}</span>
            </>
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-56 rounded-lg p-1"
          aria-label="Set due date"
        >
          <DueDateOptions value={value} onChange={setDue} />
        </PopoverContent>
      </Popover>
    </CardSafe>
  );
}

export function DueChip({
  task,
  hideEmpty = false,
  size,
}: {
  task: ChipTask;
  hideEmpty?: boolean;
  size?: ChipSize;
}) {
  const { update } = useTaskActions();
  return (
    <DuePicker
      size={size}
      value={task.dueDate}
      overdue={isOverdue(task)}
      hideEmpty={hideEmpty}
      onChange={(dueDate) => void update(task._id, { dueDate }, "Due date")}
    />
  );
}

/** Priority, assignee and due chips, each with its own menu. */
export default function TaskChips({
  task,
  size = "md",
  show = () => true,
  className,
}: {
  task: ChipTask;
  size?: ChipSize;
  /** Which of "priority", "assignee" and "due" to render. */
  show?: (field: string) => boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {show("priority") && <PriorityChip task={task} size={size} />}
      {show("assignee") && <AssigneeChip task={task} size={size} />}
      {show("due") && <DueChip task={task} size={size} hideEmpty />}
    </div>
  );
}
