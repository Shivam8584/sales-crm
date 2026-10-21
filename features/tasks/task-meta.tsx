import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { BadgeTone } from "@/components/_common/status-badge";
import { dayAsDate, istToday } from "@/lib/domain/day";
import type { Priority, TaskStatus } from "@/lib/domain/enums";
import { cn } from "@/lib/utils";
import BarChartIcon from "@/public/assets/icons/kanban/bar-chart-12.svg";
import ClipboardCheckIcon from "@/public/assets/icons/kanban/clipboard-check.svg";
import ContrastIcon from "@/public/assets/icons/kanban/contrast-02.svg";
import ListIcon from "@/public/assets/icons/kanban/list.svg";

export type TaskRow = FunctionReturnType<typeof api.tasks.list>[number];

export const STATUS_BADGE: Record<
  TaskStatus,
  { icon: typeof ListIcon; tone: BadgeTone; text: string }
> = {
  todo: { icon: ListIcon, tone: "neutral", text: "text-fg-tertiary" },
  in_progress: { icon: ContrastIcon, tone: "info", text: "text-info" },
  done: { icon: ClipboardCheckIcon, tone: "success", text: "text-success" },
};

export function StatusIcon({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const { icon: Icon, text } = STATUS_BADGE[status];
  return (
    <Icon aria-hidden className={cn("size-3.5 shrink-0", text, className)} />
  );
}

const PRIORITY_TEXT: Record<Priority, string> = {
  urgent: "text-warning",
  high: "text-warning",
  normal: "text-info",
  low: "text-success",
};

export function PriorityIcon({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  return (
    <BarChartIcon
      aria-hidden
      className={cn("size-3.5 shrink-0", PRIORITY_TEXT[priority], className)}
    />
  );
}

/** The India calendar day `days` from today, as `YYYY-MM-DD`. */
export function dayFromToday(days = 0) {
  return istToday(days);
}

// Days are parsed as UTC midnights, so they format in UTC to keep the date.
const WEEKDAY = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  timeZone: "UTC",
});
const DAY_MONTH = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const parseDay = dayAsDate;

/** "Today", "Tomorrow", "Fri" within the week, otherwise "24 Oct". */
export function formatDay(day: string) {
  if (day === dayFromToday(0)) return "Today";
  if (day === dayFromToday(1)) return "Tomorrow";
  if (day === dayFromToday(-1)) return "Yesterday";
  const date = parseDay(day);
  if (day > dayFromToday(1) && day <= dayFromToday(6)) {
    return WEEKDAY.format(date);
  }
  return day.slice(0, 4) === dayFromToday(0).slice(0, 4)
    ? DAY_MONTH.format(date)
    : DAY_MONTH_YEAR.format(date);
}

/** Always the date itself, e.g. "24 Oct". */
export function shortDay(day: string) {
  return DAY_MONTH.format(parseDay(day));
}

export function isOverdue(task: Pick<TaskRow, "dueDate" | "status">) {
  return (
    task.status !== "done" &&
    task.dueDate !== null &&
    task.dueDate < dayFromToday(0)
  );
}

export const QUICK_DATES = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "Next week", days: 7 },
] as const;

export const DUE_GROUPS = [
  "overdue",
  "today",
  "week",
  "later",
  "none",
  "done",
] as const;
export type DueGroup = (typeof DUE_GROUPS)[number];

export const DUE_GROUP_LABEL: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No date",
  done: "Done",
};

/** Which due bucket a task falls in; done tasks have their own. */
export function dueGroup(task: Pick<TaskRow, "dueDate" | "status">): DueGroup {
  if (task.status === "done") return "done";
  if (!task.dueDate) return "none";
  const today = dayFromToday(0);
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "today";
  if (task.dueDate <= dayFromToday(6)) return "week";
  return "later";
}

export function byUrgency(a: TaskRow, b: TaskRow) {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  const priority =
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  return priority || a.position - b.position;
}

const PRIORITY_ORDER: Priority[] = ["urgent", "high", "normal", "low"];

/** The record a task is about, as a short label. */
export function recordName(
  task: Pick<TaskRow, "account" | "person" | "deal" | "lead">,
) {
  return (
    task.person?.name ??
    task.account?.name ??
    task.deal?.title ??
    task.lead?.name ??
    null
  );
}

/** For use mid-sentence: "today", "tomorrow", "on Fri", "on 24 Oct". */
export function dayPhrase(day: string) {
  const label = formatDay(day);
  return ["Today", "Tomorrow", "Yesterday"].includes(label)
    ? label.toLowerCase()
    : `on ${label}`;
}
